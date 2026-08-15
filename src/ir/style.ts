/**
 * Style IR (RFC-004 Layer 1) — reactive declarations for component stylesheets.
 *
 *   stylesheet source
 *     │  scanner — lifts {expr} out of declaration VALUES only
 *     ▼
 *     Stylis — nesting flattened, prefixes applied, scope wrap resolved
 *     ▼
 *   StyleIR ──────────► JSON (precompiled module)
 *     │
 *     ▼
 *   runtime: inject `css` verbatim, bind each custom property on the scope roots
 *
 * The sheet is IMMUTABLE once injected. Updates write custom properties on the
 * component's own roots — one shared rule, N per-instance values. Rule-level
 * revision (insert/delete) is Layer 2 and deliberately absent here.
 *
 * Like the template compiler, the CSS preprocessor is INJECTED rather than
 * imported, so the precompiled-only `./runtime` build tree-shakes Stylis out.
 */

import type { TemplateDiagnostic } from './parser'

// ------------------------------------------------------------------- types
export interface StyleBindIR {
  /** Custom property to write on the scope roots (e.g. '--card-0') */
  prop: string
  /** Index into StyleIR.exprs */
  e: number
}

export interface PropertyIR {
  name: string
  syntax: string
  inherits: boolean
  initial: string
}

export interface StyleIR {
  v: 1
  /**
   * Scope name baked in at compile time. The runtime stamps `rel` with
   * THIS, not the registration name — a precompiled sheet is already
   * scoped to it, and the two must agree.
   */
  nsp: string
  /** Post-Stylis: flat, scoped, prefixed. Injected verbatim, never re-parsed. */
  css: string
  exprs: string[]
  binds: StyleBindIR[]
  /** @property registrations — makes the variables interpolable (RFC-004 §10) */
  props?: PropertyIR[]
}

export interface StyleCompileOptions {
  /** Scope name — the `rel` attribute value, and the variable-name prefix */
  nsp: string
  /** Inject globally instead of scoping to `[rel="<nsp>"]` */
  meta?: boolean
  /** Emit inside `@layer <name>` so utility frameworks can win (RFC-004 §9) */
  layer?: string
}

export interface StyleCompileResult {
  ir: StyleIR
  diagnostics: TemplateDiagnostic[]
}

// ------------------------------------------------------------- preprocessor
type StylePreprocessor = ( css: string ) => string
let PREPROCESSOR: StylePreprocessor | null = null

/** Wire the CSS preprocessor (full build only — see src/lips.ts) */
export function setStylePreprocessor( fn: StylePreprocessor ){ PREPROCESSOR = fn }
export function hasStylePreprocessor(){ return !!PREPROCESSOR }

// ------------------------------------------------------------------ scanner
const PROP_NAME = /^[-\w]+$/
const UNIT = /^(%|[a-zA-Z]+)/

/**
 * A unit-suffixed slot is registered as `<number>`, NOT as the unit's own
 * type: the unit was lifted into `calc(var(--x) * 1unit)`, so what the bind
 * writes is a bare number. Registering `<percentage>` and then writing `75`
 * makes the value invalid — the property silently falls back to its
 * initial-value and the declaration computes to zero.
 *
 * `<number>` is still the whole §10 payoff: it is what makes the variable
 * interpolable, so transitions through it animate.
 */
const NUMBER_SYNTAX: [ string, string ] = [ '<number>', '0' ]

function skipString( src: string, i: number ){
  const q = src[ i ]
  i++
  while( i < src.length ){
    if( src[ i ] === '\\' ){ i += 2; continue }
    if( src[ i ] === q ) return i + 1
    i++
  }
  return i
}
function skipComment( src: string, i: number ){
  const end = src.indexOf( '*/', i + 2 )
  return end < 0 ? src.length : end + 2
}
function locOf( src: string, offset: number, length: number ){
  let line = 1, last = -1
  for( let i = 0; i < offset; i++ ) if( src[ i ] === '\n' ){ line++; last = i }
  return { line, col: offset - last, offset, length }
}

/**
 * Read a `{…}` at `open` as an interpolation, or return null if it is
 * really a block. The discriminator: expression-shaped content —
 * non-empty, no nested brace, no `;`, and no top-level `:` unless a `?`
 * precedes it (a ternary). That is what tells `color: {state.x}` apart
 * from a nested `a:hover { color: red }`.
 */
function readInterpolation( src: string, open: number ){
  let i = open + 1, nest = 0, question = false, colon = false

  while( i < src.length ){
    const c = src[ i ]

    if( c === '"' || c === "'" ){ i = skipString( src, i ); continue }
    if( c === '{' || c === ';' ) return null
    if( c === '}' ) break

    if( c === '(' || c === '[' ) nest++
    else if( c === ')' || c === ']' ) nest--
    else if( nest === 0 ){
      if( c === '?' ) question = true
      else if( c === ':' && !question ) colon = true
    }
    i++
  }

  if( i >= src.length || colon ) return null

  const expr = src.slice( open + 1, i ).trim()
  return expr ? { end: i, expr } : null
}

type ValuePart = string | { expr: string, unit: string }

/**
 * Scan a declaration value from `from` to its `;`/`}` terminator, lifting
 * interpolations out. Returns null when the "declaration" turns out to be a
 * selector — `a:hover {` enters here on the `:` and aborts at the block.
 */
function readValue( src: string, from: number ): { end: number, parts: ValuePart[] } | null {
  const parts: ValuePart[] = []
  let i = from, lit = from, paren = 0

  while( i < src.length ){
    const c = src[ i ]

    if( c === '"' || c === "'" ){ i = skipString( src, i ); continue }
    if( c === '/' && src[ i + 1 ] === '*' ){ i = skipComment( src, i ); continue }
    if( c === '(' ){ paren++; i++; continue }
    if( c === ')' ){ paren--; i++; continue }

    if( paren === 0 && ( c === ';' || c === '}' ) ){
      parts.push( src.slice( lit, i ) )
      return { end: i, parts }
    }

    if( c === '{' ){
      const interp = readInterpolation( src, i )
      if( !interp ) return null

      parts.push( src.slice( lit, i ) )

      const m = UNIT.exec( src.slice( interp.end + 1 ) )
      const unit = m ? m[ 1 ] : ''

      parts.push({ expr: interp.expr, unit })
      i = interp.end + 1 + unit.length
      lit = i
      continue
    }

    i++
  }
  return null
}

interface ScanResult {
  css: string
  exprs: string[]
  binds: StyleBindIR[]
  props: PropertyIR[]
}

function scan( src: string, nsp: string, diagnostics: TemplateDiagnostic[] ): ScanResult {
  const
  exprs: string[] = [],
  binds: StyleBindIR[] = [],
  props: PropertyIR[] = [],
  /**
   * Variable names are namespaced by component. @property registration is
   * document-global, so a bare `--0` would collide across components and the
   * last registration would silently win.
   */
  prefix = `--${ nsp.replace( /[^a-zA-Z0-9_-]/g, '-' ) }`,
  report = ( code: string, message: string, offset: number, length: number, hint?: string ) =>
    diagnostics.push({ code, severity: 'error', message, hint, loc: locOf( src, offset, length ) })

  const slot = ( expr: string ) => {
    let e = exprs.indexOf( expr )
    if( e < 0 ) e = exprs.push( expr ) - 1
    return e
  }

  let out = '', i = 0, depth = 0, stmt = 0, paren = 0

  while( i < src.length ){
    const c = src[ i ]

    if( c === '/' && src[ i + 1 ] === '*' ){
      const end = skipComment( src, i )
      out += src.slice( i, end ); i = end; continue
    }
    if( c === '"' || c === "'" ){
      const end = skipString( src, i )
      out += src.slice( i, end ); i = end; continue
    }

    if( c === '(' ) paren++
    else if( c === ')' ) paren--

    /**
     * Declaration? At statement level, outside parens, after a property
     * name. Depth is NOT part of the test: a component sheet is implicitly
     * inside its own block, so top-level `--accent: {…}` is a declaration.
     * A selector that gets this far (`a:hover {`) is rejected by readValue.
     */
    if( c === ':' && paren === 0 ){
      const name = src.slice( stmt, i ).trim()

      if( PROP_NAME.test( name ) ){
        const value = readValue( src, i + 1 )

        if( value ){
          const slots = value.parts.filter( p => typeof p !== 'string' ) as { expr: string, unit: string }[]

          if( !slots.length ){
            // fully static — emit untouched
            out += src.slice( i, value.end )
            i = value.end
            continue
          }

          /**
           * RFC-004 §7.4 — a custom property whose value is one bare
           * interpolation binds the AUTHOR's name directly. Aliasing it
           * through a generated variable would break cross-component
           * inheritance (§12.2) and Tailwind interop (§13), because both
           * depend on the name being stable and meaningful.
           */
          const bare =
            name.startsWith('--')
            && slots.length === 1
            && !slots[ 0 ].unit
            && value.parts.every( p => typeof p !== 'string' || !p.trim() )

          if( bare ){
            binds.push({ prop: name, e: slot( slots[ 0 ].expr ) })
            // drop the declaration entirely — the value lives inline on the root
            out = out.slice( 0, out.length - ( i - stmt ) )
            i = value.end + ( src[ value.end ] === ';' ? 1 : 0 )
            stmt = i
            continue
          }

          let text = ':'
          for( const part of value.parts ){
            if( typeof part === 'string' ){ text += part; continue }

            const
            e = slot( part.expr ),
            prop = `${prefix}-${e}`

            if( !binds.some( b => b.prop === prop ) ){
              binds.push({ prop, e })

              if( part.unit && !props.some( p => p.name === prop ) )
                props.push({
                  name: prop,
                  syntax: NUMBER_SYNTAX[ 0 ],
                  inherits: true,
                  initial: NUMBER_SYNTAX[ 1 ]
                })
            }

            /**
             * RFC-004 §7.1 — the source disambiguates. A bare `{expr}` is
             * used verbatim; a unit suffix means the expression yields a
             * number, so multiply it back into the unit.
             */
            text += part.unit ? `calc(var(${prop}) * 1${part.unit})` : `var(${prop})`
          }

          out += text
          i = value.end
          continue
        }
        // readValue aborted — this was a selector (`a:hover {`), fall through
      }
    }

    if( c === '{' ){
      // An interpolation inside a prelude's parens is an at-rule condition.
      if( paren > 0 ){
        const interp = readInterpolation( src, i )
        if( interp ){
          report( 'LIPS-S002',
            'Interpolation in an at-rule condition',
            i, interp.end - i + 1,
            'Media and container conditions cannot read custom properties. Keep the condition static.' )

          // drop a unit suffix too, so the rest still parses as CSS
          const m = UNIT.exec( src.slice( interp.end + 1 ) )
          i = interp.end + 1 + ( m ? m[ 1 ].length : 0 )
          continue
        }
      }

      // A block opener with a blank prelude and expression-shaped content
      // is `{state.sel} { … }` — a dynamic selector.
      if( !src.slice( stmt, i ).trim() ){
        const interp = readInterpolation( src, i )
        if( interp ){
          report( 'LIPS-S001',
            'Interpolation in a selector',
            i, interp.end - i + 1,
            'Selectors are static in Layer 1. Bind a value inside the rule instead.' )
          i = interp.end + 1
          stmt = i
          continue
        }
      }

      depth++
      out += c; i++; stmt = i
      continue
    }

    if( c === '}' || c === ';' ){
      if( c === '}' ) depth--
      out += c; i++; stmt = i
      continue
    }

    out += c; i++
  }

  return { css: out, exprs, binds, props }
}

// ------------------------------------------------------------------ compile
/**
 * Compile a component stylesheet to StyleIR.
 *
 * The scanner MUST run before Stylis: a brace in a declaration value breaks
 * its block parsing, so interpolations are replaced with `var()` first.
 */
export function compileStyle( src: string, options: StyleCompileOptions ): StyleCompileResult {
  const
  diagnostics: TemplateDiagnostic[] = [],
  { css, exprs, binds, props } = scan( src, options.nsp, diagnostics )

  const empty: StyleIR = { v: 1, nsp: options.nsp, css: '', exprs: [], binds: [] }

  if( !PREPROCESSOR ){
    console.warn(
      `[lips] <${options.nsp}> stylesheet skipped — this build has no CSS preprocessor. `
      + 'Use "@lipsjs/lips" (not "@lipsjs/lips/runtime") for source stylesheets, '
      + 'or precompile them to StyleIR.' )
    return { ir: empty, diagnostics }
  }

  const scoped = options.meta ? css : `[rel="${options.nsp}"] { ${css} }`
  let sheet: string

  try { sheet = PREPROCESSOR( options.layer ? `@layer ${options.layer} { ${scoped} }` : scoped ) }
  catch( error: any ){
    diagnostics.push({
      code: 'LIPS-S006', severity: 'error',
      message: `Style compilation failed: ${error.message}`,
      loc: locOf( src, 0, src.length )
    })
    return { ir: empty, diagnostics }
  }

  /**
   * @property registration is document-global, so it sits OUTSIDE the scope
   * wrap. Without it a custom property is an uninterpolable token and
   * `transition: --x` does nothing (RFC-004 §10).
   */
  const registrations = props
    .map( p => `@property ${p.name}{syntax:"${p.syntax}";inherits:${p.inherits};initial-value:${p.initial}}` )
    .join('')

  const ir: StyleIR = { v: 1, nsp: options.nsp, css: registrations + sheet, exprs, binds }
  if( props.length ) ir.props = props

  return { ir, diagnostics }
}
