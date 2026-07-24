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

export function signal<T>( value: T ): [ () => T, ( next: T ) => void, () => void ] {
  const subs = new Set<Effect>()

  const notify = () => {
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

  /** Only plain objects/arrays are deep-wrapped (Map/Date/etc. pass through) */
  const isPlain = ( v: any ) =>
    v !== null && typeof v === 'object'
    && ( Array.isArray( v ) || Object.getPrototypeOf( v ) === Object.prototype )

  /**
   * Array mutators write several times (push sets an index AND
   * length). Run them atomically so one operation is one
   * notification, not one per internal write.
   */
  const ARRAY_MUTATORS = new Set([ 'push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin' ])

  const deepWrap = ( value: any, touch: () => void ): any => {
    if( !deep || !isPlain( value ) ) return value

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

        return isPlain( v ) ? deepWrap( v, touch ) : v
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
      target[ key ] = value
      typeof key === 'string' && sigFor( key, value )[1]( value )
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
