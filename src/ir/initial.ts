/**
 * An instance's own copy of what its template declares (`state`, `static`).
 *
 * A template is written once and drawn many times: each instance starts
 * from what it declares and changes its own copy, never the template's
 * nor its siblings'. The legacy engine copied both per instance; the IR
 * engine had dropped it, so two instances pushing into a declared list
 * pushed into one array, the template's.
 *
 * What is copied is what an author declares as data: plain objects,
 * arrays, `Map`, `Set`, `Date`, `RegExp` and typed arrays, deeply, cycles
 * kept. Anything else (a class instance, a function, a promise) is a value
 * the author holds, kept as it is: a client copied field by field would
 * lose its private fields and stop being the one the app configured.
 */
export function initial<T>( value: T, seen = new WeakMap<object, unknown>() ): T {
  if( value === null || typeof value !== 'object' ) return value

  const v = value as unknown as object
  if( seen.has( v ) ) return seen.get( v ) as T

  if( Array.isArray( v ) ){
    const out: unknown[] = []
    seen.set( v, out )
    for( const each of v ) out.push( initial( each, seen ) )
    return out as T
  }
  if( v instanceof Map ){
    const out = new Map()
    seen.set( v, out )
    v.forEach( ( each, key ) => out.set( initial( key, seen ), initial( each, seen ) ) )
    return out as T
  }
  if( v instanceof Set ){
    const out = new Set()
    seen.set( v, out )
    v.forEach( each => out.add( initial( each, seen ) ) )
    return out as T
  }
  if( v instanceof Date ) return new Date( v.getTime() ) as T
  if( v instanceof RegExp ) return new RegExp( v.source, v.flags ) as T
  if( ArrayBuffer.isView( v ) ) return new ( v.constructor as any )( v ) as T

  const proto = Object.getPrototypeOf( v )
  if( proto !== Object.prototype && proto !== null ) return value

  const out: Record<PropertyKey, unknown> = Object.create( proto )
  seen.set( v, out )
  for( const key of Reflect.ownKeys( v ) ){
    const d = Object.getOwnPropertyDescriptor( v, key )!
    // A getter stays a getter: it computes from the copy, not once from the template
    'value' in d ? ( d.value = initial( d.value, seen ) ) : 0
    Object.defineProperty( out, key, d )
  }

  return out as T
}
