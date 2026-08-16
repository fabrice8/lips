/**
 * Phase 2 — reactivity core (RFC-001 §6)
 *
 * Minimal per-key signals: no history (that's the opt-in
 * `historySignal` wrapper, later), no deep proxies, no digest.
 * A write notifies exactly the effects that read that signal.
 */

type Effect = {
  run: () => void
  deps: Set<Set<Effect>>
  disposed: boolean
}

let CURRENT: Effect | null = null

/**
 * Batching. Inside `batch()` a notification is queued on its signal
 * rather than run, and the queue is a Set — so N writes to the same key
 * collapse to ONE notification when the outermost batch exits.
 *
 * This is what turns an animation loop over a reactive list from O(N²)
 * into O(N): a nested write force-notifies its top key's subscribers
 * (see `deepWrap`), and the keyed `<for>` is one of them.
 */
let BATCH_DEPTH = 0
const PENDING = new Set<() => void>()

/**
 * Drain iteratively: an effect may itself write, queueing more work.
 * Re-enter the batch around each pass so those collapse too, instead of
 * running eagerly one at a time.
 */
function drain(){
  while( PENDING.size ){
    const queued = [ ...PENDING ]
    PENDING.clear()
    BATCH_DEPTH++
    try { for( const notify of queued ) notify() }
    finally { BATCH_DEPTH-- }
  }
}

export function batch<T>( fn: () => T ): T {
  BATCH_DEPTH++
  // NB: never `return` from the finally — it would discard fn()'s value
  try { return fn() }
  finally {
    BATCH_DEPTH--
    !BATCH_DEPTH && drain()
  }
}

export function signal<T>( value: T ): [ () => T, ( next: T ) => void, () => void ] {
  const subs = new Set<Effect>()

  /**
   * Queueing and running are separate on purpose: the drain must be able
   * to RUN a queued flush unconditionally. If it went back through
   * `notify` it would see a raised depth and re-queue itself forever.
   */
  const flush = () => {
    // Copy: effects may retrack while running
    for( const e of [ ...subs ] )
      !e.disposed && e.run()
  }
  const notify = () => {
    BATCH_DEPTH ? PENDING.add( flush ) : flush()
  }

  const read = () => {
    if( CURRENT && !CURRENT.disposed ){
      subs.add( CURRENT )
      CURRENT.deps.add( subs )
    }
    return value
  }
  const write = ( next: T ) => {
    if( Object.is( next, value ) ) return
    value = next
    notify()
  }
  /**
   * Force-notify without a value change — the deep-reactive
   * facade uses this when nested content mutates in place.
   */
  const touch = () => notify()

  return [ read, write, touch ]
}

export interface EffectHandle {
  dispose(): void
}

export function effect( fn: () => void ): EffectHandle {
  const e: Effect = {
    deps: new Set(),
    disposed: false,
    run(){
      if( e.disposed ) return

      // Re-track from scratch each run
      for( const subs of e.deps ) subs.delete( e )
      e.deps.clear()

      const prev = CURRENT
      CURRENT = e
      try { fn() }
      finally { CURRENT = prev }
    }
  }

  e.run()

  return {
    dispose(){
      e.disposed = true
      for( const subs of e.deps ) subs.delete( e )
      e.deps.clear()
    }
  }
}

/** Run `fn` without dependency tracking */
export function untrack<T>( fn: () => T ): T {
  const prev = CURRENT
  CURRENT = null
  try { return fn() }
  finally { CURRENT = prev }
}

const IS_REACTIVE = Symbol('lips.reactive')
/** Marks a collection proxy and exposes its notifier + raw target */
const COLLECTION_META = Symbol('lips.collection')

interface CollectionMeta {
  raw: Map<any, any> | Set<any>
  notify: Set<() => void>
}

/**
 * Per-key reactive facade over a plain object:
 * reading a key inside an effect subscribes to that key;
 * writing notifies only that key's subscribers.
 * Idempotent — wrapping a reactive object returns it as-is.
 *
 * Shallow by default (RFC §6). `deep: true` opts into nested
 * mutation tracking: plain objects/arrays read through a key are
 * lazily proxied, and any nested write force-notifies that top
 * key's subscribers (coarse but O(subscribers-of-key)).
 */
/**
 * Shared across every reactive store: a collection reached from two
 * stores (parent `state.x`, child `input.x`) must resolve to ONE
 * proxy, so a mutation through either notifies both.
 */
const COLLECTION_PROXIES = new WeakMap<object, any>()

export function reactive<T extends object>( obj: T, deep = false ): T {
  if( ( obj as any )[ IS_REACTIVE ] ) return obj

  const sigs = new Map<PropertyKey, [ () => any, ( v: any ) => void, () => void ]>()
  const wrapped = deep ? new WeakMap<object, any>() : null

  const sigFor = ( key: PropertyKey, initial: any ) => {
    let s = sigs.get( key )
    if( !s ){
      s = signal( initial )
      sigs.set( key, s )
    }
    return s
  }

  /** Plain objects/arrays/Maps/Sets are deep-wrapped (Date/class instances pass through) */
  const isPlain = ( v: any ) =>
    v !== null && typeof v === 'object'
    && ( Array.isArray( v ) || Object.getPrototypeOf( v ) === Object.prototype )

  const isCollection = ( v: any ) =>
    v instanceof Map || v instanceof Set
    || !!( v && typeof v === 'object' && v[ COLLECTION_META ] )

  /**
   * Array mutators write several times (push sets an index AND
   * length). Run them atomically so one operation is one
   * notification, not one per internal write.
   */
  const ARRAY_MUTATORS = new Set([ 'push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin' ])
  /** Map/Set methods that mutate — each notifies once */
  const COLLECTION_MUTATORS = new Set([ 'set', 'delete', 'clear', 'add' ])

  /**
   * Map/Set proxies break internal-slot access ([[MapData]]), so
   * collections are wrapped by BINDING their methods to the target:
   * reads work natively; mutators notify. Values read out of the
   * collection are deep-wrapped in turn, so nested trees of Maps
   * (e.g. a recursive layers tree) stay reactive at the top key.
   */
  const wrapCollection = ( coll: any, touch: () => void ): any => {
    /**
     * Identity-stable wrapping. The same Map can be reached from
     * several reactive stores — a parent's `state.layers` and the
     * child's `input.list` are the same object. Re-wrapping would
     * give each store a private proxy whose mutations only notify
     * its own subscribers, so a `.set()` through one would be
     * invisible to the other. Instead ONE proxy is reused and every
     * interested store adds its notifier.
     */
    const existing: CollectionMeta | undefined = coll[ COLLECTION_META ]
    if( existing ){
      existing.notify.add( touch )
      return coll
    }

    const hit = COLLECTION_PROXIES.get( coll )
    if( hit ){
      ;( hit as any )[ COLLECTION_META ].notify.add( touch )
      return hit
    }

    const meta: CollectionMeta = { raw: coll, notify: new Set([ touch ]) }
    const notifyAll = () => meta.notify.forEach( fn => fn() )

    const proxy = new Proxy( coll, {
      get( t: any, k ){
        if( k === COLLECTION_META ) return meta

        // size and other data properties
        const v = ( t as any )[ k ]
        if( typeof v !== 'function' ) return v

        if( typeof k === 'string' && COLLECTION_MUTATORS.has( k ) )
          return ( ...args: any[] ) => {
            const result = v.apply( t, args )
            notifyAll()
            return result
          }

        // Readers: bind to the raw target, deep-wrap returned values
        if( k === 'get' )
          return ( key: any ) => {
            const out = ( t as Map<any, any> ).get( key )
            return isPlain( out ) ? deepWrap( out, notifyAll )
                  : isCollection( out ) ? wrapCollection( out, notifyAll )
                  : out
          }

        return v.bind( t )
      }
    })

    COLLECTION_PROXIES.set( coll, proxy )
    return proxy
  }

  const deepWrap = ( value: any, touch: () => void ): any => {
    if( !deep ) return value
    if( isCollection( value ) ) return wrapCollection( value, touch )
    if( !isPlain( value ) ) return value

    const hit = wrapped!.get( value )
    if( hit ) return hit

    let muted = false

    const proxy = new Proxy( value, {
      get( t: any, k ){
        const v = t[ k ]

        if( Array.isArray( t ) && typeof k === 'string' && ARRAY_MUTATORS.has( k ) && typeof v === 'function' )
          return ( ...args: any[] ) => {
            muted = true
            try { return v.apply( t, args ) }
            finally {
              muted = false
              touch()
            }
          }

        return isPlain( v ) || isCollection( v ) ? deepWrap( v, touch ) : v
      },
      set( t: any, k, v ){
        t[ k ] = v
        !muted && touch()
        return true
      },
      deleteProperty( t: any, k ){
        delete t[ k ]
        !muted && touch()
        return true
      }
    })

    wrapped!.set( value, proxy )
    return proxy
  }

  return new Proxy( obj, {
    get( target: any, key ){
      if( key === IS_REACTIVE ) return true
      if( typeof key === 'string' ){
        const s = sigFor( key, target[ key ] )
        return deepWrap( s[0](), s[2] )
      }
      return target[ key ]
    },
    set( target: any, key, value ){
      const prev = target[ key ]
      target[ key ] = value

      if( typeof key !== 'string' ) return true

      const sig = sigFor( key, value )
      /**
       * Re-assigning the SAME collection is not a no-op: collections
       * mutate in place, so an unchanged reference can still hold new
       * contents (a parent's `.set()` reaching a child's input). The
       * signal's Object.is check would swallow it — touch instead.
       */
      Object.is( prev, value ) && isCollection( value )
        ? sig[2]()
        : sig[1]( value )

      return true
    },
    has( target, key ){ return key in target },
    deleteProperty( target: any, key ){
      delete target[ key ]
      typeof key === 'string' && sigs.get( key )?.[1]( undefined )
      return true
    }
  }) as T
}
