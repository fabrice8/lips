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
 * `__CreateList` with `update-list-info`, `__InvokeUIMethod` and
 * `__FlushElementTree`.
 */

import {
  CREATE, TEXT, INSERT, REMOVE, ATTR, SET_TEXT, STYLES, LISTEN, UNLISTEN, RELEASE, INVOKE,
  ARITY, PAGE_ID, OPS_EVENT, DOM_EVENT, type WireEvent
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
  function __InvokeUIMethod( el: Ref, method: string, params: object, callback: ( result: unknown ) => void ): void
  function __FlushElementTree( el?: Ref, options?: object ): void
}

/** A free identifier, as on the background thread — see `./background` */
declare const lynx: any

const NO_OPTIONS = {}
const NOOP = () => {}

/**
 * Lynx reads an empty attribute as false (`scroll-y=""` does not scroll),
 * where HTML reads a present attribute as true. These two are text that
 * may well be empty.
 */
const EMPTY_IS_TEXT = new Set([ 'value', 'placeholder' ])

/** A list's cells: in Lips's order, and in the order the list was last told */
interface ListState {
  order: number[]
  shown: number[]
  /** Cells the list has asked for: attached to it */
  attached: Set<number>
  /** Cells removed this batch: detached once the list has let them go */
  gone: [ number, Ref ][]
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

export function createApplier( page: Ref, forward: ( wire: WireEvent ) => void ){
  const
  pageId = __GetElementUniqueID( page ),
  els = new Map<number, Ref>([ [ PAGE_ID, page ] ]),
  listeners = new Map<number, Map<string, ( e: any ) => void>>(),
  lists = new Map<number, ListState>(),
  /** UI methods wait for the flush: before it the engine throws */
  invokes: [ Ref, string, object ][] = []

  /**
   * A list asks for each cell as it scrolls into view. Cells are built
   * eagerly — they are ordinary elements the background already renders —
   * so the answer is the cell at that position, attached and laid out.
   */
  const list = ( id: number ) => {
    const st: ListState = { order: [], shown: [], attached: new Set(), gone: [] }
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

  const attr = ( el: Ref, name: string, value: string | null ) => {
    if( name === 'class' ) __SetClasses( el, value || undefined )
    else if( name === 'id' ) __SetID( el, value )
    else if( name.startsWith('data-') ) __AddDataset( el, datasetKey( name ), value ?? undefined )
    else __SetAttribute( el, name, value === '' && !EMPTY_IS_TEXT.has( name ) || value )
  }

  /**
   * Tell a list what changed since it was last told: the cells that left
   * or moved, by their old positions, then the ones that arrived or
   * moved, by their new positions. Each carries the `item-key` Lynx
   * requires — the cell's id, unique and stable for its lifetime.
   */
  const commit = ( id: number, st: ListState ) => {
    const
    next = st.order.slice(),
    at = new Map( next.map( ( c, i ) => [ c, i ] ) ),
    stay = st.shown.filter( c => at.has( c ) ),
    keep = new Set( [ ...stable( stay.map( c => at.get( c )! ) ) ].map( i => stay[ i ] ) ),
    removeAction: number[] = [],
    insertAction: object[] = []

    st.shown.forEach( ( c, i ) => keep.has( c ) || removeAction.push( i ) )
    next.forEach( ( c, position ) => keep.has( c ) || insertAction.push({ position, type: 'default', 'item-key': String( c ) }) )

    st.shown = next
    const ref = els.get( id )!
    __SetAttribute( ref, 'update-list-info', { insertAction, removeAction, updateAction: [] })
    for( const [ c, cell ] of st.gone )
      at.has( c ) || st.attached.delete( c ) && __RemoveElement( ref, cell )
    st.gone = []
  }

  return function apply( ops: any[] ){
    const touched = new Set<number>()

    for( let i = 0; i < ops.length; i += ARITY[ ops[ i ] ] + 1 ){
      const a = ops[ i + 1 ], b = ops[ i + 2 ], c = ops[ i + 3 ]
      let st: ListState | undefined

      switch( ops[ i ] ){
        case CREATE: els.set( a, create( a, b ) ); break
        case TEXT: els.set( a, __CreateRawText( b ) ); break
        case INSERT:
          if( st = lists.get( a ) ){
            const at = st.order.indexOf( c )
            st.order.splice( at < 0 ? st.order.length : at, 0, b )
            touched.add( a )
          }
          else c ? __InsertElementBefore( els.get( a )!, els.get( b )!, els.get( c ) )
                 : __AppendElement( els.get( a )!, els.get( b )! )
          break
        case REMOVE:
          if( st = lists.get( a ) ){
            st.order.splice( st.order.indexOf( b ), 1 )
            st.gone.push([ b, els.get( b )! ])
            touched.add( a )
          }
          else __RemoveElement( els.get( a )!, els.get( b )! )
          break
        case ATTR: attr( els.get( a )!, b, c ); break
        case SET_TEXT: __SetAttribute( els.get( a )!, 'text', b ); break
        case STYLES: __SetInlineStyles( els.get( a )!, b ); break
        case LISTEN: {
          const fn = ( e: any ) => forward({ id: a, name: b, event: { type: e?.type ?? b, detail: e?.detail } })
          let byName = listeners.get( a )
          byName || listeners.set( a, byName = new Map() )
          byName.set( b, fn )
          __AddEventListener( els.get( a )!, b, fn, NO_OPTIONS )
          break
        }
        case UNLISTEN: {
          const fn = listeners.get( a )?.get( b )
          if( fn ){
            __RemoveEventListener( els.get( a )!, b, fn, NO_OPTIONS )
            listeners.get( a )!.delete( b )
          }
          break
        }
        case RELEASE:
          els.delete( a )
          listeners.delete( a )
          lists.delete( a )
          break
        case INVOKE: invokes.push([ els.get( a )!, b, c ]); break
        default:
          throw new Error(`[lips] unknown op ${ops[ i ]} at ${i}`)
      }
    }

    for( const id of touched ) lists.has( id ) && commit( id, lists.get( id )! )
    __FlushElementTree()
    for( const [ el, method, params ] of invokes.splice( 0 ) ) __InvokeUIMethod( el, method, params, NOOP )
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
