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

/**
 * Queued EFFECTS, not queued signals. One effect commonly subscribes to
 * many channels — a keyed `<for>` reads `length` and every index — so
 * deduplicating per signal would still run it once per channel. The
 * Set collapses to one run per effect.
 */
const PENDING = new Set<Effect>()

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
    try { for( const e of queued ) !e.disposed && e.run() }
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

  const notify = () => {
    if( BATCH_DEPTH ){
      for( const e of subs ) PENDING.add( e )
      return
    }
    // Copy: effects may retrack while running
    for( const e of [ ...subs ] )
      !e.disposed && e.run()
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

/** Plain objects/arrays are deep-wrapped (Date/class instances pass through) */
const isPlain = ( v: any ) =>
  v !== null && typeof v === 'object'
  && ( Array.isArray( v ) || Object.getPrototypeOf( v ) === Object.prototype )

const isCollection = ( v: any ) =>
  v instanceof Map || v instanceof Set
  || !!( v && typeof v === 'object' && v[ COLLECTION_META ] )

/**
 * Array mutators write several times (push sets an index AND length).
 * Run them atomically so one operation is one notification, not one per
 * internal write.
 */
const ARRAY_MUTATORS = new Set([ 'push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin' ])
/** Map/Set methods that mutate — each notifies once */
const COLLECTION_MUTATORS = new Set([ 'set', 'delete', 'clear', 'add' ])

/**
 * Channel for "which keys exist" — subscribed by `ownKeys` (Object.keys,
 * Object.entries, `<for>` over an object) and fired when a key is added
 * or removed. Separate from the per-key channels, which only cover value
 * changes on keys that already exist.
 */
const KEYS = Symbol('lips.keys')

/**
 * ONE proxy per raw object, shared across every deep store.
 *
 * The same object is commonly reachable from two stores — a parent's
 * `state.rows` and the child's `input.rows` are the same array. A
 * per-store registry would hand each a private proxy with private
 * channels, so a write through one would be invisible to the other.
 */
const OBJECT_PROXIES = new WeakMap<object, any>()

/**
 * Map/Set proxies break internal-slot access ([[MapData]]), so
 * collections are wrapped by BINDING their methods to the target:
 * reads work natively; mutators notify. Values read out of the
 * collection are deep-wrapped in turn, so nested trees of Maps
 * (e.g. a recursive layers tree) stay reactive.
 */
function wrapCollection( coll: any, touch: () => void ): any {
  /**
   * Identity-stable wrapping, for the same reason as OBJECT_PROXIES:
   * ONE proxy is reused and every interested store adds its notifier.
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

      /**
       * Readers hand out WRAPPED values. Iteration matters as much as
       * `get`: a `<for>` over a Map reads `entries()`, and an unwrapped
       * value there is an object nothing can track — its mutations would
       * be invisible now that a nested write no longer force-notifies
       * the whole collection.
       */
      const wrapVal = ( out: any ) =>
        isPlain( out ) ? deepWrap( out, notifyAll )
        : isCollection( out ) ? wrapCollection( out, notifyAll )
        : out

      const isMap = t instanceof Map

      if( k === 'get' ) return ( key: any ) => wrapVal( t.get( key ) )

      if( k === 'forEach' )
        return ( fn: any, thisArg?: any ) =>
          t.forEach( ( val: any, key: any ) => fn.call( thisArg, wrapVal( val ), key, proxy ) )

      if( k === 'values' || ( !isMap && ( k === 'keys' || k === Symbol.iterator ) ) )
        return function*(){ for( const val of t.values() ) yield wrapVal( val ) }

      if( k === 'entries' || ( isMap && k === Symbol.iterator ) )
        return isMap
          ? function*(){ for( const [ key, val ] of t.entries() ) yield [ key, wrapVal( val ) ] }
          : function*(){ for( const val of t.values() ) yield [ wrapVal( val ), wrapVal( val ) ] }

      return v.bind( t )
    }
  })

  COLLECTION_PROXIES.set( coll, proxy )
  return proxy
}

/**
 * Per-key channels for ONE nested object (RFC-004 follow-up).
 *
 * Each key gets its own subscription list, so `rows[3].x = v` notifies
 * exactly the bindings that read `rows[3].x` — not everything that read
 * `rows`. Previously every nested write force-notified the top key, and
 * the keyed `<for>` is one of its subscribers, so a single field write
 * re-ran the whole list: O(list) per write, O(N²) per animation frame.
 *
 * A channel is a signal used purely as a subscription list — reading
 * subscribes, touching notifies. The VALUE always comes from the target,
 * so the proxy and the underlying object can never diverge.
 */
function nestedProxy( target: any ): any {
  const hit = OBJECT_PROXIES.get( target )
  if( hit ) return hit

  const chans = new Map<PropertyKey, ReturnType<typeof signal<number>>>()

  const track = ( k: PropertyKey ) => {
    let c = chans.get( k )
    if( !c ){
      c = signal( 0 )
      chans.set( k, c )
    }
    c[0]()
  }
  /** Fire only if someone actually subscribed — an unread key has no channel */
  const fire = ( k: PropertyKey ) => chans.get( k )?.[2]()

  /**
   * A STABLE notifier per key. Collections keep their subscribers in a
   * Set, so handing them a fresh closure on every read would grow that
   * Set without bound — one entry per read, never deduplicated.
   */
  const touches = new Map<PropertyKey, () => void>()
  const touchFor = ( k: PropertyKey ) => {
    let f = touches.get( k )
    if( !f ){
      f = () => fire( k )
      touches.set( k, f )
    }
    return f
  }
  /**
   * A structural change invalidates everything. Batched, so an effect
   * subscribed to many channels (a `<for>` reads length and every index)
   * runs ONCE rather than once per channel.
   */
  const fireAll = () => batch( () => { for( const c of chans.values() ) c[2]() })

  let muted = false

  const proxy = new Proxy( target, {
    get( t: any, k ){
      const v = t[ k ]

      // Symbols (Symbol.iterator, …) pass through untracked; the
      // iterator's own reads of length/indices are tracked below.
      if( typeof k === 'symbol' ) return v

      if( Array.isArray( t ) && ARRAY_MUTATORS.has( k ) && typeof v === 'function' )
        return ( ...args: any[] ) => {
          muted = true
          try { return v.apply( t, args ) }
          finally {
            muted = false
            fireAll()
          }
        }

      /**
       * Methods are returned unbound on purpose: `proxy.map(fn)` then
       * runs with `this` = proxy, so its internal length/index reads go
       * through this trap and subscribe.
       */
      if( typeof v === 'function' ) return v

      track( k )
      return isPlain( v ) || isCollection( v ) ? deepWrap( v, touchFor( k ) ) : v
    },
    set( t: any, k, v ){
      const had = k in t
      const prev = t[ k ]
      t[ k ] = v

      if( muted ) return true
      if( !Object.is( prev, v ) ) fire( k )
      /**
       * A new key changes the key set, and on an array it also moves
       * `length` — both are what iterators subscribed to.
       */
      if( !had ){
        fire( KEYS )
        Array.isArray( t ) && fire('length')
      }
      return true
    },
    deleteProperty( t: any, k ){
      const had = k in t
      delete t[ k ]

      if( !muted && had ){
        fire( k )
        fire( KEYS )
      }
      return true
    },
    has( t: any, k ){
      typeof k !== 'symbol' && track( k )
      return k in t
    },
    ownKeys( t: any ){
      track( KEYS )
      return Reflect.ownKeys( t )
    }
  })

  OBJECT_PROXIES.set( target, proxy )
  return proxy
}

function deepWrap( value: any, touch: () => void ): any {
  if( isCollection( value ) ) return wrapCollection( value, touch )
  if( !isPlain( value ) ) return value
  return nestedProxy( value )
}

/**
 * Per-key reactive facade over a plain object:
 * reading a key inside an effect subscribes to that key;
 * writing notifies only that key's subscribers.
 * Idempotent — wrapping a reactive object returns it as-is.
 *
 * Shallow by default (RFC-001 §6). `deep: true` opts into nested
 * mutation tracking: plain objects/arrays read through a key are lazily
 * given their OWN per-key channels (see `nestedProxy`), so a nested
 * write stays O(subscribers-of-that-key) rather than invalidating the
 * whole top-level key.
 */
export function reactive<T extends object>( obj: T, deep = false ): T {
  if( ( obj as any )[ IS_REACTIVE ] ) return obj

  const sigs = new Map<PropertyKey, [ () => any, ( v: any ) => void, () => void ]>()

  const sigFor = ( key: PropertyKey, initial: any ) => {
    let s = sigs.get( key )
    if( !s ){
      s = signal( initial )
      sigs.set( key, s )
    }
    return s
  }

  return new Proxy( obj, {
    get( target: any, key ){
      if( key === IS_REACTIVE ) return true
      if( typeof key === 'string' ){
        const s = sigFor( key, target[ key ] )
        return deep ? deepWrap( s[0](), s[2] ) : s[0]()
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
