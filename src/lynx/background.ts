/**
 * The background-thread host (RFC-006 §4.2).
 *
 * The Lips runtime runs here, against a SHADOW tree: the runtime walks
 * siblings and resolves paths synchronously, and the real elements live
 * on the other thread. Every mutation that the main thread must mirror is
 * recorded as protocol ops (`./protocol`) and sent once per microtask.
 *
 * Only some shadow nodes are REAL — they exist on the main thread:
 *
 *  - elements, and the page
 *  - text, once it sits under a `text` element (Lynx renders raw text
 *    nowhere else)
 *
 * Markers, fragments and stray text never cross. Insert positions skip
 * them, so the main thread sees exactly the real children, in order.
 *
 * An element node answers the DOM element's own methods (`focus`, `blur`,
 * `scrollTo`, `scrollIntoView`, `animate`), so a `@ref` means the same on
 * both: each is a UI method, run once the batch is flushed (lips#37).
 *
 * Nor do the parts of an `<svg>` (the elements the template pass stamped
 * `lips-svg`): Lynx draws an svg as one view from a markup string, so its
 * subtree is written into its `content`, once per flush when it changed.
 *
 *   const lynxHost = createBackgroundHost( ops => send( ops ) )
 *   renderIR( ir, setup, { host: lynxHost.host } ).mount( lynxHost.root )
 */

import type { BlockIR, NodeIR } from '../ir/compiler'
import type { Host } from '../ir/host'
import { treeHost, treeNode, link, unlink, type TreeNode } from '../ir/tree'
import { A11Y, IMPLICIT, LIVE, WORDS, lynxA11y, roleOf, type Aria, type Words } from './a11y'
import {
  CREATE, TEXT, INSERT, REMOVE, ATTR, SET_TEXT, STYLES, LISTEN, UNLISTEN, RELEASE, INVOKE,
  PAGE_ID, LYNX_TAG, LYNX_EVENT, OPS_EVENT, DOM_EVENT, SVG_PART, scopeClass, type WireEvent
} from './protocol'

/** Markup text: what an attribute value or a text run may not hold as is */
const esc = ( s: string ) => s.replace( /[&<>"]/g, c => `&#${c.charCodeAt( 0 )};` )

/** Where `focus()` is input focus; anywhere else it is accessibility focus (RFC-006 §9.9) */
const INPUTS = new Set([ 'input', 'textarea' ])

/** `__ElementAnimate`'s operations, as Lynx's own `Animation` sends them */
const START = 0, PLAY = 1, PAUSE = 2, CANCEL = 3, FINISH = 4

/** A DOM `animate` option: its duration alone, or the options Lynx's `animate` reads as they are */
type AnimateOptions = number | Record<string, unknown>

/** An svg's own attributes that stay on its element rather than in its markup */
const ON_SVG = new Set([ 'class', 'style', 'id' ])

export interface LynxNode extends TreeNode {
  parent: LynxNode | null
  first: LynxNode | null
  last: LynxNode | null
  prev: LynxNode | null
  next: LynxNode | null
  /** Shared with the main thread; 0 for nodes that never cross */
  id: number
  /** Exists on the main thread */
  real: boolean
  /** The real parent the main thread has it under, if any */
  at: LynxNode | null
  /** `class` and `style` as written — merged with the scope class and variables */
  cls?: string
  css?: string
  /** Where its TEXT op's value sits in the unsent batch; the batch it was created in */
  slot?: number
  batch?: number
  /** Its ARIA (RFC-006 §4.8), the role its tag implies, its `id`, what was sent for them, what it last announced */
  aria?: Aria
  role?: string
  idv?: string
  sent?: Record<string, unknown>
  said?: string
  /** What a `@ref` calls, as on the DOM element (lips#37) */
  focus(): void
  blur(): void
  scrollTo( x?: number | { top?: number, left?: number, behavior?: string }, y?: number ): void
  scrollIntoView( arg?: boolean | { behavior?: string, block?: string, inline?: string } ): void
  animate( keyframes: unknown, options?: AnimateOptions ): { id: string, play(): void, pause(): void, cancel(): void, finish(): void }
  /** Part of an svg's markup: its SVG spelling. On an svg: the markup last sent */
  part?: string
  drawn?: string
}

export interface BackgroundOptions {
  /** Speak a live region's new text: `lynx.accessibilityAnnounce` on the real thread */
  announce?: ( text: string ) => void
  /** The spoken words for states and roles (`WORDS`), to translate them */
  words?: Words
}

export interface BackgroundHost {
  host: Host<LynxNode>
  /** The page: mount the root instance here */
  root: LynxNode
  /** An element event forwarded by the main thread */
  receive( wire: WireEvent ): void
  /** Send what is pending now instead of at the end of the microtask */
  flush(): void
}

export function createBackgroundHost( send: ( ops: unknown[] ) => void, { announce, words = WORDS }: BackgroundOptions = {} ): BackgroundHost {
  let
  seq = PAGE_ID,
  ops: unknown[] = [],
  batch = 0,
  scheduled = false

  const handlers = new Map<number, Map<string, Set<( event: any ) => void>>>()
  /** The real nodes by id, and the one the event being dispatched happened on */
  const live = new Map<number, LynxNode>()
  let target: LynxNode | undefined
  /** The element last focused, as far as this thread can know: a ref's `focus()`, or a `focus` event a template listens for */
  let focused: LynxNode | undefined
  let animations = 0
  /** What each input last reported holding — the value it already shows */
  const typed = new Map<number, string>()

  /**
   * Accessibility (RFC-006 §4.8): the elements with ARIA, the elements by
   * `id` and by the `<label for>` them, and whether any text, structure
   * or ARIA changed since the last flush. A name reads all three, across
   * elements, so any change reads every element again; only what differs
   * from what was sent is sent.
   */
  const a11y = new Set<LynxNode>(), ids = new Map<string, LynxNode>(), labels = new Map<string, LynxNode>()
  let moved = false, rendered = false

  /** What an element's content reads as: its text, or the name a part has instead */
  const read = ( n: LynxNode ): string => {
    let s = n.type === '#text' ? n.value : ''
    for( let c = n.first; c; c = c.next ) s += ' ' + name( c )
    return s.replace( /\s+/g, ' ' ).trim()
  }
  const name = ( n: LynxNode ) => n.aria?.[ 'aria-hidden' ] === 'true' ? '' : n.aria?.[ 'aria-label' ] || n.aria?.alt || read( n )
  const refs = ( list: string ) => list.trim().split( /\s+/ ).map( id => ids.get( id ) ).filter( Boolean ).map( n => name( n! ) ).join(' ')

  /** Send what each element's ARIA now comes to, and announce what live regions now say */
  const derive = () => {
    const said: string[] = []
    for( const n of a11y ){
      const a = n.aria || {}, role = roleOf( a, n.role ), label = n.idv && labels.get( n.idv )
      const out = lynxA11y( a, role, n.type === 'text', refs, () => read( n ), label ? read( label ) : '', words )
      const sent = n.sent ||= {}
      for( const k of new Set([ ...Object.keys( out ), ...Object.keys( sent ) ]) )
        out[ k ] !== sent[ k ] && emit( ATTR, n.id, k, ( sent[ k ] = out[ k ] ) ?? null )

      // A region announces its changes; an alert also its arrival, after the first render
      const live = a[ 'aria-live' ] ?? LIVE[ role ]
      if( live && live !== 'off' ){
        const text = read( n )
        text && text !== n.said && ( n.said !== undefined || live === 'assertive' && rendered ) && said.push( text )
        n.said = text
      }
    }
    moved = false
    return said
  }
  const track = ( n: LynxNode ) => {
    a11y.add( n )
    moved = true
    schedule()
  }

  /** The svgs whose markup may have changed since the last flush */
  const drawn = new Set<LynxNode>()

  /** The svg a node is drawn in: up through the parts, to the svg element */
  const svgOf = ( n: LynxNode | null ) => {
    while( n?.part ) n = n.parent
    return n?.type === 'svg' ? n : undefined
  }
  const draw = ( n: LynxNode | null ) => {
    const svg = svgOf( n )
    if( !svg ) return
    drawn.add( svg )
    schedule()
  }
  const markup = ( n: LynxNode ): string => {
    if( n.type === '#text' ) return esc( n.value )
    let inner = ''
    for( let c = n.first; c; c = c.next ) inner += markup( c )
    if( n.type[ 0 ] === '#' ) return inner

    const tag = n.part || n.type
    let attrs = ''
    for( const k in n.attrs ) k === SVG_PART || ( attrs += ` ${k}="${esc( n.attrs[ k ] )}"` )
    return `<${tag}${attrs}>${inner}</${tag}>`
  }

  const flush = () => {
    for( const svg of drawn ){
      const m = svg.real ? markup( svg ) : svg.drawn
      m !== svg.drawn && emit( ATTR, svg.id, 'content', svg.drawn = m )
    }
    drawn.clear()

    const said = moved ? derive() : []
    scheduled = false
    rendered = true
    if( !ops.length ) return
    const out = ops
    ops = []
    batch++
    send( out )
    announce && said.forEach( announce )
  }
  const schedule = () => {
    if( scheduled ) return
    scheduled = true
    // A promise job, not queueMicrotask: every Lynx background engine has one
    Promise.resolve().then( flush )
  }
  const emit = ( ...args: unknown[] ) => {
    ops.push( ...args )
    schedule()
  }

  /** A UI method on a real element, run once the batch is flushed (`./main`) */
  const invoke = ( n: LynxNode, method: string, params: unknown = {} ) => { n.real && emit( INVOKE, n.id, method, params ) }

  /**
   * The DOM element's methods, by its names and its arguments, as Lynx's
   * UI methods take them (lynxjs.org: `<input>`, `<view>`, `<scroll-view>`,
   * `animate`). A method a ref holds on the DOM holds the same here.
   */
  const UI = {
    focus( this: LynxNode ){
      focused = this
      invoke( this, INPUTS.has( this.type ) ? 'focus' : 'requestAccessibilityFocus' )
    },
    blur( this: LynxNode ){
      focused === this && ( focused = undefined )
      invoke( this, 'blur' )
    },
    /** `( x, y )` or `{ top, left, behavior }`: a scroll-view scrolls along one axis, to one offset */
    scrollTo( this: LynxNode, x?: number | { top?: number, left?: number, behavior?: string }, y?: number ){
      const o = typeof x === 'object' ? x : { left: x, top: y }
      invoke( this, 'scrollTo', { offset: o.top || o.left || 0, smooth: o.behavior === 'smooth' })
    },
    /** Lynx asks for every option explicitly: the DOM's defaults are written out */
    scrollIntoView( this: LynxNode, arg?: boolean | { behavior?: string, block?: string, inline?: string } ){
      const o = typeof arg === 'object' ? arg : { block: arg === false ? 'end' : 'start' }
      invoke( this, 'scrollIntoView', { scrollIntoViewOptions: { behavior: o.behavior === 'smooth' ? 'smooth' : 'auto', block: o.block || 'start', inline: o.inline || 'start' } })
    },
    animate( this: LynxNode, keyframes: unknown, options: AnimateOptions = {} ){
      const id = `lips-${this.id}-${++animations}`, to = ( op: number ) => () => invoke( this, 'animate', [ op, id ] )
      invoke( this, 'animate', [ START, id, keyframes, typeof options === 'number' ? { duration: options } : options ] )
      return { id, play: to( PLAY ), pause: to( PAUSE ), cancel: to( CANCEL ), finish: to( FINISH ) }
    }
  }

  const node = ( type: string, value = '', id = 0, real = false ): LynxNode =>
    Object.assign( Object.create( UI ), treeNode( type, value ), { id, real, at: null } ) as LynxNode

  const classOf = ( n: LynxNode ) =>
    [ n.cls, n.scope && scopeClass( n.scope ) ].filter( Boolean ).join(' ')

  /**
   * An svg's `width` and `height` size its drawing AND its element, as on
   * the DOM. Lynx sizes the element by its style alone (tier B: an svg
   * with only the attributes lays out 0 high), so they go first in its
   * inline style, and the template's own `style` overrides them.
   */
  const SIZE = [ 'width', 'height' ]
  const sizeOf = ( n: LynxNode ) => n.type === 'svg'
    ? SIZE.filter( k => n.attrs[ k ] ).map( k => `${k}: ${n.attrs[ k ]}${/^[\d.]+$/.test( n.attrs[ k ] ) ? 'px' : ''}` ).join('; ')
    : ''

  const cssOf = ( n: LynxNode ) =>
    [ sizeOf( n ), n.css, ...Object.entries( n.vars ).map( ( [ k, v ] ) => `${k}: ${v}` ) ].filter( Boolean ).join('; ')

  /** Every real id in a subtree — what the main thread can forget */
  const release = ( n: LynxNode ) => {
    for( let c = n.first; c; c = c.next ) release( c )
    if( !n.real ) return
    handlers.delete( n.id )
    live.delete( n.id )
    typed.delete( n.id )
    a11y.delete( n )
    n.idv && ids.get( n.idv ) === n && ids.delete( n.idv )
    n.aria?.for && labels.get( n.aria.for ) === n && labels.delete( n.aria.for )
    emit( RELEASE, n.id )
    n.real = false
  }

  const host: Host<LynxNode> = {
    ...( treeHost as unknown as Host<LynxNode> ),

    clone( block: BlockIR ){
      if( !block.nodes )
        throw new Error(`[lips] this IR has no node tree: compile it with { target: 'tree' } to render on Lynx`)

      const build = ( n: NodeIR ): LynxNode => {
        if( typeof n === 'string' ) return host.text( n )
        if( n === 0 ) return host.marker('$')

        const [ tag, attrs, children ] = n
        const el = attrs?.[ SVG_PART ] ? Object.assign( node( tag ), { part: attrs[ SVG_PART ] }) : host.element( tag )
        if( attrs ) for( const k in attrs ) host.attr( el, k, attrs[ k ] )
        children?.forEach( c => host.insert( el, build( c ), null ) )
        return el
      }

      const frag = host.fragment()
      for( const n of block.nodes ) host.insert( frag, build( n ), null )
      return frag
    },
    fragment: () => node('#fragment'),
    element( tag ){
      const el = node( LYNX_TAG[ tag ] || tag, '', ++seq, true )
      live.set( el.id, el )
      emit( CREATE, el.id, el.type )
      el.batch = batch
      if( IMPLICIT[ tag ] ){
        el.role = IMPLICIT[ tag ]
        track( el )
      }
      return el
    },
    text: value => node( '#text', value, ++seq ),
    marker: label => node( '#marker', label ),

    insert( parent, n, ref ){
      link( parent, n, ref )
      draw( parent )

      // Text becomes real the first time it lands where Lynx renders text
      moved = true
      if( n.type === '#text' && !n.real && parent.type === 'text' && !parent.part ){
        n.real = true
        live.set( n.id, n )
        emit( TEXT, n.id, n.value )
        n.slot = ops.length - 1
        n.batch = batch
      }
      if( !n.real ) return

      n.at && emit( REMOVE, n.at.id, n.id )
      n.at = null
      if( !parent.real ) return

      let r = n.next
      while( r && !r.real ) r = r.next
      emit( INSERT, parent.id, n.id, r ? r.id : 0 )
      n.at = parent
    },
    insertAfter( ref, nodes ){
      const parent = ref.parent
      if( !parent ) return
      let anchor = ref
      for( const n of nodes ){
        host.insert( parent, n, anchor.next )
        anchor = n
      }
    },
    remove( n, gone ){
      moved = true
      draw( n.parent )
      unlink( n )
      n.at && emit( REMOVE, n.at.id, n.id )
      n.at = null
      gone && release( n )
    },

    /**
     * A text bind creates its node empty and fills it in the same pass.
     * While the TEXT op is still unsent, the value goes into it — one op
     * per text instead of two, which on a 1k-row list is 2k fewer.
     */
    setText( n, value ){
      n.value = value
      moved = true
      if( !n.real ) return draw( n.parent )
      n.batch === batch
        ? ops[ n.slot! ] = value
        : emit( SET_TEXT, n.id, value )
    },
    /** `@text` and `@format`: in a text of its own when the element is not one */
    content( el, value ){
      while( el.first ) host.remove( el.first, true )
      if( !value ) return
      const t = el.type === 'text' ? el : host.element('text')
      t === el || host.insert( el, t, null )
      host.insert( t, host.text( value ), null )
    },
    attr( el, name, value ){
      // In an svg's markup: kept for it, not sent (the svg's class, style, id, data-* and ARIA stay on its element)
      if( el.part || el.type === 'svg' && !ON_SVG.has( name ) && !name.startsWith('data-') && !A11Y.has( name ) ){
        value === null ? delete el.attrs[ name ] : el.attrs[ name ] = value
        draw( el )
        el.part || !SIZE.includes( name ) || emit( STYLES, el.id, cssOf( el ) )
      }
      else if( name === 'class' ){
        el.cls = value ?? undefined
        emit( ATTR, el.id, 'class', classOf( el ) )
      }
      else if( name === 'style' ){
        el.css = value ?? undefined
        emit( STYLES, el.id, cssOf( el ) )
      }
      /**
       * Lynx inputs are uncontrolled: the attribute sets the first value
       * only, `setValue` every one after (RFC-006 §4.5). A value the input
       * itself reported is already on screen — writing it back would race
       * the user's next keystroke — so it is not sent.
       */
      else if( name === 'value' && ( el.type === 'input' || el.type === 'textarea' ) && el.batch !== batch ){
        value !== typed.get( el.id ) && emit( INVOKE, el.id, 'setValue', { value: value ?? '' })
      }
      /**
       * ARIA is read here, not sent: Lynx has its own attributes (`./a11y`).
       * So is `disabled` on a button: Lynx has no disabled view and does
       * not block its tap (lips#41). It is sent as `aria-disabled` is, and
       * `receive` drops the taps inside it.
       */
      else if( A11Y.has( name ) || name === 'disabled' && el.role === 'button' ){
        const a = el.aria ||= {}
        if( name === 'for' ){
          a.for && labels.get( a.for ) === el && labels.delete( a.for )
          value && labels.set( value, el )
          // The labelled element is read again, wherever it is
          const target = value && ids.get( value )
          target && track( target )
        }
        value === null ? delete a[ name ] : a[ name ] = value
        track( el )
      }
      else {
        if( name === 'id' ){
          el.idv && ids.get( el.idv ) === el && ids.delete( el.idv )
          el.idv = value ?? undefined
          value && ids.set( value, el )
          // What labels or names it is read again, and it may be labelled now
          moved = true
          labels.has( value! ) && track( el )
        }
        emit( ATTR, el.id, name, value )
      }
    },
    styleVar( el, prop, value ){
      value === null ? delete el.vars[ prop ] : el.vars[ prop ] = value
      emit( STYLES, el.id, cssOf( el ) )
    },
    scope( el, nsp ){
      if( el.scope ) return
      el.scope = nsp
      emit( ATTR, el.id, 'class', classOf( el ) )
    },
    /** The element last focused, focused again once a swap has moved it (`Host.keepFocus`) */
    keepFocus(){
      const f = focused
      return () => { f?.real && f.at && ( f as any ).focus() }
    },
    /**
     * Modifiers (lips#36, `Host.listen`) become how the main thread binds:
     * `tap`, `tap.stop` (Lynx's catch), `tap.capture`, `tap.capture.stop`.
     * `.outside` is a capture listener on the PAGE, which has the event
     * before anything on the way can stop it, and runs the handler only
     * when the event's target is not inside the element.
     */
    listen( el, name, fn ){
      // An svg's parts are not elements: they have no events (LIPS-L108)
      if( el.part ) return () => {}
      const
      [ ev, ...m ] = name.split('.'),
      outside = m.includes('outside'),
      on = outside ? root : el,
      type = ( LYNX_EVENT[ ev ] || ev ) + ( outside || m.includes('capture') ? '.capture' : '' ) + ( !outside && m.includes('stop') ? '.stop' : '' ),
      f = outside ? ( e: any ) => { within( target, el ) || fn( e ) } : fn

      let byName = handlers.get( on.id )
      byName || handlers.set( on.id, byName = new Map() )

      let set = byName.get( type )
      if( !set ){
        byName.set( type, set = new Set() )
        emit( LISTEN, on.id, type )
      }
      set.add( f )

      return () => {
        if( !set!.delete( f ) || set!.size || !on.real ) return
        byName!.delete( type )
        emit( UNLISTEN, on.id, type )
      }
    }
  }

  const root = node( '#root', '', PAGE_ID, true )

  const within = ( n: LynxNode | null | undefined, el: LynxNode ) => {
    for( ; n; n = n.parent ) if( n === el ) return true
    return false
  }
  /** Inside a disabled button (lips#41) */
  const off = ( n: LynxNode | null | undefined ) => {
    for( ; n; n = n.parent ) if( n.aria?.disabled != null ) return true
    return false
  }

  return {
    host, root, flush,
    /**
     * The event arrives DOM-shaped already (`e.key`, `e.touches[0].clientX`,
     * `e.target.dataset`: `./main` picks it so). What an input reported
     * joins its target, as `e.target.value` reads on the DOM.
     */
    receive( wire ){
      const set = handlers.get( wire.id )?.get( wire.name ), event: any = wire.event, value = event.detail?.value

      // A tap inside a disabled button reaches no handler, as the DOM fires no click for it, there or above it
      if( event.type === 'tap' && off( live.get( wire.t! ) || live.get( wire.id ) ) ) return

      if( typeof value === 'string' ){
        typed.set( wire.id, value )
        event.target = { ...event.target, value }
      }
      target = live.get( wire.t! )
      wire.name === 'focus' ? focused = live.get( wire.id ) : wire.name === 'blur' && focused?.id === wire.id && ( focused = undefined )
      if( set ) for( const fn of [ ...set ] ) fn( event )
    }
  }
}

/**
 * `lynx` is a free identifier on purpose: Lynx's background runtime hands
 * it to the bundle's module wrapper as a parameter, and it is NOT on
 * `globalThis` there (Lynx for Web: `getCoreContext` of undefined).
 */
declare const lynx: any

/**
 * Wire a background host to the real thread bridge. On the background
 * thread `lynx.getCoreContext()` is the endpoint connected to the main
 * thread, both ways.
 */
export function connectBackground( words?: Words ): BackgroundHost {
  const main = lynx.getCoreContext()
  const bg = createBackgroundHost( ops => main.dispatchEvent({ type: OPS_EVENT, data: ops }), {
    words,
    // A native module: absent on Lynx for Web, and in apps that leave it out
    announce: content => lynx.accessibilityAnnounce?.({ content }, () => {})
  })

  main.addEventListener( DOM_EVENT, ( e: { data: WireEvent } ) => bg.receive( e.data ) )
  return bg
}
