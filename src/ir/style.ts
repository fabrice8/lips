/**
 * Style IR (RFC-004 Layer 1) — reactive declarations for component stylesheets.
 *
 *   stylesheet source
 *     │  scanner — lifts {expr} out of declaration VALUES only, hoists the
 *     │            at-rules that cannot nest, compacts the text
 *     ▼
 *     scope wrap `[rel="x"]{…}` — resolved by native CSS nesting, or
 *     flattened by an opt-in preprocessor (`@lipsjs/lips/stylis`)
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
import { parseExpression, freeRoots } from './expression'

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
  /** Scoped and compact — nested, or flat if a preprocessor ran. Injected verbatim, never re-parsed. */
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
  /**
   * CSS preprocessor for this call, overriding any process-wide one.
   *
   * Passed per call rather than only set globally because the opt-in
   * preprocessor ships as a SEPARATE bundle: `@lipsjs/lips/stylis` and
   * `@lipsjs/lips` each carry their own copy of this module, so a global
   * set from one is invisible to the other. Handing the function across
   * the call is the only wiring that survives that boundary.
   */
  preprocess?: StylePreprocessor
}

export interface StyleCompileResult {
  ir: StyleIR
  diagnostics: TemplateDiagnostic[]
}

// ------------------------------------------------------------- preprocessor
export type StylePreprocessor = ( css: string ) => string
let PREPROCESSOR: StylePreprocessor | null = null

/**
 * Process-wide default preprocessor, `null` to clear it. Only reaches
 * `compileStyle` in the SAME module graph — each published entry bundles
 * its own copy of this module — so outside of tests and source builds,
 * pass `preprocess` per call (`LipsConfig.stylePreprocessor`,
 * `precompile(…, { preprocess })`) instead.
 */
export function setStylePreprocessor( fn: StylePreprocessor | null ){ PREPROCESSOR = fn }
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
/** `// …` up to (not including) the newline — Stylis syntax, not CSS */
function skipLine( src: string, i: number ){
  const end = src.indexOf( '\n', i + 2 )
  return end < 0 ? src.length : end
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

/**
 * Names a stylesheet expression may read. A sheet is per component and
 * has no template position, so `<for>` iterators and `<let>` names —
 * which are position-local — can never resolve in one.
 */
const STYLE_SCOPE = new Set([ 'state', 'input', 'static', 'context', 'self' ])

type ValuePart = string | { expr: string, unit: string, at: number }

/**
 * Scan a declaration value from `from` to its `;`/`}` terminator, lifting
 * interpolations out. Returns null when the "declaration" turns out to be a
 * selector — `a:hover {` enters here on the `:` and aborts at the block.
 */
function readValue(
  src: string,
  from: number,
  keepComments: boolean,
  onUnterminated?: ( at: number ) => void
): { end: number, parts: ValuePart[] } | null {
  const parts: ValuePart[] = []
  let i = from, lit = from, paren = 0

  while( i < src.length ){
    const c = src[ i ]

    if( c === '"' || c === "'" ){ i = skipString( src, i ); continue }
    /**
     * A comment is cut to a space — it separates tokens, so `1px`, a
     * comment and `solid` must not fuse into `1pxsolid` — unless a
     * preprocessor will read it.
     * `//` is NOT a comment here: `--api: https://x` is a valid value.
     */
    if( c === '/' && src[ i + 1 ] === '*' ){
      const end = skipComment( src, i )
      if( !keepComments ){
        parts.push( src.slice( lit, i ), ' ' )
        lit = end
      }
      i = end
      continue
    }
    if( c === '(' ){ paren++; i++; continue }
    if( c === ')' ){ paren--; i++; continue }

    if( paren === 0 && ( c === ';' || c === '}' ) ){
      parts.push( src.slice( lit, i ) )
      return { end: i, parts }
    }

    if( c === '{' ){
      const interp = readInterpolation( src, i )
      if( !interp ){
        // No closing brace at all → an unterminated interpolation, not a block
        src.indexOf( '}', i + 1 ) < 0 && onUnterminated?.( i )
        return null
      }

      parts.push( src.slice( lit, i ) )

      const m = UNIT.exec( src.slice( interp.end + 1 ) )
      const unit = m ? m[ 1 ] : ''

      parts.push({ expr: interp.expr, unit, at: i })
      i = interp.end + 1 + unit.length
      lit = i
      continue
    }

    i++
  }

  /**
   * Ran to EOF. Harmless for a plain trailing declaration (`--a: red`
   * with no semicolon), but if an interpolation was consumed on the way
   * then its closing brace almost certainly ate the block's — report it
   * rather than emitting silently broken CSS.
   */
  parts.some( p => typeof p !== 'string' ) && onUnterminated?.( from )
  return null
}

// --------------------------------------------------------------- structure
/**
 * At-rules that are NOT valid inside a style rule.
 *
 * CSS nesting only admits at-rules whose body is itself a rule list, so a
 * `@keyframes` left inside `[rel="x"] { … }` is dropped by the parser and
 * the animation silently does nothing. These are lifted out of the scope
 * wrap — they are document-global anyway, exactly like the `@property`
 * registrations emitted outside it.
 */
const HOISTED_BLOCK = /^@(-\w+-)?(keyframes|font-face|property|counter-style|font-feature-values|font-palette-values|page|view-transition|position-try|color-profile|function)\b/i
/**
 * Statement at-rules that must open the sheet: `@import` is ignored after
 * any other rule, `@charset` must be first, `@namespace` must precede
 * every style rule.
 */
const HOISTED_STATEMENT = /^@(import|charset|namespace)\b/i
/**
 * Conditional group rules. Their body holds style rules, they nest
 * natively, and they stay INSIDE the scope wrap so what they contain
 * remains scoped. A hoisted at-rule found inside one carries the
 * condition out with it.
 */
const GROUP_AT = /^@(media|supports|container|layer|scope|starting-style|document)\b/i

/**
 * Engines that shipped the FIRST cut of CSS nesting (Chrome 112–119,
 * Safari 16.5–17.1) parse a nested line that starts with an identifier
 * as a declaration, so `button { … }` inside the scope wrap is silently
 * dropped. `& button` is the same selector — a nested relative selector
 * gets an implicit `& ` anyway — and parses wherever nesting does.
 */
const TYPE_LEAD = /^([a-zA-Z_*\\]|[^\x00-\x7f])/
/** The identifier-ish token a selector opens with — `div`, `svg|rect`, `*` */
const LEAD_TOKEN = /^(?:[-\w*|]|[^\x00-\x7f]|\\[\s\S])+/
/**
 * Stylis/Sass `&-suffix` / `&__elem` concatenation. Native nesting reads
 * `-suffix` as a type selector instead, so the rule silently matches
 * nothing. (`&div` is fine natively — `&` may precede a type selector.)
 */
const CONCAT = /&[-_]/

const WS = /\s/
const BREAK = /[{};]/
const IDENT_CHAR = /[-\w]/
const QUOTED = /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g
const STRING_OR_SPACE = new RegExp(`(${ QUOTED.source })|\\s+`, 'g')
const COMMENTS = /\/\*[\s\S]*?\*\//g
const LAYER = /^@layer\b/i

/** Fold whitespace runs outside strings to one space */
const squash = ( text: string ) => text.replace( STRING_OR_SPACE, ( _, str ) => str || ' ' )

/** Prefix every identifier-led selector in a list with `& ` (see TYPE_LEAD) */
function nestSelector( prelude: string ){
  const parts: string[] = []
  let from = 0, nest = 0

  for( let i = 0; i < prelude.length; i++ ){
    const c = prelude[ i ]

    if( c === '\\' ){ i++; continue }
    if( c === '"' || c === "'" ){ i = skipString( prelude, i ) - 1; continue }
    if( c === '(' || c === '[' ) nest++
    else if( c === ')' || c === ']' ) nest--
    else if( c === ',' && !nest ){
      parts.push( prelude.slice( from, i ) )
      from = i + 1
    }
  }
  parts.push( prelude.slice( from ) )

  return parts
    .map( p => {
      // Trim — but not an escaped trailing space (`.a\ `), which is part of the name
      let s = p.trimStart(), e = s.length
      while( e && WS.test( s[ e - 1 ] ) && s[ e - 2 ] !== '\\' ) e--
      s = s.slice( 0, e )

      if( !TYPE_LEAD.test( s ) ) return s
      /**
       * `div &` places its parent itself, so `& ` cannot go in front;
       * wrapping the leading token (`:is(div) &`) is the same selector,
       * same specificity, and no longer starts with an identifier.
       */
      return s.includes('&') ? s.replace( LEAD_TOKEN, ':is($&)' ) : `& ${s}`
    })
    .join(',')
}

interface Block {
  /**
   * What a selector directly inside this block is: nested in a style
   * rule (`style`), at the top of a global sheet (`top`), or not a style
   * selector at all — keyframe selectors, `@page` margin boxes (`opaque`).
   */
  ctx: 'style' | 'top' | 'opaque'
  /** Prelude of a conditional group rule, carried out by anything hoisted from inside it */
  group?: string
  /** Output offsets of a group's prelude and body — to drop it if hoisting empties it */
  at?: number
  body?: number
  /** Offset in the output where an at-rule being hoisted starts */
  hoist?: number
}

interface ScanResult {
  /** The sheet body, still to be wrapped in the scope rule */
  css: string
  /** Statement at-rules that must open the sheet (`@import`, …) */
  statements: string
  /** Block at-rules lifted out of the scope wrap (`@keyframes`, …) */
  hoisted: string
  exprs: string[]
  binds: StyleBindIR[]
  props: PropertyIR[]
}

function scan( src: string, options: StyleCompileOptions, native: boolean, diagnostics: TemplateDiagnostic[] ): ScanResult {
  const
  exprs: string[] = [],
  binds: StyleBindIR[] = [],
  props: PropertyIR[] = [],
  /**
   * Variable names are namespaced by component. @property registration is
   * document-global, so a bare `--0` would collide across components and the
   * last registration would silently win.
   */
  prefix = `--${ options.nsp.replace( /[^a-zA-Z0-9_-]/g, '-' ) }`,
  report = ( code: string, message: string, offset: number, length: number, hint?: string ) =>
    diagnostics.push({ code, severity: 'error', message, hint, loc: locOf( src, offset, length ) }),
  warn = ( code: string, message: string, offset: number, length: number, hint?: string ) =>
    diagnostics.push({ code, severity: 'warning', message, hint, loc: locOf( src, offset, length ) })

  const slot = ( expr: string ) => {
    let e = exprs.indexOf( expr )
    if( e < 0 ) e = exprs.push( expr ) - 1
    return e
  }

  /**
   * Static checks on a lifted expression: names that cannot resolve
   * where a sheet runs, and a unit suffix on a value that is plainly
   * not a number.
   */
  const checkExpr = ( s: { expr: string, unit: string, at: number } ) => {
    const { ast, diagnostics: errors } = parseExpression( s.expr )
    const length = s.expr.length + 2

    if( errors.length ){
      report( 'LIPS-S004', `Invalid expression: ${errors[0].message}`, s.at, length )
      return
    }

    for( const name of freeRoots( ast ) )
      if( !STYLE_SCOPE.has( name ) && !( name in globalThis ) )
        report( 'LIPS-S003',
          `'${name}' is not readable from a stylesheet`,
          s.at, length,
          'Stylesheets see state, input, static, context and self — not <for> iterators or <let> names, '
          + 'which are local to a template position.' )

    s.unit && ast.t === 'lit' && typeof ast.v === 'string'
    && warn( 'LIPS-S005',
      `Unit '${s.unit}' after a string value`,
      s.at, length,
      `A unit suffix multiplies a number: drop the unit, or return ${s.unit === '%' ? '50' : '8'} instead of a string.` )
  }

  /**
   * The output is emitted compact: comments dropped, whitespace runs
   * folded to one space, and dropped entirely beside `{`, `}` and `;`.
   * Without a preprocessor nothing else would minify it, and the sheet
   * would ship as authored — banners, indentation and all — in every
   * `<style>` and every precompiled module.
   *
   * The statement being built (`cur`) is kept apart from the output so
   * far, so reading or rewriting a prelude never copies the whole sheet.
   * A statement always starts right after `{`, `}`, `;` or at the top,
   * where no space is wanted — hence `tail = ''` whenever one is dropped.
   */
  let out = '', cur = '', tail = '', gap = false

  const emit = ( text: string ) => {
    if( !text ) return
    if( gap && tail && !BREAK.test( tail ) && !BREAK.test( text[ 0 ] ) ) cur += ' '
    gap = false
    cur += text
    tail = text[ text.length - 1 ]
  }
  /** End the statement: it joins the output, followed by its terminator */
  const flush = ( end: string ) => {
    out += cur + end
    cur = ''
    tail = end
    gap = false
  }
  /** Drop the statement being built, returning it */
  const drop = () => {
    const text = cur
    cur = tail = ''
    gap = false
    return text
  }

  /** Declaration values: folded, trimmed, never emptied (`--x: ;` is a value) */
  const value = ( text: string ) => ':' + ( squash( text ).trim() || ' ' )

  let
  i = 0, paren = 0,
  /** Statement start in the source */
  stmt = 0,
  statements = '', hoisted = '',
  /** Conditions the last hoisted rule was carried out with */
  lastGroups = '',
  /** An interpolation that ate a closing brace — already reported as the cause */
  unterminated = false

  const
  stack: Block[] = [{ ctx: options.meta ? 'top' : 'style' }]

  const open = () => {
    const
    parent = stack[ stack.length - 1 ],
    prelude = cur

    let block: Block

    if( prelude[ 0 ] === '@' ){
      if( parent.ctx !== 'opaque' && HOISTED_BLOCK.test( prelude ) ) block = { ctx: 'opaque', hoist: out.length }
      else if( GROUP_AT.test( prelude ) ) block = { ctx: parent.ctx, group: prelude, at: out.length }
      else block = { ctx: 'opaque' }
    }
    else {
      if( parent.ctx === 'style' ){
        native && CONCAT.test( prelude.replace( QUOTED, '' ) )
        && warn( 'LIPS-S008', `'${prelude}' joins '&' to a name`, stmt, i - stmt,
          'Native nesting cannot: write the full selector, or use stylisPreprocessor.' )

        cur = nestSelector( prelude )
      }

      block = { ctx: parent.ctx === 'opaque' ? 'opaque' : 'style' }
    }

    stack.push( block )
    flush('{')
    block.group && ( block.body = out.length )
  }

  const close = () => {
    const block = stack.pop()!

    /**
     * A group that hoisting emptied conditions nothing — drop it. Not an
     * `@layer`: an empty one still declares the layer order.
     */
    if( block.group && !cur && out.length === block.body && !LAYER.test( block.group ) ){
      out = out.slice( 0, block.at )
      tail = ''
      gap = false
      return
    }

    flush('}')

    if( block.hoist === undefined ) return

    // Carry any enclosing conditions out with it — `@media (…) { @keyframes … }`
    const
    text = out.slice( block.hoist ),
    groups = stack.filter( b => b.group ),
    key = groups.map( b => b.group ).join('{'),
    shut = '}'.repeat( groups.length )

    out = out.slice( 0, block.hoist )
    tail = ''

    // Consecutive rules hoisted from the same conditions share one copy of them
    hoisted = key && key === lastGroups
      ? hoisted.slice( 0, hoisted.length - shut.length ) + text + shut
      : hoisted + groups.map( b => b.group + '{' ).join('') + text + shut

    lastGroups = key
  }

  while( i < src.length ){
    const c = src[ i ]

    // An escape is one unit: `\,` does not split a list, `\ ` is not folded
    if( c === '\\' ){
      emit( src.slice( i, i + 2 ) )
      i += 2
      continue
    }

    /**
     * Block comments are dropped — or kept, when a preprocessor will read
     * them (`rtl:ignore`-style directives). `//` is not CSS, but Stylis
     * accepted it as a line comment and sheets were written against
     * Stylis: at the start of a statement it is stripped, where left in
     * it would glue itself onto the next selector and void the rule.
     * Anywhere else it is left alone — `--api: https://x` is a value.
     */
    const leading = c === '/' && !src.slice( stmt, i ).trim()

    if( c === '/' && ( src[ i + 1 ] === '*' || ( src[ i + 1 ] === '/' && leading ) ) ){
      const
      line = src[ i + 1 ] === '/',
      end = line ? skipLine( src, i ) : skipComment( src, i )

      if( !line && !native ){
        // Between statements it goes straight out, so preludes stay clean
        cur ? emit( src.slice( i, end ) ) : ( out += src.slice( i, end ) )
      }
      // It separated two tokens — `screen`, comment, `and` must not fuse
      else IDENT_CHAR.test( tail ) && IDENT_CHAR.test( src[ end ] || '' ) && ( gap = true )

      /**
       * A comment before a declaration must not become part of the
       * property name, or `PROP_NAME` rejects it, the value is never
       * scanned, and any interpolation inside it is misread further
       * down (an at-rule condition, at worst) instead of being lifted.
       */
      leading && ( stmt = end )
      i = end
      continue
    }
    if( c === '"' || c === "'" ){
      const end = skipString( src, i )
      emit( src.slice( i, end ) )
      i = end
      continue
    }
    if( WS.test( c ) ){
      gap = true
      i++
      continue
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
      // `color/* … */: …` is still the property `color`
      const name = src.slice( stmt, i ).replace( COMMENTS, '' ).trim()

      if( PROP_NAME.test( name ) ){
        const parsed = readValue( src, i + 1, !native, at => {
          unterminated = true
          report( 'LIPS-S004',
            'Unterminated interpolation',
            at, src.length - at,
            'Close the expression with `}`.' )
        })

        if( parsed ){
          const slots = parsed.parts.filter( p => typeof p !== 'string' ) as
            { expr: string, unit: string, at: number }[]

          for( const s of slots ) checkExpr( s )

          // `color :red` — the space before the colon carries nothing
          gap = false

          if( !slots.length ){
            // fully static — emit as written
            emit( value( parsed.parts.join('') ) )
            i = parsed.end
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
            && parsed.parts.every( p => typeof p !== 'string' || !p.trim() )

          if( bare ){
            binds.push({ prop: name, e: slot( slots[ 0 ].expr ) })
            // drop the declaration entirely — the value lives inline on the root
            drop()
            i = parsed.end + ( src[ parsed.end ] === ';' ? 1 : 0 )
            stmt = i
            continue
          }

          let text = ''
          for( const part of parsed.parts ){
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

          emit( value( text ) )
          i = parsed.end
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

      open()
      stmt = ++i
      continue
    }

    if( c === '}' ){
      /**
       * A stray `}` would close the scope wrap early and leak every rule
       * after it out unscoped. Drop it, loudly.
       */
      if( stack.length > 1 ) close()
      else {
        warn( 'LIPS-S007', 'Unmatched `}` dropped', i, 1 )
        // it still ended whatever declaration it followed
        cur && flush(';')
      }

      stmt = ++i
      continue
    }

    if( c === ';' ){
      if( stack.length === 1 && HOISTED_STATEMENT.test( cur ) ) statements += drop() + ';'
      else flush(';')

      stmt = ++i
      continue
    }

    emit( c )
    i++
  }

  if( stack.length > 1 ){
    unterminated || warn( 'LIPS-S007', 'Unclosed `{` closed at the end', src.length, 0 )
    while( stack.length > 1 ) close()
  }

  // A statement at-rule may end at EOF without its `;`
  HOISTED_STATEMENT.test( cur ) && ( statements += drop() + ';' )
  // A trailing declaration with no `;`
  flush('')

  return { css: out, statements, hoisted, exprs, binds, props }
}

// ------------------------------------------------------------------ compile
/**
 * Compile a component stylesheet to StyleIR.
 *
 * The scanner MUST run before any preprocessor: a brace in a declaration
 * value breaks Stylis's block parsing, so interpolations are replaced
 * with `var()` first.
 */
export function compileStyle( src: string, options: StyleCompileOptions ): StyleCompileResult {
  const
  diagnostics: TemplateDiagnostic[] = [],
  preprocess = options.preprocess || PREPROCESSOR,
  { css, statements, hoisted, exprs, binds, props } = scan( src, options, !preprocess, diagnostics )

  const empty: StyleIR = { v: 1, nsp: options.nsp, css: '', exprs: [], binds: [] }

  /**
   * The scope wrap IS nesting — `[rel="x"] { .a { … } }`. Without a
   * preprocessor the sheet ships nested and the browser's own CSS nesting
   * resolves it: same selectors, same cascade. A preprocessor (opt-in,
   * `@lipsjs/lips/stylis`) flattens it instead, for engines that predate
   * nesting.
   *
   * Hoisting happens either way, so a preprocessor of your own — a
   * minifier, say — is never handed a `@keyframes` stuck inside a style
   * rule.
   */
  const
  scoped = options.meta || !css ? css : `[rel="${options.nsp}"]{${css}}`,
  body = hoisted + scoped,
  source = options.layer ? `@layer ${options.layer}{${body}}` : body

  let sheet: string

  try { sheet = preprocess ? preprocess( source ) : source }
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

  /**
   * Statement at-rules go first, ahead of the registrations and outside
   * any `@layer` block — anywhere else the browser ignores them.
   */
  const ir: StyleIR = { v: 1, nsp: options.nsp, css: statements + registrations + sheet, exprs, binds }
  if( props.length ) ir.props = props

  return { ir, diagnostics }
}
