/**
 * Phase 2 — reactivity core (RFC-001 §6)
 *
 * Minimal per-key signals: no history (that's the opt-in
 * `historySignal` wrapper, later), no deep proxies, no digest.
 * A write notifies exactly the effects that read that signal.
 *
 * Held to an established body of signal semantics by
 * `tests/signal-conformance.spec.ts`, and to its speed by
 * `bench/reactivity.mjs`.
 */

/** Up to date */
const CLEAN: number = 0
/** Something a computed value it read was computed from has changed: that value may have */
const CHECK: number = 1
/** Something it read has changed */
const DIRTY: number = 2

type Effect = {
  run: () => void
  deps: Set<Set<Effect>>
  disposed: boolean
  state: number
  /** The computed values it read, in the order it read them: what a `CHECK` asks */
  reads: Effect[]
  /**
   * A computed value's (`computed`): what reads it. A change marks those
   * `CHECK` rather than running them; they run only if its value changed.
   */
  subs?: Set<Effect>
  /** A computed value's: computed again if what it read has changed */
  update?: () => void
}

/**
 * What a change reaches: every computed value downstream marked out of
 * date first, then the effects to run, each once. So no effect runs while
 * a value it reads is still the one from before the change: an effect that
 * reads a source and a value computed from it sees both as they are now.
 *
 * What read the source is `DIRTY`; what read a value computed from it is
 * only `CHECK`, and asks that value before it runs (`settle`).
 */
function reached( subs: Set<Effect>, state: number, run: Set<Effect> ){
  // Not a copy: marking runs nothing, so nothing subscribes or leaves meanwhile
  for( const e of subs ){
    if( e.disposed || e.state >= state ) continue
    const was = e.state
    e.state = state
    // Already reached by an earlier change, and so is what is below it
    if( was ) continue
    e.subs ? reached( e.subs, CHECK, run ) : run.add( e )
  }
}

/**
 * A `CHECK` is settled by asking the computed values it read, in order,
 * until one has changed: then it is `DIRTY`. None changed: it is `CLEAN`,
 * and does not run.
 */
function settle( e: Effect ){
  if( e.state !== CHECK ) return
  for( const c of e.reads ){
    c.state && c.update!()
    if( e.state === DIRTY ) return
  }
  e.state = CLEAN
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
 * How many passes a drain takes before it gives up: effects that wake one
 * another for ever are a cycle, and say so rather than hang the page.
 */
const PASSES = 1e4

/**
 * Run what a change reached. An effect run already, by a write nested in
 * another's run, is `CLEAN` and runs no second time. One that throws does
 * not keep the rest from running: the first error is thrown after them.
 */
function flush( run: Iterable<Effect> ){
  let failed = false, error: unknown
  for( const e of run ){
    if( e.disposed || !e.state ) continue
    try {
      settle( e )
      e.state && e.run()
    }
    catch( x ){ failed || ( failed = true, error = x ) }
  }
  if( failed ) throw error
}

/**
 * Drain iteratively: an effect may itself write, queueing more work.
 * Re-enter the batch around each pass so those collapse too, instead of
 * running eagerly one at a time.
 */
function drain(){
  let passes = 0
  while( PENDING.size ){
    if( ++passes > PASSES ){
      for( const e of PENDING ) e.state = CLEAN
      PENDING.clear()
      throw new Error('Effects kept waking one another: a cycle')
    }
    const queued = [ ...PENDING ]
    PENDING.clear()
    BATCH_DEPTH++
    try { flush( queued ) }
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

/** Subscribe what is running now, if anything, to `subs` */
function track( subs: Set<Effect> ){
  if( CURRENT && !CURRENT.disposed ){
    subs.add( CURRENT )
    CURRENT.deps.add( subs )
  }
}

/** Forget what `e` read, before it reads again or is disposed */
function untrackAll( e: Effect ){
  for( const subs of e.deps ) subs.delete( e )
  e.deps.clear()
  e.reads.length = 0
}

export function signal<T>( value: T ): [ () => T, ( next: T ) => void, () => void ] {
  const subs = new Set<Effect>()

  const notify = () => {
    // Collected first: effects may retrack while running, and computed values are marked before any runs
    const run = new Set<Effect>()
    reached( subs, DIRTY, run )
    if( BATCH_DEPTH ){
      for( const e of run ) PENDING.add( e )
      return
    }
    flush( run )
  }

  const read = () => {
    track( subs )
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
    reads: [],
    disposed: false,
    state: CLEAN,
    run(){
      if( e.disposed ) return

      // Re-track from scratch each run
      untrackAll( e )
      e.state = CLEAN

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
      untrackAll( e )
    }
  }
}

export interface Computed<T> {
  /** Its value, computed again first where what it read has changed since */
  read(): T
  dispose(): void
}

/**
 * A value computed from signals, and read like one: computed when it is
 * read, and again only once what it read has changed. A change marks it
 * out of date before any effect runs (`reached`), so an effect never reads
 * it as it was before the change that woke that effect.
 *
 * Computed again to the value it had, it wakes nothing: what reads it runs
 * only when it changed. Except an object, which always counts as changed:
 * Lips's stores mutate in place, so the same reference can hold new
 * contents (a collection that was touched). What it throws is kept, like
 * a value, and thrown to each reader until what it read changes.
 */
export function computed<T>( fn: () => T ): Computed<T> {
  let value: unknown, failed = false, computing = false
  const node: Effect = {
    deps: new Set(),
    reads: [],
    subs: new Set(),
    disposed: false,
    state: DIRTY,
    run(){},
    update(){
      if( node.disposed ) return
      settle( node )
      node.state && compute()
    }
  }

  const compute = () => {
    if( computing ) throw new Error('A computed value read while it is computed: it reads itself')
    untrackAll( node )
    const prev = CURRENT
    CURRENT = node
    computing = true
    let next: unknown, threw = false
    try { next = fn() }
    catch( x ){ next = x, threw = true }
    finally { CURRENT = prev; computing = false }
    node.state = CLEAN

    // An object or a function is its own `Object()`
    const changed = threw !== failed || !Object.is( next, value ) || next === Object( next )
    value = next, failed = threw
    if( changed )
      for( const s of node.subs! ) s.state === CHECK && ( s.state = DIRTY )
  }

  return {
    read(){
      node.state && node.update!()
      if( CURRENT && !CURRENT.disposed ){
        track( node.subs! )
        CURRENT.reads.push( node )
      }
      if( failed ) throw value
      return value as T
    },
    dispose(){
      node.disposed = true
      untrackAll( node )
      node.subs!.clear()
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
  /**
   * Which keys there are, as a nested object has it (`KEYS`): read by
   * `Object.keys( store )`, notified when a key is added or deleted. What
   * reads the key set of an `input` (`onInput` again on a new input) saw
   * only the keys there were when it last ran.
   */
  const [ keys, , touchKeys ] = signal( 0 )

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
      const had = key in target, prev = target[ key ]
      target[ key ] = value

      if( typeof key !== 'string' ) return true
      had || touchKeys()

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
    ownKeys( target ){
      keys()
      return Reflect.ownKeys( target )
    },
    deleteProperty( target: any, key ){
      const had = key in target
      delete target[ key ]
      typeof key === 'string' && sigs.get( key )?.[1]( undefined )
      had && touchKeys()
      return true
    }
  }) as T
}
