/**
 * The main-thread applier (RFC-006 §4.2).
 *
 * Small on purpose: it owns no Lips logic. It receives the background
 * thread's op batches (`./protocol`), applies them through Element PAPI,
 * flushes once per batch, and forwards element events back as data.
 *
 * Only the public, documented API is used (RFC-006 §5): creation,
 * `__InsertElementBefore` / `__AppendElement` / `__RemoveElement`,
 * `__SetAttribute` / `__SetClasses` / `__SetID` / `__AddDataset`,
 * `__SetInlineStyles`, `__AddEventListener` / `__RemoveEventListener`,
 * `__CreateList` with `update-list-info`, `__InvokeUIMethod`,
 * `__ElementAnimate` and `__FlushElementTree`.
 */

import {
  CREATE, TEXT, INSERT, REMOVE, ATTR, SET_TEXT, STYLES, LISTEN, UNLISTEN, RELEASE, INVOKE,
  ARITY, PAGE_ID, OPS_EVENT, DOM_EVENT, type WireEvent, type WireReply
} from './protocol'

/** An Element PAPI handle — opaque, never read or sent */
type Ref = object

declare global {
  function __GetElementUniqueID( el: Ref ): number
  function __CreateView( pageId: number ): Ref
  function __CreateText( pageId: number ): Ref
  function __CreateImage( pageId: number ): Ref
  function __CreateScrollView( pageId: number ): Ref
  function __CreateElement( tag: string, pageId: number ): Ref
  function __CreateList(
    pageId: number,
    componentAtIndex: ( list: Ref, listId: number, index: number, opId: number ) => number,
    enqueueComponent: ( list: Ref, listId: number, uid: number ) => void
  ): Ref
  function __CreateRawText( text: string ): Ref
  function __AppendElement( parent: Ref, child: Ref ): void
  function __InsertElementBefore( parent: Ref, child: Ref, ref?: Ref ): void
  function __RemoveElement( parent: Ref, child: Ref ): void
  function __SetAttribute( el: Ref, name: string, value: unknown ): void
  function __SetClasses( el: Ref, classes: string | undefined ): void
  function __SetID( el: Ref, id: string | null ): void
  function __AddDataset( el: Ref, key: string, value: unknown ): void
  function __SetInlineStyles( el: Ref, styles: unknown ): void
  function __AddEventListener( el: Ref, name: string, fn: ( e: any ) => void, options: object ): void
  function __RemoveEventListener( el: Ref, name: string, fn: ( e: any ) => void, options: object ): void
  function __InvokeUIMethod( el: Ref, method: string, params: object, callback: ( result: { code: number, data?: unknown } ) => void ): void
  function __ElementAnimate( el: Ref, args: unknown[] ): void
  function __FlushElementTree( el?: Ref, options?: object ): void
}

/** A free identifier, as on the background thread — see `./background` */
declare const lynx: any

const NOOP = () => {}

/**
 * How a listener is bound (lips#36): a `LISTEN` name carries `.capture`
 * and `.stop`, as the background spells them. Lynx decides propagation
 * where a listener is declared, by its `bind_type` (`ElementEventBindType`:
 * bubble 1, capture 2, capture-catch 3, bubble-catch 4), and reads it for
 * a `closure_type` of CORE (2): a main-thread function, as `main-thread:bind`
 * binds one, which is what the applier's listeners are. Both engines read
 * it so (native `FiberAddEventListener`, Lynx for Web `eventTypeOf`). A
 * plain callback's options would not do: native reads no catch from them,
 * and Lynx 4.1's touch path ignores `__StopPropagation` (tier B).
 */
const bindOf = ( name: string ) => {
  const capture = name.includes('.capture'), stop = name.includes('.stop')
  return { capture, closure_type: 2, bind_type: capture ? stop ? 3 : 2 : stop ? 4 : 1 }
}

/**
 * Lynx reads an empty attribute as false (`scroll-y=""` does not scroll),
 * where HTML reads a present attribute as true. These two are text that
 * may well be empty.
 */
const EMPTY_IS_TEXT = new Set([ 'value', 'placeholder' ])

/**
 * A cell's layout hints (lips#43): attributes of a `list-item` that Lynx's
 * list reads from the insert and update actions it is told, not from the
 * cell, and only as JSON: a flag is a boolean, a size a number
 * (`AdapterHelper::UpdateFiberInsertAction`). A flag is set when present,
 * as in HTML, unless `"false"`. Lynx for Web reads the attributes, so
 * they are still set on the cell too.
 */
const flag = ( v: string | null ) => v !== null && v !== 'false'
const size = ( v: string | null ) => v === null || v === '' || isNaN( +v ) ? undefined : +v
const HINTS: Record<string, ( v: string | null ) => unknown> = {
  'full-span': flag, 'sticky-top': flag, 'sticky-bottom': flag,
  'estimated-height-px': size, 'estimated-main-axis-size-px': size
}

/**
 * A list's own props (lips#47), which Lynx reads only as JSON too
 * (`ListContainerImpl::ResolveAttribute`): `span-count` counts only if
 * `IsNumber()`, `sticky` only if `IsBool()`. Every prop `@lynx-js/types`
 * declares `number` on `list`, and every typed one the engine reads beyond
 * them, matches `NUMBERS`; every `boolean` one matches `FLAGS`, which
 * is read first (`enable-dynamic-span-count`), and no string prop matches. A name list measured 0.25 KB
 * larger. A flag follows the cell hints' rule, and text that is not a
 * number goes as written. Lynx for Web gets the same attribute text.
 */
const NUMBERS = /-(count|offset|index|throttle|level|strategy)$|^layout-id$/
const FLAGS = /^(sticky$|bounces$|enable-|needs?-|should-|experimental-(?!.*strategy$)|scroll-bar-enable$|harmony-)/
const listProp = ( name: string, v: string ) => FLAGS.test( name ) ? flag( v ) : NUMBERS.test( name ) ? size( v ) ?? v : v

/**
 * Lynx's boolean attributes, on any element and on `overlay`.
 * Android and iOS read the text `"false"` as false; HarmonyOS reads them
 * with `Value::Bool()`, where any text but `""` is true (`UIBase::
 * prop_setters_`, `UIOverlay::OnPropUpdate`), so `visible="false"` would
 * show an overlay there. Written text goes as a boolean, read as Android
 * reads it (`JavaOnlyMap.getBoolean`: `"true"` or `"yes"`, any case) and
 * present-is-true as in HTML, so all three agree. Bound booleans were
 * already right (`true` is `""`, `false` removes it), and the
 * background's own ARIA sends booleans.
 */
const BOOLS = /^(visible|events-pass-through|event-through|ignore-focus|user-interaction-enabled|native-interaction-enabled|block-native-event|block-list-event|skip-redirection|enable-exposure-ui-clip|accessibility-(element|elements-hidden|exclusive-focus))$/
const on = ( v: string ) => v === '' || /^(true|yes)$/i.test( v )

/** A list's cells: in Lips's order, and in the order the list was last told */
interface ListState {
  order: number[]
  shown: number[]
  /** Cells the list has asked for: attached to it */
  attached: Set<number>
  /** Cells removed this batch: detached once the list has let them go */
  gone: [ number, Ref ][]
  /** Cells whose hints changed this batch */
  hinted: Set<number>
}

/**
 * The positions in `seq` of its longest increasing run — the cells a
 * reorder can leave in place. Everything else is removed and re-inserted.
 */
function stable( seq: number[] ){
  const tails: number[] = [], prev: number[] = []
  for( let i = 0; i < seq.length; i++ ){
    let lo = 0, hi = tails.length
    while( lo < hi ){
      const mid = ( lo + hi ) >> 1
      seq[ tails[ mid ] ] < seq[ i ] ? lo = mid + 1 : hi = mid
    }
    prev[ i ] = lo ? tails[ lo - 1 ] : -1
    tails[ lo ] = i
  }
  const keep = new Set<number>()
  for( let i = tails.length ? tails[ tails.length - 1 ] : -1; i >= 0; i = prev[ i ] ) keep.add( i )
  return keep
}

/** `data-user-id` → `userId`, the dataset spelling */
const datasetKey = ( name: string ) => name.slice( 5 ).replace( /-([a-z])/g, ( _, c ) => c.toUpperCase() )

/** A key event's fields (lynxjs.org, KeyEvent), and a touch point's (Touch) */
const KEY = [ 'key', 'repeat', 'altKey', 'ctrlKey', 'metaKey', 'shiftKey' ]
const POINT = [ 'identifier', 'x', 'y', 'pageX', 'pageY', 'clientX', 'clientY' ]

const take = ( from: any, keys: string[], to: any = {} ) => {
  if( from && typeof from === 'object' ) for( const k of keys ) k in from && ( to[ k ] = from[ k ] )
  return to
}
const points = ( list: any ) => Array.from( list || [], ( p: any ) => take( p, POINT ) )
const where = ( t: any ) => t && { id: t.id, dataset: { ...t.dataset } }

/**
 * What crosses for an event: a serializable pick of it, per kind (lips#35).
 * The engine's event holds a `ref` to itself, which cannot cross, and
 * puts much of what a handler reads outside `detail`:
 *
 *  - every event: `target` and `currentTarget`, with their `dataset`
 *  - a key event: `key`, `repeat` and the modifiers. A platform that
 *    sends it as a custom event puts them in `detail`, so both are read
 *  - a touch event: `touches` and `changedTouches`, with their positions
 */
const pick = ( e: any, type: string ) => {
  const out: any = take( e, KEY, take( e?.detail, KEY, { type: e?.type ?? type, detail: e?.detail }) )
  if( e?.touches ){
    out.touches = points( e.touches )
    out.changedTouches = points( e.changedTouches )
  }
  out.target = where( e?.target )
  out.currentTarget = where( e?.currentTarget )
  return out
}

export function createApplier( page: Ref, forward: ( wire: WireEvent | WireReply ) => void ){
  const
  pageId = __GetElementUniqueID( page ),
  els = new Map<number, Ref>([ [ PAGE_ID, page ] ]),
  listeners = new Map<number, Map<string, [ ( e: any ) => void, object ]>>(),
  /** Lynx's element ids → Lips's: an event names its target by Lynx's */
  uids = new Map<number, number>([ [ pageId, PAGE_ID ] ]),
  lists = new Map<number, ListState>(),
  /** Each cell's hints, and the list it is in */
  hints = new Map<number, Record<string, unknown>>(),
  listOf = new Map<number, number>(),
  /** UI methods wait for the flush: before it the engine throws */
  invokes: [ Ref, string, object, number ][] = []

  /**
   * A list asks for each cell as it scrolls into view. Cells are built
   * eagerly — they are ordinary elements the background already renders —
   * so the answer is the cell at that position, attached and laid out.
   */
  const list = ( id: number ) => {
    const st: ListState = { order: [], shown: [], attached: new Set(), gone: [], hinted: new Set() }
    lists.set( id, st )
    return __CreateList( pageId,
      ( ref, listID, index, operationID ) => {
        const cell = els.get( st.shown[ index ] )!, elementID = __GetElementUniqueID( cell )
        st.attached.add( st.shown[ index ] )
        __AppendElement( ref, cell )
        __FlushElementTree( cell, { triggerLayout: true, operationID, elementID, listID })
        return elementID
      },
      NOOP )
  }

  const create = ( id: number, tag: string ) =>
    tag === 'view' ? __CreateView( pageId )
    : tag === 'text' ? __CreateText( pageId )
    : tag === 'image' ? __CreateImage( pageId )
    : tag === 'scroll-view' ? __CreateScrollView( pageId )
    : tag === 'list' ? list( id )
    : __CreateElement( tag, pageId )

  const attr = ( el: Ref, name: string, value: any ) => {
    if( name === 'class' ) __SetClasses( el, value || undefined )
    else if( name === 'id' ) __SetID( el, value )
    else if( name.startsWith('data-') ) __AddDataset( el, datasetKey( name ), value ?? undefined )
    else __SetAttribute( el, name, value === '' && !EMPTY_IS_TEXT.has( name ) || value )
  }

  /**
   * Tell a list what changed since it was last told: the cells that left
   * or moved, by their old positions, then the ones that arrived or
   * moved, by their new positions. Each carries the `item-key` Lynx
   * requires — the cell's id, unique and stable for its lifetime — and
   * its hints. A cell that stayed but whose hints changed is an update,
   * by its position, with `flush: false`: its content is not rebuilt.
   */
  const commit = ( id: number, st: ListState ) => {
    const
    next = st.order.slice(),
    at = new Map( next.map( ( c, i ) => [ c, i ] ) ),
    stay = st.shown.filter( c => at.has( c ) ),
    keep = new Set( [ ...stable( stay.map( c => at.get( c )! ) ) ].map( i => stay[ i ] ) ),
    removeAction: number[] = [],
    insertAction: object[] = [],
    updateAction: object[] = []

    st.shown.forEach( ( c, i ) => keep.has( c ) || removeAction.push( i ) )
    next.forEach( ( c, position ) => keep.has( c )
      ? st.hinted.has( c ) && updateAction.push({ from: position, to: position, flush: false, type: 'default', 'item-key': String( c ), ...hints.get( c ) })
      : insertAction.push({ position, type: 'default', 'item-key': String( c ), ...hints.get( c ) }) )

    st.shown = next
    st.hinted.clear()
    const ref = els.get( id )!
    __SetAttribute( ref, 'update-list-info', { insertAction, removeAction, updateAction })
    for( const [ c, cell ] of st.gone )
      at.has( c ) || st.attached.delete( c ) && __RemoveElement( ref, cell )
    st.gone = []
  }

  return function apply( ops: any[] ){
    const touched = new Set<number>()

    for( let i = 0; i < ops.length; i += ARITY[ ops[ i ] ] + 1 ){
      const a = ops[ i + 1 ], b = ops[ i + 2 ], c = ops[ i + 3 ], d = ops[ i + 4 ]
      let st: ListState | undefined

      switch( ops[ i ] ){
        // An event names its target by Lynx's id: raw text too, which Lynx for Web hit-tests to
        case CREATE:
        case TEXT: {
          const el = ops[ i ] === CREATE ? create( a, b ) : __CreateRawText( b )
          els.set( a, el )
          uids.set( __GetElementUniqueID( el ), a )
          break
        }
        case INSERT:
          if( st = lists.get( a ) ){
            listOf.set( b, a )
            const at = st.order.indexOf( c )
            st.order.splice( at < 0 ? st.order.length : at, 0, b )
            touched.add( a )
          }
          else c ? __InsertElementBefore( els.get( a )!, els.get( b )!, els.get( c ) )
                 : __AppendElement( els.get( a )!, els.get( b )! )
          break
        case REMOVE:
          if( st = lists.get( a ) ){
            listOf.delete( b )
            st.order.splice( st.order.indexOf( b ), 1 )
            st.gone.push([ b, els.get( b )! ])
            touched.add( a )
          }
          else __RemoveElement( els.get( a )!, els.get( b )! )
          break
        case ATTR:
          // Only text is converted: a removed prop is still removed, a boolean stays one
          attr( els.get( a )!, b, typeof c !== 'string' ? c : BOOLS.test( b ) ? on( c ) : lists.has( a ) ? listProp( b, c ) : c )
          if( b in HINTS ){
            const h = hints.get( a ) || {}, list = listOf.get( a ), v = HINTS[ b ]( c )
            if( h[ b ] === v ) break
            h[ b ] = v
            hints.set( a, h )
            // A cell the list already has: told again, as an update
            if( list !== undefined && ( st = lists.get( list ) ) ){
              st.hinted.add( a )
              touched.add( list )
            }
          }
          break
        case SET_TEXT: __SetAttribute( els.get( a )!, 'text', b ); break
        case STYLES: __SetInlineStyles( els.get( a )!, b ); break
        case LISTEN: {
          const type = b.split('.')[ 0 ], options = bindOf( b )
          const fn = ( e: any ) => forward({ id: a, name: b, t: uids.get( e?.target?.uid ), event: pick( e, type ) })
          let byName = listeners.get( a )
          byName || listeners.set( a, byName = new Map() )
          byName.set( b, [ fn, options ] )
          __AddEventListener( els.get( a )!, type, fn, options )
          break
        }
        case UNLISTEN: {
          const bound = listeners.get( a )?.get( b )
          if( bound ){
            __RemoveEventListener( els.get( a )!, b.split('.')[ 0 ], ...bound )
            listeners.get( a )!.delete( b )
          }
          break
        }
        case RELEASE:
          uids.delete( __GetElementUniqueID( els.get( a )! ) )
          els.delete( a )
          listeners.delete( a )
          lists.delete( a )
          hints.delete( a )
          listOf.delete( a )
          break
        case INVOKE: invokes.push([ els.get( a )!, b, c, d ]); break
        default:
          throw new Error(`[lips] unknown op ${ops[ i ]} at ${i}`)
      }
    }

    for( const id of touched ) lists.has( id ) && commit( id, lists.get( id )! )
    __FlushElementTree()
    // `animate` is Element PAPI's own call, with Lynx's `Animation` arguments; the rest are UI methods
    for( const [ el, method, params, call ] of invokes.splice( 0 ) )
      method === 'animate' ? __ElementAnimate( el, params as unknown[] )
      : __InvokeUIMethod( el, method, params, call ? ( r: { code: number, data?: unknown } ) => forward({ call, code: r.code, data: r.data }) : NOOP )
  }
}

/**
 * The page lifecycle the native engine calls on the main thread. Lips
 * renders from the background, so there is nothing to do in them — but
 * they must exist: the Lynx 4.1 engine calls `renderPage` and throws
 * when it is missing (Lynx for Web does not call it). An app's own
 * definitions win.
 */
const LIFECYCLE = {
  processData: ( data: unknown ) => data,
  renderPage(){},
  updatePage(){}
}

/**
 * Wire an applier to the real thread bridge. On the main thread
 * `lynx.getJSContext()` is the endpoint connected to the background.
 */
export function connectMain( page: Ref ){
  for( const [ name, fn ] of Object.entries( LIFECYCLE ) )
    typeof ( globalThis as any )[ name ] === 'function' || ( ( globalThis as any )[ name ] = fn )

  const bridge = lynx.getJSContext()
  const apply = createApplier( page, wire => bridge.dispatchEvent({ type: DOM_EVENT, data: wire }) )

  bridge.addEventListener( OPS_EVENT, ( e: { data: unknown[] } ) => apply( e.data ) )
  return apply
}
