/**
 * Phase 2 — Expression subsystem (RFC-001 §5)
 *
 * A dedicated parser for the template expression subset with:
 *  - positioned, machine-readable diagnostics (never throws)
 *  - AST-derived precise dependency paths
 *  - two interchangeable executors over the same AST:
 *      compiled    — one Function per unique expression (trusted contexts)
 *      interpreted — sandboxed AST walker (CSP / untrusted embeds)
 *
 * Grammar (expression-only, no statements):
 *   literals (number, string, boolean, null, undefined), identifiers,
 *   member access (incl. optional/computed), calls, unary ! - + and
 *   prefix/postfix ++ --, binary arithmetic/relational/equality,
 *   && || ??, ternary, arrow functions, assignment (= += -= *= /= %=),
 *   array/object literals with spread.
 */

// ---------------------------------------------------------------- diagnostics
export interface ExprDiagnostic {
  code: string
  message: string
  loc: { offset: number, length: number }
}

// ------------------------------------------------------------------------ AST
export type Expr =
  | { t: 'lit', v: any }
  | { t: 'id', name: string }
  | { t: 'member', obj: Expr, prop: string | Expr, computed: boolean, optional: boolean }
  | { t: 'call', callee: Expr, args: Expr[], optional: boolean }
  | { t: 'unary', op: '!' | '-' | '+', arg: Expr }
  | { t: 'update', op: '++' | '--', arg: Expr, prefix: boolean }
  | { t: 'bin', op: string, l: Expr, r: Expr }
  | { t: 'logic', op: '&&' | '||' | '??', l: Expr, r: Expr }
  | { t: 'cond', test: Expr, cons: Expr, alt: Expr }
  | { t: 'assign', op: string, target: Expr, value: Expr }
  | { t: 'arrow', params: string[], body: Expr }
  | { t: 'arr', items: { spread?: boolean, value: Expr }[] }
  | { t: 'obj', props: { key?: string, value: Expr, spread?: boolean }[] }
  | { t: 'error' }

// ------------------------------------------------------------------ tokenizer
type Token = {
  t: 'num' | 'str' | 'id' | 'punct' | 'eof'
  value: string
  start: number
  end: number
}

const PUNCTS = [
  '===', '!==', '...', '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.',
  '++', '--', '+=', '-=', '*=', '/=', '%=',
  '+', '-', '*', '/', '%', '<', '>', '!', '?', ':', '.', ',', '(', ')',
  '[', ']', '{', '}', '='
]

function tokenize( src: string, diagnostics: ExprDiagnostic[] ): Token[] {
  const tokens: Token[] = []
  let i = 0

  const isIdStart = ( c: string ) => /[A-Za-z_$]/.test( c )
  const isIdChar = ( c: string ) => /[A-Za-z0-9_$]/.test( c )

  while( i < src.length ){
    const c = src[ i ]

    if( /\s/.test( c ) ){ i++; continue }

    // Numbers: int, float, exponent
    if( /[0-9]/.test( c ) || ( c === '.' && /[0-9]/.test( src[ i + 1 ] ) ) ){
      const start = i
      while( i < src.length && /[0-9]/.test( src[ i ] ) ) i++
      if( src[ i ] === '.' ){ i++; while( i < src.length && /[0-9]/.test( src[ i ] ) ) i++ }
      if( src[ i ] === 'e' || src[ i ] === 'E' ){
        i++
        if( src[ i ] === '+' || src[ i ] === '-' ) i++
        while( i < src.length && /[0-9]/.test( src[ i ] ) ) i++
      }
      tokens.push({ t: 'num', value: src.slice( start, i ), start, end: i })
      continue
    }

    // Strings: '…' or "…" with escapes
    if( c === "'" || c === '"' ){
      const start = i
      i++
      let value = ''
      let closed = false
      while( i < src.length ){
        const ch = src[ i ]
        if( ch === '\\' ){
          const next = src[ i + 1 ]
          const escapes: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', '0': '\0' }
          if( next === 'u' ){
            const hex = src.slice( i + 2, i + 6 )
            value += String.fromCharCode( parseInt( hex, 16 ) || 0 )
            i += 6
          }
          else {
            value += escapes[ next ] ?? next
            i += 2
          }
          continue
        }
        if( ch === c ){ closed = true; i++; break }
        value += ch
        i++
      }
      if( !closed )
        diagnostics.push({ code: 'LIPS-E001', message: 'Unterminated string literal', loc: { offset: start, length: i - start } })
      tokens.push({ t: 'str', value, start, end: i })
      continue
    }

    // Identifiers / keywords
    if( isIdStart( c ) ){
      const start = i
      while( i < src.length && isIdChar( src[ i ] ) ) i++
      tokens.push({ t: 'id', value: src.slice( start, i ), start, end: i })
      continue
    }

    // Punctuators — longest match first
    let punct = PUNCTS.find( p => src.startsWith( p, i ) )
    // `a ? .5 : b` — '?.' must not swallow a ternary before a decimal
    if( punct === '?.' && /[0-9]/.test( src[ i + 2 ] ?? '' ) )
      punct = '?'
    if( punct ){
      tokens.push({ t: 'punct', value: punct, start: i, end: i + punct.length })
      i += punct.length
      continue
    }

    diagnostics.push({ code: 'LIPS-E002', message: `Unexpected character '${c}'`, loc: { offset: i, length: 1 } })
    i++
  }

  tokens.push({ t: 'eof', value: '', start: src.length, end: src.length })
  return tokens
}

// --------------------------------------------------------------------- parser
class Parser {
  private pos = 0
  constructor( private tokens: Token[], private diagnostics: ExprDiagnostic[] ){}

  private peek( offset = 0 ){ return this.tokens[ Math.min( this.pos + offset, this.tokens.length - 1 ) ] }
  private next(){ return this.tokens[ this.pos++ ] ?? this.tokens[ this.tokens.length - 1 ] }
  private at( value: string ){ const t = this.peek(); return t.t === 'punct' && t.value === value }
  private eat( value: string ){ if( this.at( value ) ){ this.pos++; return true } return false }
  private error( code: string, message: string, token = this.peek() ): Expr {
    this.diagnostics.push({ code, message, loc: { offset: token.start, length: Math.max( 1, token.end - token.start ) } })
    return { t: 'error' }
  }
  private expect( value: string, code: string ){
    if( !this.eat( value ) )
      this.error( code, `Expected '${value}'` )
  }

  parse(): Expr {
    const expr = this.assign()
    if( this.peek().t !== 'eof' )
      this.error( 'LIPS-E003', `Unexpected token '${this.peek().value}' after expression` )
    return expr
  }

  /**
   * Arrow lookahead: '(' … ')' '=>' or IDENT '=>'
   */
  private isArrowAhead(): boolean {
    const t = this.peek()
    if( t.t === 'id' ){
      const n = this.peek( 1 )
      return n.t === 'punct' && n.value === '=>'
    }
    if( t.t === 'punct' && t.value === '(' ){
      let depth = 0, k = 0
      while( true ){
        const tok = this.peek( k )
        if( tok.t === 'eof' ) return false
        if( tok.t === 'punct' && tok.value === '(' ) depth++
        if( tok.t === 'punct' && tok.value === ')' ){
          depth--
          if( depth === 0 ){
            const after = this.peek( k + 1 )
            return after.t === 'punct' && after.value === '=>'
          }
        }
        k++
      }
    }
    return false
  }

  private assign(): Expr {
    // Arrow functions
    if( this.isArrowAhead() ){
      const params: string[] = []
      if( this.peek().t === 'id' )
        params.push( this.next().value )
      else {
        this.expect( '(', 'LIPS-E004' )
        while( !this.at( ')' ) && this.peek().t !== 'eof' ){
          const p = this.next()
          if( p.t !== 'id' ) return this.error( 'LIPS-E005', 'Invalid arrow parameter', p )
          params.push( p.value )
          if( !this.eat( ',' ) ) break
        }
        this.expect( ')', 'LIPS-E004' )
      }
      this.expect( '=>', 'LIPS-E004' )
      return { t: 'arrow', params, body: this.assign() }
    }

    const target = this.conditional()

    const op = this.peek()
    if( op.t === 'punct' && [ '=', '+=', '-=', '*=', '/=', '%=' ].includes( op.value ) ){
      if( target.t !== 'id' && target.t !== 'member' )
        return this.error( 'LIPS-E006', 'Invalid assignment target', op )
      this.next()
      return { t: 'assign', op: op.value, target, value: this.assign() }
    }

    return target
  }

  private conditional(): Expr {
    const test = this.nullish()
    if( this.eat( '?' ) ){
      const cons = this.assign()
      this.expect( ':', 'LIPS-E007' )
      return { t: 'cond', test, cons, alt: this.assign() }
    }
    return test
  }

  private nullish(): Expr {
    let l = this.or()
    while( this.at( '??' ) ){ this.next(); l = { t: 'logic', op: '??', l, r: this.or() } }
    return l
  }
  private or(): Expr {
    let l = this.and()
    while( this.at( '||' ) ){ this.next(); l = { t: 'logic', op: '||', l, r: this.and() } }
    return l
  }
  private and(): Expr {
    let l = this.equality()
    while( this.at( '&&' ) ){ this.next(); l = { t: 'logic', op: '&&', l, r: this.equality() } }
    return l
  }
  private equality(): Expr {
    let l = this.relational()
    while( [ '===', '!==', '==', '!=' ].some( op => this.at( op ) ) ){
      const op = this.next().value
      l = { t: 'bin', op, l, r: this.relational() }
    }
    return l
  }
  private relational(): Expr {
    let l = this.additive()
    while( [ '<=', '>=', '<', '>' ].some( op => this.at( op ) ) ){
      const op = this.next().value
      l = { t: 'bin', op, l, r: this.additive() }
    }
    return l
  }
  private additive(): Expr {
    let l = this.multiplicative()
    while( this.at( '+' ) || this.at( '-' ) ){
      const op = this.next().value
      l = { t: 'bin', op, l, r: this.multiplicative() }
    }
    return l
  }
  private multiplicative(): Expr {
    let l = this.unary()
    while( this.at( '*' ) || this.at( '/' ) || this.at( '%' ) ){
      const op = this.next().value
      l = { t: 'bin', op, l, r: this.unary() }
    }
    return l
  }
  private unary(): Expr {
    if( this.at( '!' ) || this.at( '-' ) || this.at( '+' ) ){
      const op = this.next().value as '!' | '-' | '+'
      return { t: 'unary', op, arg: this.unary() }
    }
    if( this.at( '++' ) || this.at( '--' ) ){
      const op = this.next().value as '++' | '--'
      const arg = this.unary()
      if( arg.t !== 'id' && arg.t !== 'member' )
        return this.error( 'LIPS-E006', 'Invalid update target' )
      return { t: 'update', op, arg, prefix: true }
    }
    return this.postfix()
  }
  private postfix(): Expr {
    let expr = this.callMember()
    if( this.at( '++' ) || this.at( '--' ) ){
      const op = this.next().value as '++' | '--'
      if( expr.t !== 'id' && expr.t !== 'member' )
        return this.error( 'LIPS-E006', 'Invalid update target' )
      expr = { t: 'update', op, arg: expr, prefix: false }
    }
    return expr
  }

  private callMember(): Expr {
    let expr = this.primary()

    while( true ){
      if( this.eat( '.' ) ){
        const prop = this.next()
        if( prop.t !== 'id' ) return this.error( 'LIPS-E008', 'Expected property name', prop )
        expr = { t: 'member', obj: expr, prop: prop.value, computed: false, optional: false }
      }
      else if( this.eat( '?.' ) ){
        if( this.at( '(' ) ){
          expr = { t: 'call', callee: expr, args: this.argList(), optional: true }
        }
        else if( this.eat( '[' ) ){
          const idx = this.assign()
          this.expect( ']', 'LIPS-E009' )
          expr = { t: 'member', obj: expr, prop: idx, computed: true, optional: true }
        }
        else {
          const prop = this.next()
          if( prop.t !== 'id' ) return this.error( 'LIPS-E008', 'Expected property name', prop )
          expr = { t: 'member', obj: expr, prop: prop.value, computed: false, optional: true }
        }
      }
      else if( this.eat( '[' ) ){
        const idx = this.assign()
        this.expect( ']', 'LIPS-E009' )
        expr = { t: 'member', obj: expr, prop: idx, computed: true, optional: false }
      }
      else if( this.at( '(' ) ){
        expr = { t: 'call', callee: expr, args: this.argList(), optional: false }
      }
      else break
    }

    return expr
  }
  private argList(): Expr[] {
    this.expect( '(', 'LIPS-E010' )
    const args: Expr[] = []
    while( !this.at( ')' ) && this.peek().t !== 'eof' ){
      args.push( this.assign() )
      if( !this.eat( ',' ) ) break
    }
    this.expect( ')', 'LIPS-E010' )
    return args
  }

  private primary(): Expr {
    const t = this.peek()

    if( t.t === 'num' ){ this.next(); return { t: 'lit', v: parseFloat( t.value ) } }
    if( t.t === 'str' ){ this.next(); return { t: 'lit', v: t.value } }

    if( t.t === 'id' ){
      this.next()
      switch( t.value ){
        case 'true': return { t: 'lit', v: true }
        case 'false': return { t: 'lit', v: false }
        case 'null': return { t: 'lit', v: null }
        case 'undefined': return { t: 'lit', v: undefined }
        case 'NaN': return { t: 'lit', v: NaN }
        case 'Infinity': return { t: 'lit', v: Infinity }
        default: return { t: 'id', name: t.value }
      }
    }

    if( this.eat( '(' ) ){
      const expr = this.assign()
      this.expect( ')', 'LIPS-E010' )
      return expr
    }

    if( this.eat( '[' ) ){
      const items: { spread?: boolean, value: Expr }[] = []
      while( !this.at( ']' ) && this.peek().t !== 'eof' ){
        const spread = this.eat( '...' )
        items.push({ spread: spread || undefined, value: this.assign() })
        if( !this.eat( ',' ) ) break
      }
      this.expect( ']', 'LIPS-E009' )
      return { t: 'arr', items }
    }

    if( this.eat( '{' ) ){
      const props: { key?: string, value: Expr, spread?: boolean }[] = []
      while( !this.at( '}' ) && this.peek().t !== 'eof' ){
        if( this.eat( '...' ) ){
          props.push({ spread: true, value: this.assign() })
        }
        else {
          const key = this.next()
          if( key.t !== 'id' && key.t !== 'str' && key.t !== 'num' )
            return this.error( 'LIPS-E011', 'Invalid object key', key )

          if( this.eat( ':' ) )
            props.push({ key: String( key.value ), value: this.assign() })
          else if( key.t === 'id' ) // shorthand { a }
            props.push({ key: key.value, value: { t: 'id', name: key.value } })
          else
            return this.error( 'LIPS-E011', 'Invalid shorthand property', key )
        }
        if( !this.eat( ',' ) ) break
      }
      this.expect( '}', 'LIPS-E011' )
      return { t: 'obj', props }
    }

    this.next()
    return this.error( 'LIPS-E012', t.t === 'eof' ? 'Unexpected end of expression' : `Unexpected token '${t.value}'`, t )
  }
}

export function parseExpression( src: string ): { ast: Expr, diagnostics: ExprDiagnostic[] } {
  const diagnostics: ExprDiagnostic[] = []
  const tokens = tokenize( src, diagnostics )
  const ast = new Parser( tokens, diagnostics ).parse()

  return { ast, diagnostics }
}

// ------------------------------------------------------------ dep extraction
const METAVAR_ROOTS = new Set([ 'state', 'input', 'context', 'self', 'arguments' ])

/**
 * Every root identifier an expression reads that is not bound by an
 * arrow parameter — the head of each member chain, plus bare reads.
 *
 * The complement of `extractDeps`, which drops names it does not
 * recognise. Callers that need to REPORT an unresolvable name (a
 * stylesheet has no template position, so a `<for>` iterator in one
 * can never resolve — RFC-004 §7.2) need to see them instead.
 */
export function freeRoots( ast: Expr ): string[] {
  const roots = new Set<string>()

  const walk = ( node: Expr, shadow: Set<string> ) => {
    switch( node.t ){
      case 'id':
        !shadow.has( node.name ) && roots.add( node.name )
        return
      case 'member':
        walk( node.obj, shadow )
        typeof node.prop !== 'string' && walk( node.prop, shadow )
        return
      case 'call':
        walk( node.callee, shadow )
        node.args.forEach( a => walk( a, shadow ) )
        return
      case 'unary': case 'update': walk( node.arg, shadow ); return
      case 'bin': case 'logic': walk( node.l, shadow ); walk( node.r, shadow ); return
      case 'cond':
        walk( node.test, shadow ); walk( node.cons, shadow ); walk( node.alt, shadow )
        return
      case 'assign': walk( node.target, shadow ); walk( node.value, shadow ); return
      case 'arrow': walk( node.body, new Set([ ...shadow, ...node.params ]) ); return
      case 'arr': node.items.forEach( i => walk( i.value, shadow ) ); return
      case 'obj': node.props.forEach( p => walk( p.value, shadow ) ); return
    }
  }

  walk( ast, new Set() )
  return [ ...roots ]
}

/**
 * Precise dependency paths from the AST: dotted member paths
 * rooted at metavars (up to the first computed/call boundary),
 * plus bare scope-variable reads. Arrow params shadow.
 */
export function extractDeps( ast: Expr, scopeNames: string[] = [] ): string[] {
  const
  deps = new Set<string>(),
  scope = new Set( scopeNames )

  const walk = ( node: Expr, shadow: Set<string> ) => {
    switch( node.t ){
      case 'id': {
        if( shadow.has( node.name ) ) return
        if( scope.has( node.name ) || node.name === 'arguments' ) deps.add( node.name )
        return
      }
      case 'member': {
        // Collect the static dotted chain
        const parts: string[] = []
        let cur: Expr = node
        while( cur.t === 'member' && !cur.computed && typeof cur.prop === 'string' ){
          parts.unshift( cur.prop )
          cur = cur.obj
        }
        // Computed segments: record the object chain and the index deps
        if( cur.t === 'member' ){
          walk( cur.obj, shadow )
          typeof cur.prop !== 'string' && walk( cur.prop, shadow )
          // Re-anchor: deps of the computed base were recorded above
          if( cur.obj.t === 'id' || cur.obj.t === 'member' ) { /* recorded via recursion */ }
        }
        else if( cur.t === 'id' && !shadow.has( cur.name ) ){
          if( METAVAR_ROOTS.has( cur.name ) )
            deps.add( parts.length ? `${cur.name}.${parts.join('.')}` : cur.name )
          else if( scope.has( cur.name ) )
            deps.add( cur.name )
        }
        else if( cur.t !== 'id' ) walk( cur, shadow )
        return
      }
      case 'call':
        walk( node.callee, shadow )
        node.args.forEach( a => walk( a, shadow ) )
        return
      case 'unary': walk( node.arg, shadow ); return
      case 'update': walk( node.arg, shadow ); return
      case 'bin': case 'logic': walk( node.l, shadow ); walk( node.r, shadow ); return
      case 'cond': walk( node.test, shadow ); walk( node.cons, shadow ); walk( node.alt, shadow ); return
      case 'assign': walk( node.target, shadow ); walk( node.value, shadow ); return
      case 'arrow': {
        const inner = new Set([ ...shadow, ...node.params ])
        walk( node.body, inner )
        return
      }
      case 'arr': node.items.forEach( i => walk( i.value, shadow ) ); return
      case 'obj': node.props.forEach( p => walk( p.value, shadow ) ); return
    }
  }

  walk( ast, new Set() )
  return [ ...deps ]
}

// -------------------------------------------------------------------- codegen
/**
 * AST → JS source (fully parenthesized — semantics over beauty).
 * Reserved-as-parameter roots are renamed at the identifier node
 * (`static` → `__static`, `arguments` → `__args__`) — renaming in
 * codegen, never via regex on emitted source, keeps string literals
 * containing those words intact.
 */
const ID_RENAMES: Record<string, string> = { static: '__static', arguments: '__args__' }

function gen( node: Expr ): string {
  switch( node.t ){
    case 'lit':
      if( typeof node.v === 'string' ) return JSON.stringify( node.v )
      if( node.v === undefined ) return 'undefined'
      if( Number.isNaN( node.v ) ) return 'NaN'
      return String( node.v )
    case 'id': return ID_RENAMES[ node.name ] ?? node.name
    case 'member': {
      const obj = gen( node.obj )
      if( node.computed ) return `(${obj})${node.optional ? '?.' : ''}[${gen( node.prop as Expr )}]`
      return `(${obj})${node.optional ? '?.' : '.'}${node.prop}`
    }
    case 'call': return `(${gen( node.callee )})${node.optional ? '?.' : ''}(${node.args.map( gen ).join(',')})`
    case 'unary': return `(${node.op}(${gen( node.arg )}))`
    case 'update': return node.prefix ? `(${node.op}${genTarget( node.arg )})` : `(${genTarget( node.arg )}${node.op})`
    case 'bin': return `((${gen( node.l )})${node.op}(${gen( node.r )}))`
    case 'logic': return `((${gen( node.l )})${node.op}(${gen( node.r )}))`
    case 'cond': return `((${gen( node.test )})?(${gen( node.cons )}):(${gen( node.alt )}))`
    case 'assign': return `(${genTarget( node.target )}${node.op}(${gen( node.value )}))`
    case 'arrow': return `((${node.params.join(',')})=>(${gen( node.body )}))`
    case 'arr': return `[${node.items.map( i => ( i.spread ? '...' : '' ) + gen( i.value ) ).join(',')}]`
    case 'obj': return `({${node.props.map( p =>
        p.spread ? `...${gen( p.value )}` : `${JSON.stringify( p.key )}:${gen( p.value )}` ).join(',')}})`
    case 'error': return 'undefined'
  }
}
/** Assignment/update targets must not be over-parenthesized */
function genTarget( node: Expr ): string {
  if( node.t === 'id' ) return ID_RENAMES[ node.name ] ?? node.name
  if( node.t === 'member' ){
    const obj = gen( node.obj )
    return node.computed ? `${obj}[${gen( node.prop as Expr )}]` : `${obj}.${node.prop}`
  }
  return gen( node )
}

// ------------------------------------------------------------------ executors
export interface ExprEnv {
  state?: any
  input?: any
  context?: any
  static?: any
  self?: any
  arguments?: any
  scope?: Record<string, any>
  /**
   * Effective language for this subtree, read reactively (RFC-005 §4).
   * Set by `<i18n lang=…>`; absent means "the global language". Not an
   * expression root — the evaluator only binds the named roots, so this
   * rides along for the runtime's own use.
   */
  lang?: () => string
}

export interface CompiledExpr {
  run( env: ExprEnv ): any
  source: string
}

const
COMPILE_CACHE = new Map<string, CompiledExpr>(),
ROOT_PARAMS = [ 'state', 'input', 'context', '__static', 'self' ]

/**
 * Compiled mode: one Function per unique (source, scopeNames) —
 * strict-compatible, no `with`. Trusted contexts only.
 */
export function compileExpression( src: string, scopeNames: string[] = [] ): CompiledExpr {
  const key = `${scopeNames.join(',')} ${src}`
  const cached = COMPILE_CACHE.get( key )
  if( cached ) return cached

  const { ast, diagnostics } = parseExpression( src )
  if( diagnostics.length )
    console.warn( `[lips-ir] expression diagnostics for "${src}":`, diagnostics )

  const
  code = `return (${gen( ast )});`,
  params = [ ...ROOT_PARAMS, '__args__', ...scopeNames ],
  fn = new Function( ...params, code )

  const compiled: CompiledExpr = {
    source: src,
    run( env: ExprEnv ){
      const scope = env.scope || {}
      return fn(
        env.state, env.input, env.context, env.static, env.self, env.arguments,
        ...scopeNames.map( name => scope[ name ] )
      )
    }
  }

  COMPILE_CACHE.set( key, compiled )
  return compiled
}

/**
 * Interpreted mode: sandboxed AST walker — only whitelisted
 * globals are reachable. CSP-safe (no eval, no Function).
 */
const SAFE_GLOBALS: Record<string, any> = {
  Math, JSON, Object, Array, String, Number, Boolean, Date,
  parseInt, parseFloat, isNaN, isFinite,
  encodeURIComponent, decodeURIComponent, console
}

export function interpretExpression( ast: Expr, env: ExprEnv ): any {
  const scope = env.scope || {}

  const resolveId = ( name: string, locals: Record<string, any>[] ): any => {
    for( const frame of locals )
      if( name in frame ) return frame[ name ]

    if( name in scope ) return scope[ name ]

    switch( name ){
      case 'state': return env.state
      case 'input': return env.input
      case 'context': return env.context
      case 'static': return env.static
      case 'self': return env.self
      case 'arguments': return env.arguments
    }

    if( name in SAFE_GLOBALS ) return SAFE_GLOBALS[ name ]
    return undefined
  }

  const assignId = ( name: string, value: any, locals: Record<string, any>[] ) => {
    for( const frame of locals )
      if( name in frame ){ frame[ name ] = value; return value }
    scope[ name ] = value
    return value
  }

  const ev = ( node: Expr, locals: Record<string, any>[] ): any => {
    switch( node.t ){
      case 'lit': return node.v
      case 'id': return resolveId( node.name, locals )

      case 'member': {
        const obj = ev( node.obj, locals )
        if( node.optional && obj == null ) return undefined
        const prop = node.computed ? ev( node.prop as Expr, locals ) : node.prop as string
        return obj?.[ prop ]
      }

      case 'call': {
        // Member calls bind `this` to the object
        if( node.callee.t === 'member' ){
          const obj = ev( node.callee.obj, locals )
          if( ( node.callee.optional || node.optional ) && obj == null ) return undefined
          const prop = node.callee.computed ? ev( node.callee.prop as Expr, locals ) : node.callee.prop as string
          const fn = obj?.[ prop ]
          if( node.optional && fn == null ) return undefined
          return fn.apply( obj, node.args.map( a => ev( a, locals ) ) )
        }
        const fn = ev( node.callee, locals )
        if( node.optional && fn == null ) return undefined
        return fn( ...node.args.map( a => ev( a, locals ) ) )
      }

      case 'unary': {
        const v = ev( node.arg, locals )
        switch( node.op ){
          case '!': return !v
          case '-': return -v
          case '+': return +v
        }
      }

      case 'update': {
        const cur = ev( node.arg, locals )
        const nextVal = node.op === '++' ? cur + 1 : cur - 1
        setTarget( node.arg, nextVal, locals )
        return node.prefix ? nextVal : cur
      }

      case 'bin': {
        const l = ev( node.l, locals ), r = ev( node.r, locals )
        switch( node.op ){
          case '+': return l + r
          case '-': return l - r
          case '*': return l * r
          case '/': return l / r
          case '%': return l % r
          case '<': return l < r
          case '>': return l > r
          case '<=': return l <= r
          case '>=': return l >= r
          // eslint-disable-next-line eqeqeq
          case '==': return l == r
          // eslint-disable-next-line eqeqeq
          case '!=': return l != r
          case '===': return l === r
          case '!==': return l !== r
        }
        return undefined
      }

      case 'logic': {
        const l = ev( node.l, locals )
        switch( node.op ){
          case '&&': return l ? ev( node.r, locals ) : l
          case '||': return l ? l : ev( node.r, locals )
          case '??': return l != null ? l : ev( node.r, locals )
        }
      }

      case 'cond': return ev( node.test, locals ) ? ev( node.cons, locals ) : ev( node.alt, locals )

      case 'assign': {
        let value = ev( node.value, locals )
        if( node.op !== '=' ){
          const cur = ev( node.target, locals )
          switch( node.op ){
            case '+=': value = cur + value; break
            case '-=': value = cur - value; break
            case '*=': value = cur * value; break
            case '/=': value = cur / value; break
            case '%=': value = cur % value; break
          }
        }
        return setTarget( node.target, value, locals )
      }

      case 'arrow':
        return ( ...args: any[] ) => {
          const frame: Record<string, any> = {}
          node.params.forEach( ( p, k ) => frame[ p ] = args[ k ] )
          return ev( node.body, [ frame, ...locals ] )
        }

      case 'arr': {
        const out: any[] = []
        for( const item of node.items ){
          const v = ev( item.value, locals )
          item.spread ? out.push( ...v ) : out.push( v )
        }
        return out
      }

      case 'obj': {
        const out: Record<string, any> = {}
        for( const p of node.props ){
          if( p.spread ) Object.assign( out, ev( p.value, locals ) )
          else out[ p.key as string ] = ev( p.value, locals )
        }
        return out
      }

      case 'error': return undefined
    }
  }

  const setTarget = ( target: Expr, value: any, locals: Record<string, any>[] ) => {
    if( target.t === 'id' ) return assignId( target.name, value, locals )
    if( target.t === 'member' ){
      const obj = ev( target.obj, locals )
      const prop = target.computed ? ev( target.prop as Expr, locals ) : target.prop as string
      if( obj != null ) obj[ prop ] = value
      return value
    }
    return value
  }

  return ev( ast, [] )
}
