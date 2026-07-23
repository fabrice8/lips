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

export function signal<T>( value: T ): [ () => T, ( next: T ) => void ] {
  const subs = new Set<Effect>()

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

    // Copy: effects may retrack while running
    for( const e of [ ...subs ] )
      !e.disposed && e.run()
  }

  return [ read, write ]
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
 * Per-key reactive facade over a plain object (shallow):
 * reading a key inside an effect subscribes to that key;
 * writing notifies only that key's subscribers.
 * Idempotent — wrapping a reactive object returns it as-is.
 */
export function reactive<T extends object>( obj: T ): T {
  if( ( obj as any )[ IS_REACTIVE ] ) return obj

  const sigs = new Map<PropertyKey, [ () => any, ( v: any ) => void ]>()

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
      if( typeof key === 'string' ) return sigFor( key, target[ key ] )[0]()
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
