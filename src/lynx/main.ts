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
 * `__SetInlineStyles`, `__AddEventListener` / `__RemoveEventListener`
 * and `__FlushElementTree`.
 */

import {
  CREATE, TEXT, INSERT, REMOVE, ATTR, SET_TEXT, STYLES, LISTEN, UNLISTEN, RELEASE,
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
  function __FlushElementTree(): void
}

/** A free identifier, as on the background thread — see `./background` */
declare const lynx: any

const NO_OPTIONS = {}

/** `data-user-id` → `userId`, the dataset spelling */
const datasetKey = ( name: string ) => name.slice( 5 ).replace( /-([a-z])/g, ( _, c ) => c.toUpperCase() )

export function createApplier( page: Ref, forward: ( wire: WireEvent ) => void ){
  const
  pageId = __GetElementUniqueID( page ),
  els = new Map<number, Ref>([ [ PAGE_ID, page ] ]),
  listeners = new Map<number, Map<string, ( e: any ) => void>>()

  const create = ( tag: string ) =>
    tag === 'view' ? __CreateView( pageId )
    : tag === 'text' ? __CreateText( pageId )
    : tag === 'image' ? __CreateImage( pageId )
    : tag === 'scroll-view' ? __CreateScrollView( pageId )
    : __CreateElement( tag, pageId )

  const attr = ( el: Ref, name: string, value: string | null ) => {
    if( name === 'class' ) __SetClasses( el, value || undefined )
    else if( name === 'id' ) __SetID( el, value )
    else if( name.startsWith('data-') ) __AddDataset( el, datasetKey( name ), value ?? undefined )
    else __SetAttribute( el, name, value )
  }

  return function apply( ops: any[] ){
    for( let i = 0; i < ops.length; i += ARITY[ ops[ i ] ] + 1 ){
      const a = ops[ i + 1 ], b = ops[ i + 2 ], c = ops[ i + 3 ]

      switch( ops[ i ] ){
        case CREATE: els.set( a, create( b ) ); break
        case TEXT: els.set( a, __CreateRawText( b ) ); break
        case INSERT:
          c ? __InsertElementBefore( els.get( a )!, els.get( b )!, els.get( c ) )
            : __AppendElement( els.get( a )!, els.get( b )! )
          break
        case REMOVE: __RemoveElement( els.get( a )!, els.get( b )! ); break
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
          break
        default:
          throw new Error(`[lips] unknown op ${ops[ i ]} at ${i}`)
      }
    }

    __FlushElementTree()
  }
}

/**
 * Wire an applier to the real thread bridge. On the main thread
 * `lynx.getJSContext()` is the endpoint connected to the background.
 */
export function connectMain( page: Ref ){
  const bridge = lynx.getJSContext()
  const apply = createApplier( page, wire => bridge.dispatchEvent({ type: DOM_EVENT, data: wire }) )

  bridge.addEventListener( OPS_EVENT, ( e: { data: unknown[] } ) => apply( e.data ) )
  return apply
}
