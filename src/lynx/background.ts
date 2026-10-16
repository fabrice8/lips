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
 *   const lynxHost = createBackgroundHost( ops => send( ops ) )
 *   renderIR( ir, setup, { host: lynxHost.host } ).mount( lynxHost.root )
 */

import type { BlockIR, NodeIR } from '../ir/compiler'
import type { Host } from '../ir/host'
import { treeHost, treeNode, link, unlink, type TreeNode } from '../ir/tree'
import {
  CREATE, TEXT, INSERT, REMOVE, ATTR, SET_TEXT, STYLES, LISTEN, UNLISTEN, RELEASE,
  PAGE_ID, LYNX_TAG, LYNX_EVENT, OPS_EVENT, DOM_EVENT, type WireEvent
} from './protocol'

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
  /** Where its TEXT op's value sits in the unsent batch, and which batch */
  slot?: number
  batch?: number
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

export function createBackgroundHost( send: ( ops: unknown[] ) => void ): BackgroundHost {
  let
  seq = PAGE_ID,
  ops: unknown[] = [],
  batch = 0,
  scheduled = false

  const handlers = new Map<number, Map<string, Set<( event: any ) => void>>>()

  const flush = () => {
    scheduled = false
    if( !ops.length ) return
    const out = ops
    ops = []
    batch++
    send( out )
  }
  const emit = ( ...args: unknown[] ) => {
    ops.push( ...args )
    if( !scheduled ){
      scheduled = true
      // A promise job, not queueMicrotask: every Lynx background engine has one
      Promise.resolve().then( flush )
    }
  }

  const node = ( type: string, value = '', id = 0, real = false ): LynxNode =>
    Object.assign( treeNode( type, value ), { id, real, at: null } ) as LynxNode

  const classOf = ( n: LynxNode ) =>
    [ n.cls, n.scope && `lips-${n.scope}` ].filter( Boolean ).join(' ')

  const cssOf = ( n: LynxNode ) =>
    [ n.css, ...Object.entries( n.vars ).map( ( [ k, v ] ) => `${k}: ${v}` ) ].filter( Boolean ).join('; ')

  /** Every real id in a subtree — what the main thread can forget */
  const release = ( n: LynxNode ) => {
    for( let c = n.first; c; c = c.next ) release( c )
    if( !n.real ) return
    handlers.delete( n.id )
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
        const el = host.element( tag )
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
      emit( CREATE, el.id, el.type )
      return el
    },
    text: value => node( '#text', value, ++seq ),
    marker: label => node( '#marker', label ),

    insert( parent, n, ref ){
      link( parent, n, ref )

      // Text becomes real the first time it lands where Lynx renders text
      if( n.type === '#text' && !n.real && parent.type === 'text' ){
        n.real = true
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
      if( !n.real ) return
      n.batch === batch
        ? ops[ n.slot! ] = value
        : emit( SET_TEXT, n.id, value )
    },
    content( el, value ){
      while( el.first ) host.remove( el.first, true )
      value && host.insert( el, host.text( value ), null )
    },
    attr( el, name, value ){
      if( name === 'class' ){
        el.cls = value ?? undefined
        emit( ATTR, el.id, 'class', classOf( el ) )
      }
      else if( name === 'style' ){
        el.css = value ?? undefined
        emit( STYLES, el.id, cssOf( el ) )
      }
      else emit( ATTR, el.id, name, value )
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
    listen( el, name, fn ){
      const type = LYNX_EVENT[ name ] || name
      let byName = handlers.get( el.id )
      byName || handlers.set( el.id, byName = new Map() )

      let set = byName.get( type )
      if( !set ){
        byName.set( type, set = new Set() )
        emit( LISTEN, el.id, type )
      }
      set.add( fn )

      return () => {
        if( !set!.delete( fn ) || set!.size || !el.real ) return
        byName!.delete( type )
        emit( UNLISTEN, el.id, type )
      }
    }
  }

  const root = node( '#root', '', PAGE_ID, true )

  return {
    host, root, flush,
    receive( wire ){
      const set = handlers.get( wire.id )?.get( wire.name )
      if( set ) for( const fn of [ ...set ] ) fn( wire.event )
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
export function connectBackground(): BackgroundHost {
  const main = lynx.getCoreContext()
  const bg = createBackgroundHost( ops => main.dispatchEvent({ type: OPS_EVENT, data: ops }) )

  main.addEventListener( DOM_EVENT, ( e: { data: WireEvent } ) => bg.receive( e.data ) )
  return bg
}
