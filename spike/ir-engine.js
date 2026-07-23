/**
 * SPIKE: minimal IR-engine prototype (~200 lines)
 *
 * Validates the Phase-2 architecture from ROADMAP.md:
 *   1. Parse a template string ONCE at runtime -> <template> + binding IR
 *   2. Compile each unique expression ONCE with new Function (no `with`)
 *   3. Instantiate rows via template.content.cloneNode(true)
 *   4. Fine-grained updates: signal write -> only subscribed bindings run
 *
 * NOT a real parser (Phase 2 builds that) — micro-syntax only:
 *   - text interpolation: {expr}
 *   - reactive attribute:  :attr="expr"
 *   - event listener:      @event="handlerName"
 */

// ---------------------------------------------------------------- signals
let CURRENT = null

export function signal( value ){
  const subs = new Set()
  const read = () => {
    if( CURRENT ){
      subs.add( CURRENT )
      CURRENT.deps.push( subs )
    }
    return value
  }
  const write = next => {
    if( Object.is( next, value ) ) return
    value = next
    // copy: effects may resubscribe while running
    for( const e of [ ...subs ] ) e.run()
  }
  return [ read, write ]
}

export function effect( fn ){
  const e = {
    deps: [],
    disposed: false,
    run(){
      if( e.disposed ) return
      cleanup( e )
      const prev = CURRENT
      CURRENT = e
      try { fn() }
      finally { CURRENT = prev }
    },
    dispose(){
      e.disposed = true
      cleanup( e )
    }
  }
  e.run()
  return e
}

function cleanup( e ){
  for( const d of e.deps ) d.delete( e )
  e.deps.length = 0
}

// ----------------------------------------------------- template -> IR (once)
const INTERPOLATE = /\{\s*([^{}]+?)\s*\}/g

/**
 * compileTemplate( src, params )
 * `params` are the scope names expressions may reference, e.g. ['row','app'].
 * Returns { tpl, bindings } — the IR. Called once per unique template.
 */
export function compileTemplate( src, params ){
  const tpl = document.createElement('template')
  tpl.innerHTML = src.trim()

  const
  bindings = [],
  exprCache = new Map(),
  compileExpr = expr => {
    let fn = exprCache.get( expr )
    if( !fn ){
      // one Function per unique expression, strict-compatible, no `with`
      fn = new Function( ...params, `return (${expr})` )
      exprCache.set( expr, fn )
    }
    return fn
  }

  ;( function walk( node, path ){
    if( node.nodeType === Node.TEXT_NODE ){
      const text = node.textContent
      if( INTERPOLATE.test( text ) ){
        INTERPOLATE.lastIndex = 0
        const parts = []
        let last = 0, m
        while( ( m = INTERPOLATE.exec( text ) ) ){
          if( m.index > last ) parts.push( JSON.stringify( text.slice( last, m.index ) ) )
          parts.push( `(${m[1]})` )
          last = m.index + m[0].length
        }
        if( last < text.length ) parts.push( JSON.stringify( text.slice( last ) ) )

        bindings.push({ type: 'text', path: [ ...path ], fn: compileExpr( parts.join('+') ) })
      }
      return
    }

    if( node.nodeType === Node.ELEMENT_NODE ){
      // snapshot: we mutate attributes while iterating
      for( const { name, value } of [ ...node.attributes ] ){
        if( name.startsWith(':') ){
          bindings.push({ type: 'attr', name: name.slice(1), path: [ ...path ], fn: compileExpr( value ) })
          node.removeAttribute( name )
        }
        else if( name.startsWith('@') ){
          bindings.push({ type: 'event', name: name.slice(1), path: [ ...path ], handler: value })
          node.removeAttribute( name )
        }
      }
    }

    let i = 0
    for( const child of [ ...node.childNodes ] ){
      walk( child, [ ...path, i ] )
      i++
    }
  } )( tpl.content, [] )

  return { tpl, bindings }
}

function resolve( root, path ){
  let node = root
  for( const i of path ) node = node.childNodes[ i ]
  return node
}

// ------------------------------------------------------ instantiate (per row)
/**
 * instantiate( ir, scopeValues, handlers )
 * Clone the template content and wire every binding as its own effect.
 * `scopeValues` positionally matches the `params` of compileTemplate.
 */
export function instantiate( ir, scopeValues, handlers = {} ){
  const
  el = ir.tpl.content.firstElementChild.cloneNode( true ),
  effects = []

  for( const b of ir.bindings ){
    const node = resolve( el, b.path.slice( 1 ) ) // slice(1): path[0] is root

    if( b.type === 'event' ){
      node.addEventListener( b.name, e => handlers[ b.handler ]?.( e, ...scopeValues ) )
      continue
    }

    if( b.type === 'text' ){
      effects.push( effect( () => { node.textContent = b.fn( ...scopeValues ) } ) )
      continue
    }

    // reactive attribute
    effects.push( effect( () => {
      const v = b.fn( ...scopeValues )
      v === false || v == null || v === ''
        ? node.removeAttribute( b.name )
        : node.setAttribute( b.name, v )
    } ) )
  }

  return {
    el,
    dispose(){
      for( const e of effects ) e.dispose()
      el.remove()
    }
  }
}
