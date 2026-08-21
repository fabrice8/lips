/**
 * Phase 2 — IR compiler (RFC-001 §4)
 *
 * TemplateAST → TemplateIR:
 *  - static HTML skeletons per block, ready for one-time <template>
 *    parsing + per-instance cloneNode
 *  - integer-path bind table (childNodes index walks — no string paths)
 *  - control-flow block nodes anchored by comment placeholders whose
 *    paths are precomputed (the compiler simulates browser text-node
 *    coalescing so paths survive the HTML round-trip)
 *  - deduped expression table; every authored expression is validated
 *    at compile time and its diagnostics re-anchored to template
 *    line/col
 *
 * The output is JSON-serializable and deterministic — it is the
 * Modela artifact, the runtime render program, and the hot-swap
 * diff unit.
 */

import type {
  TemplateNode,
  ElementNode,
  AttrNode,
  ExprSlot,
  TemplateDiagnostic
} from './parser'
import { parseTemplate } from './parser'
import { parseExpression } from './expression'

// ------------------------------------------------------------------- types
export type Path = number[]
export type E = number

export type CompInput =
  | { e: E }
  | { lit: unknown }

export interface TemplateIR {
  v: 1
  exprs: string[]
  root: BlockIR
}

export interface BlockIR {
  html: string
  /**
   * Scope variable names visible to this block's binds
   * (iterator args, async arm args, let/const names —
   * let names are block-scoped from block start, see RFC)
   */
  scope: string[]
  binds: BindIR[]
  blocks: ChildIR[]
}

/**
 * `i18n` marks a bind as translatable; `ik` carries the STABLE key to
 * look it up by (RFC-005 §3). Without `ik` the rendered text is its own
 * key — reword the source and the translation is orphaned.
 */
export type BindIR =
  | { t: 'text',   p: Path, e: E, i18n?: 1, ik?: string } // anchor; runtime inserts a text node after it
  | { t: 'attr',   p: Path, name: string, e: E, i18n?: 1, ik?: string }
  | { t: 'prop',   p: Path, name: string, e: E, i18n?: 1, ik?: string, ref?: string } // @html / @text / @format
  | { t: 'event',  p: Path, name: string, e: E }         // raw instruction — runtime resolves handler form
  | { t: 'spread', p: Path, e: E }

export interface ArmIR {
  args: string[]
  block: BlockIR
}

/**
 * One macro call-site assignment, in SOURCE ORDER so later
 * entries override earlier ones (`<option key=k ...each/>` —
 * the spread wins over `key` for keys it contains).
 */
export type MacroSet =
  | { name: string, ci: CompInput }
  | { spread: E }

export type ChildIR =
  | { t: 'macro',   p: Path, name: string, sets: MacroSet[], args: string[], block: BlockIR }
  | { t: 'if',      p: Path, branches: { when: E | null, block: BlockIR }[] }
  | { t: 'for',     p: Path, of?: E, from?: CompInput, to?: CompInput, by?: CompInput, args: string[], block: BlockIR }
  | { t: 'switch',  p: Path, on: E, cases: { is: CompInput | null, block: BlockIR }[] }
  | { t: 'async',   p: Path, awaitE: E, then?: ArmIR, catch?: ArmIR, loading?: BlockIR }
  | { t: 'let',     p: Path, const: boolean, vars: Record<string, CompInput> }
  | { t: 'log',     p: Path, e: E }
  /**
   * `<context …>` / `<i18n lang=…>` — a context layer over the subtree
   * (RFC-005 §4). `vars` are the provided keys; `lang` is the scoped
   * language. One IR kind, two spellings: they differ only in which
   * field they fill.
   */
  | { t: 'provide', p: Path, vars: Record<string, CompInput>, lang?: CompInput, block: BlockIR }
  | { t: 'comp',    p: Path, name: string, inputs: Record<string, CompInput>, spreads: E[], events: { name: string, e: E }[], contents?: ArmIR }
  | { t: 'dynamic', p: Path, tag: E, inputs: Record<string, CompInput>, spreads: E[], events: { name: string, e: E }[], contents?: ArmIR }

export interface CompileResult {
  ir: TemplateIR
  diagnostics: TemplateDiagnostic[]
}

export interface CompileOptions {
  /** `<macro [argv] name="X">…</macro>` definitions, inlined at call sites */
  macros?: string
}

interface MacroDef {
  name: string
  argv: string[]
  children: TemplateNode[]
}

// ------------------------------------------------------------------ tables
const ANCHOR = '<!--$-->'

const CONTROL_TAGS = new Set([
  'if', 'else-if', 'else', 'for', 'switch', 'async', 'let', 'const', 'log',
  // RFC-005 §4 — scoped context / scoped language
  'context', 'i18n'
])
const ARM_TAGS = new Set([ 'case', 'default', 'then', 'catch', 'loading' ])

/** Standard HTML + common SVG tags — anything else is a component candidate */
const HTML_TAGS = new Set([
  'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'base', 'bdi', 'bdo',
  'blockquote', 'body', 'br', 'button', 'canvas', 'caption', 'cite', 'code', 'col',
  'colgroup', 'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl',
  'dt', 'em', 'embed', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2',
  'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html', 'i', 'iframe', 'img',
  'input', 'ins', 'kbd', 'label', 'legend', 'li', 'link', 'main', 'map', 'mark', 'menu',
  'meta', 'meter', 'nav', 'noscript', 'object', 'ol', 'optgroup', 'option', 'output', 'p',
  'picture', 'pre', 'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'script', 'section',
  'select', 'slot', 'small', 'source', 'span', 'strong', 'style', 'sub', 'summary', 'sup',
  'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th', 'thead', 'time', 'title',
  'tr', 'track', 'u', 'ul', 'var', 'video', 'wbr',
  // SVG
  'svg', 'circle', 'clippath', 'defs', 'ellipse', 'foreignobject', 'g', 'image', 'line',
  'lineargradient', 'marker', 'mask', 'path', 'pattern', 'polygon', 'polyline',
  'radialgradient', 'rect', 'stop', 'symbol', 'text', 'tspan', 'use'
])

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
])

// ----------------------------------------------------------------- helpers
const escText = ( s: string ) => s.replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' )
const escAttr = ( s: string ) => s.replace( /&/g, '&amp;' ).replace( /"/g, '&quot;' ).replace( /</g, '&lt;' )

const isNumeric = ( s: string ) => s !== '' && !isNaN( Number( s ) )

/**
 * Does this source denote an OBJECT LITERAL rather than a value?
 *
 * Two spellings arrive here and both are the same React habit:
 *
 *   style="{ margin: '3rem' }"     — braces eaten as an interpolation slot,
 *                                    so the source is bare `margin: '3rem'`
 *   style={{ margin: '3rem' }}     — a real object expression
 *
 * The discriminator is a top-level `:` reached before any top-level `?`,
 * which is what keeps the forms that DO work out of it: a ternary
 * (`{state.on ? 'color:red' : ''}`), `??` and `?.` all hit the `?` first,
 * and a `:` inside a string (`{!state.on && 'color: red'}`) is skipped.
 */
const isObjectLiteral = ( src: string ): boolean => {
  const s = src.trim()
  let depth = 0

  for( let i = 0; i < s.length; i++ ){
    const c = s[ i ]

    if( c === "'" || c === '"' || c === '`' ){
      i++
      while( i < s.length && s[ i ] !== c ){
        if( s[ i ] === '\\' ) i++
        i++
      }
      continue
    }

    if( c === '(' || c === '[' || c === '{' ) depth++
    else if( c === ')' || c === ']' || c === '}' ){
      depth--
      // A leading `{` that closes on the last char wraps the whole value
      if( depth === 0 && s[ 0 ] === '{' && i === s.length - 1 )
        return isObjectLiteral( s.slice( 1, -1 ) )
    }
    else if( depth === 0 ){
      if( c === '?' ) return false
      if( c === ':' ) return true
    }
  }
  return false
}

/**
 * The attribute's value as ONE expression source, or '' when it is not a
 * single bare expression. `width: {state.w}px` has literal text around
 * its slot, so it is CSS with a value interpolated in — not a candidate.
 */
const objectishAttr = ( attr: AttrNode ) => {
  if( attr.k === 'expr' ) return attr.source
  if( attr.k !== 'interp' ) return ''

  const slots = attr.parts.filter( ( p ): p is ExprSlot => typeof p !== 'string' )

  return slots.length === 1
      && attr.parts.every( p => typeof p !== 'string' || !p.trim() )
    ? slots[ 0 ].expr
    : ''
}

// ---------------------------------------------------------------- compiler
class Compiler {
  private exprs: string[] = []
  private exprIndex = new Map<string, E>()
  private lineStarts: number[] | null = null
  /** Guards against macros that (indirectly) call themselves */
  private macroStack: string[] = []

  readonly diagnostics: TemplateDiagnostic[] = []

  constructor( private src: string, private macros = new Map<string, MacroDef>() ){}

  // ---- diagnostics
  private locate( offset: number ){
    if( !this.lineStarts ){
      this.lineStarts = [ 0 ]
      for( let i = 0; i < this.src.length; i++ )
        if( this.src[ i ] === '\n' ) this.lineStarts.push( i + 1 )
    }

    let lo = 0, hi = this.lineStarts.length - 1
    while( lo < hi ){
      const mid = ( lo + hi + 1 ) >> 1
      this.lineStarts[ mid ] <= offset ? lo = mid : hi = mid - 1
    }

    return { line: lo + 1, col: offset - this.lineStarts[ lo ] + 1 }
  }
  private report( code: string, severity: 'error' | 'warning', message: string, offset: number, length = 1, hint?: string ){
    const { line, col } = this.locate( offset )
    this.diagnostics.push({ code, severity, message, hint, loc: { line, col, offset, length } })
  }

  // ---- expression table
  /** Register an authored expression: validate + dedupe */
  private expr( source: string, at?: { offset: number, length?: number } ): E {
    const cached = this.exprIndex.get( source )
    if( cached !== undefined ) return cached

    const { diagnostics } = parseExpression( source )
    for( const d of diagnostics ){
      const offset = ( at?.offset ?? 0 ) + d.loc.offset
      this.report( d.code, 'error', d.message, offset, d.loc.length )
    }

    const idx = this.exprs.length
    this.exprs.push( source )
    this.exprIndex.set( source, idx )
    return idx
  }
  /** Register a synthesized expression (parts already validated) */
  private synth( source: string ): E {
    const cached = this.exprIndex.get( source )
    if( cached !== undefined ) return cached

    const idx = this.exprs.length
    this.exprs.push( source )
    this.exprIndex.set( source, idx )
    return idx
  }
  /**
   * Interpolation parts → one concat expression.
   * Nullish parts render '' (RFC decision #4).
   */
  private concat( parts: ( string | ExprSlot )[] ): E {
    parts
      .filter( ( p ): p is ExprSlot => typeof p !== 'string' )
      .forEach( p => {
        const { diagnostics } = parseExpression( p.expr )
        for( const d of diagnostics )
          this.report( d.code, 'error', d.message, p.loc.offset + d.loc.offset, d.loc.length )
      })

    const source = parts
      .map( p => typeof p === 'string' ? JSON.stringify( p ) : `((${p.expr})??"")` )
      .join('+')

    return this.synth( source )
  }
  private compInput( attr: AttrNode & { k: 'literal' | 'expr' | 'interp' | 'bool' } ): CompInput {
    switch( attr.k ){
      case 'literal': return { lit: attr.value }
      case 'bool': return { lit: attr.value }
      case 'expr': return { e: this.expr( attr.source, attr.loc ) }
      case 'interp': return { e: this.concat( attr.parts ) }
    }
  }

  // ---- entry
  compile( children: TemplateNode[] ): TemplateIR {
    return { v: 1, exprs: this.exprs, root: this.block( children, [] ) }
  }

  /**
   * Compile a node list into a BlockIR: static HTML with
   * precomputed paths for every bind/anchor. `scope` may
   * grow when <let>/<const> introduce names.
   */
  private block( children: TemplateNode[], scope: string[] ): BlockIR {
    const block: BlockIR = { html: '', scope: [ ...scope ], binds: [], blocks: [] }
    const html: string[] = []

    /**
     * Emit a sibling list at `path` depth. Returns nothing —
     * appends to html / block.binds / block.blocks.
     * The index simulation must match browser parsing:
     * consecutive static text coalesces into ONE node.
     */
    const emitSiblings = ( nodes: TemplateNode[], path: Path, i18nParent = false, i18nKey?: string ) => {
      let index = 0
      let lastWasText = false

      const anchor = (): Path => {
        html.push( ANCHOR )
        lastWasText = false
        return [ ...path, index++ ]
      }

      for( let i = 0; i < nodes.length; i++ ){
        const node = nodes[ i ]

        switch( node.t ){
          case 'text': {
            /**
             * Static text under an `i18n` element still needs a
             * bind — there is nothing to translate in a skeleton.
             */
            if( i18nParent ){
              const bind: BindIR = { t: 'text', p: anchor(), e: this.synth( JSON.stringify( node.value ) ), i18n: 1 }
              if( i18nKey ) bind.ik = i18nKey
              block.binds.push( bind )
              break
            }

            html.push( escText( node.value ) )
            if( !lastWasText ) index++
            lastWasText = true
            break
          }
          case 'comment': {
            html.push( `<!--${node.value.replace( /--/g, '- -' )}-->` )
            lastWasText = false
            index++
            break
          }
          case 'interp': {
            const bind: BindIR = { t: 'text', p: anchor(), e: this.concat( node.parts ) }
            if( i18nParent ) bind.i18n = 1
            if( i18nParent && i18nKey ) bind.ik = i18nKey
            block.binds.push( bind )
            break
          }
          case 'fragment': {
            /**
             * Nested fragments are transparent: children emit
             * into the current index space. Rebuild sibling
             * numbering by splicing children inline.
             */
            nodes = [ ...nodes.slice( 0, i ), ...node.children, ...nodes.slice( i + 1 ) ]
            i--
            break
          }
          case 'element': {
            // Control flow → anchored child block
            if( CONTROL_TAGS.has( node.tag ) ){
              this.controlBlock( node, nodes, i, anchor(), block, scope )

              // if-chains consume their else-if/else siblings
              if( node.tag === 'if' ){
                let j = i + 1
                while( j < nodes.length ){
                  const sib = nodes[ j ]
                  if( sib.t === 'element' && ( sib.tag === 'else-if' || sib.tag === 'else' ) ) j++
                  else break
                }
                nodes = [ ...nodes.slice( 0, i + 1 ), ...nodes.slice( j ) ]
              }
              break
            }

            // Arm tags outside their parents
            if( ARM_TAGS.has( node.tag ) ){
              this.report( 'LIPS-C002', 'error',
                `<${node.tag}> is only valid inside its parent construct`, node.loc.offset, node.loc.length )
              break
            }

            // Dynamic tag
            if( node.tag === '#dynamic' ){
              block.blocks.push( this.compLike( node, anchor(), scope, 'dynamic' ) )
              break
            }

            // Macro call → inline the definition body
            if( this.macros.has( node.tag ) ){
              const macroBlock = this.macroCall( node, anchor(), scope )
              macroBlock && block.blocks.push( macroBlock )
              break
            }

            // Component candidate
            if( !HTML_TAGS.has( node.tag ) ){
              block.blocks.push( this.compLike( node, anchor(), scope, 'comp' ) )
              break
            }

            // Plain HTML element
            this.emitElement( node, path, index++, html, block, emitSiblings )
            lastWasText = false
            break
          }
        }
      }
    }

    emitSiblings( children, [] )
    block.html = html.join('')
    return block
  }

  /** Static open tag + dynamic binds + children recursion */
  private emitElement(
    node: ElementNode,
    path: Path,
    index: number,
    html: string[],
    block: BlockIR,
    emitSiblings: ( nodes: TemplateNode[], path: Path, i18nParent?: boolean, i18nKey?: string ) => void
  ){
    const p: Path = [ ...path, index ]
    let open = `<${node.tag}`

    /**
     * `i18n` marks an element's own text and its visual
     * attributes (title/placeholder) as translatable.
     */
    /** `args` (`[a,b]`) is the one attribute form with no name */
    const named = node.attrs.filter( a => 'name' in a ) as ( AttrNode & { name: string } )[]

    const i18n = named.some( a =>
      a.name === 'i18n' && ( ( a.k === 'bool' && a.value ) || a.k === 'literal' ) )
    const translatableAttr = ( name: string ) => i18n && ( name === 'title' || name === 'placeholder' )

    /**
     * Stable translation ids (RFC-005 §3).
     *
     *   <h1 i18n="hero.title">Welcome</h1>
     *   <input i18n i18n-placeholder="search.hint" placeholder="Search…">
     *
     * `i18n="key"` ids the element's own text; `i18n-<attr>="key"` ids
     * that attribute. Bare `i18n` keeps the gettext model where the
     * source text is the key — fine when a human owns the wording,
     * lossy when a generator rewrites it.
     */
    const keyOf = ( name: string ) => {
      const a = named.find( x => x.name === name && x.k === 'literal' )
      return a && 'value' in a && a.value ? String( a.value ) : undefined
    }
    const textKey = keyOf('i18n')
    const attrKey = ( name: string ) => keyOf(`i18n-${name}`)

    /** `i18n-<attr>` on an element that never opted in translates nothing */
    !i18n && named.some( a => a.name.startsWith('i18n-') )
      && this.report( 'LIPS-C014', 'warning',
                      `i18n-* key on <${node.tag}> without the 'i18n' marker — the attribute will not be translated`,
                      node.loc.offset, node.loc.length )

    for( const attr of node.attrs ){
      /**
       * On an ELEMENT, `style=` is CSS text — `{…}` in it is an
       * interpolation slot, so a React-style object literal never reaches
       * the DOM: it goes to the expression compiler, which rejects the
       * `:` (LIPS-E003, naming the token and not the mistake) and the
       * element renders unstyled. Say what the fix is instead.
       *
       * Components are untouched: there `style` is an input like any
       * other, and an object is a perfectly good value for it.
       */
      if( 'name' in attr && attr.name === 'style' ){
        const source = objectishAttr( attr )

        if( source && isObjectLiteral( source ) ){
          this.report( 'LIPS-C019', 'error',
            `style= on <${node.tag}> takes CSS text, not an object literal`,
            attr.loc.offset, attr.loc.length,
            'Write the declarations as CSS — style="border: 2px solid gray; margin: 3rem" — '
            + 'and interpolate values into it where they vary: style="margin: {state.gap}rem". '
            + 'Styles that need pseudo-classes, media queries or keyframes belong in the '
            + "component's stylesheet." )
          continue
        }
      }

      // Quoted handler — reported and dropped, never emitted as a dead attribute
      if( this.quotedEvent( node.tag, attr ) ) continue

      switch( attr.k ){
        case 'literal':
          if( attr.name === '@format' ){
            block.binds.push( this.formatBind( p, attr ) )
            break
          }
          if( attr.name.startsWith('@') ){
            block.binds.push({ t: 'prop', p, name: attr.name.slice( 1 ), e: this.synth( JSON.stringify( attr.value ) ) })
            break
          }
          // `i18n="key"` / `i18n-<attr>="key"` are directives, not output
          if( attr.name === 'i18n' || attr.name.startsWith('i18n-') ) break
          // Literal title/placeholder under i18n must become a bind to be translated
          if( translatableAttr( attr.name ) ){
            const bind: BindIR = { t: 'attr', p, name: attr.name, e: this.synth( JSON.stringify( attr.value ) ), i18n: 1 }
            const k = attrKey( attr.name )
            if( k ) bind.ik = k
            block.binds.push( bind )
            break
          }
          open += ` ${attr.name}="${escAttr( attr.value )}"`
          break
        case 'bool':
          // `i18n` is a compiler directive, not an output attribute
          attr.name !== 'i18n' && attr.value && ( open += ` ${attr.name}` )
          break
        case 'expr': {
          if( attr.name === '@format' ){
            block.binds.push( this.formatBind( p, attr ) )
            break
          }
          if( attr.name.startsWith('@') ){
            block.binds.push({ t: 'prop', p, name: attr.name.slice( 1 ), e: this.expr( attr.source, attr.loc ) })
            break
          }

          const bind: BindIR = { t: 'attr', p, name: attr.name, e: this.expr( attr.source, attr.loc ) }
          if( translatableAttr( attr.name ) ){
            bind.i18n = 1
            const k = attrKey( attr.name )
            if( k ) bind.ik = k
          }
          block.binds.push( bind )
          break
        }
        case 'interp': {
          if( attr.name === '@format' ){
            block.binds.push( this.formatBind( p, attr ) )
            break
          }
          /**
           * `@text="Row {i + 1}"` — an @-prop whose value INTERPOLATES.
           * Without this it fell through to the attribute branch and set a
           * literal `@text` attribute on the element, so the prop it names
           * was never written and nothing rendered.
           */
          if( attr.name.startsWith('@') ){
            block.binds.push({ t: 'prop', p, name: attr.name.slice( 1 ), e: this.concat( attr.parts ) })
            break
          }

          const bind: BindIR = { t: 'attr', p, name: attr.name, e: this.concat( attr.parts ) }
          if( translatableAttr( attr.name ) ){
            bind.i18n = 1
            const k = attrKey( attr.name )
            if( k ) bind.ik = k
          }
          block.binds.push( bind )
          break
        }
        case 'event':
          block.binds.push({ t: 'event', p, name: attr.name, e: this.synth( attr.source ) })
          break
        case 'spread':
          block.binds.push({ t: 'spread', p, e: this.expr( attr.source, attr.loc ) })
          break
        case 'fn':
          this.report( 'LIPS-C007', 'warning',
            `Callable attribute '${attr.name}(…)' has no meaning on <${node.tag}>`, attr.loc.offset, attr.loc.length )
          break
        case 'args':
          this.report( 'LIPS-C008', 'warning',
            `Iterator arguments are not applicable to <${node.tag}>`, attr.loc.offset, attr.loc.length )
          break
      }
    }

    if( VOID_ELEMENTS.has( node.tag ) ){
      html.push( open + '>' )
      return
    }

    html.push( open + '>' )

    /**
     * A key ids ONE FIXED string. Two shapes break that:
     *
     *   <h1 i18n="k">Hello {state.name}</h1>   — interpolated
     *   <h1 i18n="k">a<b>x</b>c</h1>           — several text runs
     *
     * In the first the key would resolve the whole entry and silently
     * drop the interpolated value; in the second every run would render
     * the same translation. Both are what `@format` exists for — it
     * takes a reference AND params — so name it and fall back to
     * source-text keying rather than emit something wrong.
     */
    let key = textKey
    const runs = node.children.filter( c => c.t === 'text' || c.t === 'interp' )
    if( key && ( runs.length > 1 || runs.some( c => c.t === 'interp' ) ) ){
      this.report( 'LIPS-C015', 'error',
        `<${node.tag} i18n="${key}"> keys text that is not a single fixed string. `
        + `Use @format="${key}, { … }" for interpolated text.`,
        node.loc.offset, node.loc.length )
      key = undefined
    }

    node.children.length && emitSiblings( node.children, p, i18n, key )
    html.push( `</${node.tag}>` )
  }

  /**
   * `@format="reference, { params }"` → a prop bind carrying the
   * dictionary reference plus a compiled params expression.
   */
  private formatBind( p: Path, attr: AttrNode & { k: 'literal' | 'expr' | 'interp' } ): BindIR {
    /**
     * `@format` carries a reference plus a params OBJECT, so the
     * braces are data — not interpolation. Reconstruct the raw
     * source when the parser split it into interpolation parts.
     */
    const raw = attr.k === 'literal' ? attr.value
              : attr.k === 'expr' ? attr.source
              : attr.parts.map( part => typeof part === 'string' ? part : `{${part.expr}}` ).join('')

    const comma = raw.indexOf(',')

    if( comma === -1 ){
      this.report( 'LIPS-C012', 'error',
        `@format expects "reference, { params }"`, attr.loc.offset, attr.loc.length )
      return { t: 'prop', p, name: 'format', e: this.synth('({})'), ref: raw.trim() }
    }

    const
    ref = raw.slice( 0, comma ).trim(),
    params = raw.slice( comma + 1 ).trim()

    return { t: 'prop', p, name: 'format', e: this.expr( params, attr.loc ), ref }
  }

  // ---- control-flow blocks
  private attrsOf( node: ElementNode ){
    const
    byName = new Map<string, AttrNode>(),
    args: string[] = []

    for( const attr of node.attrs ){
      if( attr.k === 'args' ) args.push( ...attr.names )
      else if( 'name' in attr ) byName.set( attr.name, attr )
    }
    return { byName, args }
  }

  private controlBlock( node: ElementNode, siblings: TemplateNode[], i: number, p: Path, block: BlockIR, scope: string[] ){
    switch( node.tag ){
      case 'if': {
        const branches: { when: E | null, block: BlockIR }[] = [{
          when: node.head ? this.expr( node.head.expr, node.head.loc ) : this.missingHead( node ),
          block: this.block( node.children, scope )
        }]

        for( let j = i + 1; j < siblings.length; j++ ){
          const sib = siblings[ j ]
          if( sib.t !== 'element' ) break

          if( sib.tag === 'else-if' )
            branches.push({
              when: sib.head ? this.expr( sib.head.expr, sib.head.loc ) : this.missingHead( sib ),
              block: this.block( sib.children, scope )
            })
          else if( sib.tag === 'else' ){
            branches.push({ when: null, block: this.block( sib.children, scope ) })
            break
          }
          else break
        }

        block.blocks.push({ t: 'if', p, branches })
        break
      }

      case 'else-if':
      case 'else':
        this.report( 'LIPS-C001', 'error', `<${node.tag}> without a preceding <if>`, node.loc.offset, node.loc.length )
        break

      case 'for': {
        const { byName, args } = this.attrsOf( node )
        const
        inAttr = byName.get('in'),
        fromAttr = byName.get('from'),
        toAttr = byName.get('to'),
        byAttr = byName.get('by')

        if( !inAttr && !fromAttr ){
          this.report( 'LIPS-C004', 'error', `<for> requires 'in' or 'from'/'to'`, node.loc.offset, node.loc.length )
          break
        }

        const child: ChildIR = {
          t: 'for', p, args,
          block: this.block( node.children, [ ...scope, ...args ] )
        }
        if( inAttr && inAttr.k === 'expr' ) child.of = this.expr( inAttr.source, inAttr.loc )
        if( fromAttr ) child.from = this.numInput( fromAttr )
        if( toAttr ) child.to = this.numInput( toAttr )
        if( byAttr && ( byAttr.k === 'literal' || byAttr.k === 'expr' ) )
          child.by = byAttr.k === 'literal' ? { lit: byAttr.value } : { e: this.expr( byAttr.source, byAttr.loc ) }

        block.blocks.push( child )
        break
      }

      case 'switch': {
        const on = node.head ? this.expr( node.head.expr, node.head.loc ) : this.missingHead( node )
        const cases: { is: CompInput | null, block: BlockIR }[] = []

        for( const child of node.children ){
          if( child.t !== 'element' ) continue

          if( child.tag === 'case' ){
            const { byName } = this.attrsOf( child )
            const isAttr = byName.get('is')

            if( !isAttr || ( isAttr.k !== 'literal' && isAttr.k !== 'expr' ) ){
              this.report( 'LIPS-C004', 'error', `<case> requires an 'is' attribute`, child.loc.offset, child.loc.length )
              continue
            }
            cases.push({
              is: isAttr.k === 'literal' ? { lit: isAttr.value } : { e: this.expr( isAttr.source, isAttr.loc ) },
              block: this.block( child.children, scope )
            })
          }
          else if( child.tag === 'default' )
            cases.push({ is: null, block: this.block( child.children, scope ) })
          else
            this.report( 'LIPS-C003', 'error', `Only <case>/<default> are valid inside <switch>`, child.loc.offset, child.loc.length )
        }

        block.blocks.push({ t: 'switch', p, on, cases })
        break
      }

      case 'async': {
        const awaitAttr = node.attrs.find( a => a.k === 'fn' && a.name === 'await' ) as ( AttrNode & { k: 'fn' } ) | undefined
        if( !awaitAttr ){
          this.report( 'LIPS-C004', 'error', `<async> requires await(…)`, node.loc.offset, node.loc.length )
          break
        }

        const child: ChildIR = { t: 'async', p, awaitE: this.expr( awaitAttr.source, awaitAttr.loc ) }

        for( const arm of node.children ){
          if( arm.t !== 'element' ) continue
          const { args } = this.attrsOf( arm )

          if( arm.tag === 'then' ) child.then = { args, block: this.block( arm.children, [ ...scope, ...args ] ) }
          else if( arm.tag === 'catch' ) child.catch = { args, block: this.block( arm.children, [ ...scope, ...args ] ) }
          else if( arm.tag === 'loading' ) child.loading = this.block( arm.children, scope )
          else this.report( 'LIPS-C003', 'error', `Only <then>/<catch>/<loading> are valid inside <async>`, arm.loc.offset, arm.loc.length )
        }

        block.blocks.push( child )
        break
      }

      case 'let':
      case 'const': {
        const vars: Record<string, CompInput> = {}

        for( const attr of node.attrs ){
          /**
           * Spread on <let> cannot work with compiled expressions:
           * the spread's keys are unknown at compile time, so binds
           * referencing them as bare identifiers can never resolve.
           * Assign the object to ONE name instead.
           */
          if( attr.k === 'spread' ){
            this.report( 'LIPS-C013', 'error',
              `Spread is not supported on <${node.tag}> — scope names must be known at compile time`,
              attr.loc.offset, attr.loc.length,
              `Assign it to one variable: <${node.tag} obj={ ${attr.source} }/> and read obj.<key>` )
            continue
          }

          if( attr.k === 'literal' || attr.k === 'expr' || attr.k === 'interp' || attr.k === 'bool' ){
            vars[ attr.name ] = this.compInput( attr )
            /**
             * RFC decision #1: let/const names are block-scoped
             * (visible to every bind of the enclosing block)
             */
            !block.scope.includes( attr.name ) && block.scope.push( attr.name )
            !scope.includes( attr.name ) && scope.push( attr.name )
          }
        }

        block.blocks.push({ t: 'let', p, const: node.tag === 'const', vars })
        break
      }

      case 'log':
        /**
         * A log head is an argument LIST (like an event
         * instruction), not a single expression — the
         * runtime resolves it; no single-expr validation.
         */
        block.blocks.push({ t: 'log', p, e: node.head ? this.synth( node.head.expr ) : this.missingHead( node ) })
        break

      /**
       * Scoped context (RFC-005 §4):
       *
       *   <context selection=state.sel tool=state.tool> … </context>
       *
       * Every attribute becomes a context key visible to the subtree —
       * components included — shadowing the global store for that key
       * only. Unlike `<let>`, the names do NOT enter expression scope:
       * they are read as `context.selection`, which is what makes a
       * child component see them without the parent passing inputs.
       */
      case 'context': {
        const vars: Record<string, CompInput> = {}

        for( const attr of node.attrs ){
          /**
           * Same reasoning as <let>: a spread's keys are unknown at
           * compile time. Here they would also silently fail to shadow
           * anything, since lookup is by name at render.
           */
          if( attr.k === 'spread' ){
            this.report( 'LIPS-C016', 'error',
              `Spread is not supported on <context> — provided keys must be known at compile time`,
              attr.loc.offset, attr.loc.length,
              `Provide them one by one: <context a=obj.a b=obj.b>` )
            continue
          }

          if( attr.k === 'literal' || attr.k === 'expr' || attr.k === 'interp' || attr.k === 'bool' )
            vars[ attr.name ] = this.compInput( attr )
        }

        if( !Object.keys( vars ).length )
          this.report( 'LIPS-C017', 'warning',
            `<context> provides nothing — it renders its children unchanged`,
            node.loc.offset, node.loc.length )

        block.blocks.push({ t: 'provide', p, vars, block: this.block( node.children, scope ) })
        break
      }

      /**
       * Scoped language (RFC-005 §4):
       *
       *   <i18n lang=state.docLang> … </i18n>
       *
       * The subtree's translatable binds resolve against `lang` instead
       * of the global language — a document pane in the content's
       * language while the chrome stays in the reader's.
       */
      case 'i18n': {
        const { byName } = this.attrsOf( node )
        const langAttr = byName.get('lang')

        if( !langAttr ){
          this.report( 'LIPS-C018', 'error',
            `<i18n> requires a 'lang' attribute: <i18n lang=state.docLang>`,
            node.loc.offset, node.loc.length )
          break
        }

        block.blocks.push({
          t: 'provide', p, vars: {},
          lang: this.compInput( langAttr as AttrNode & { k: 'literal' | 'expr' | 'interp' | 'bool' } ),
          block: this.block( node.children, scope )
        })
        break
      }
    }
  }

  private missingHead( node: ElementNode ): E {
    this.report( 'LIPS-C004', 'error', `<${node.tag}> requires a head expression: <${node.tag}( … )>`, node.loc.offset, node.loc.length )
    return this.synth('undefined')
  }
  private numInput( attr: AttrNode ): CompInput {
    if( attr.k === 'literal' ) return { lit: isNumeric( attr.value ) ? Number( attr.value ) : attr.value }
    if( attr.k === 'expr' ) return isNumeric( attr.source ) ? { lit: Number( attr.source ) } : { e: this.expr( attr.source, attr.loc ) }
    return { lit: undefined }
  }

  /**
   * Macro call site → inlined block.
   *
   * Every call-site attribute becomes a block-scoped variable
   * (the macro's declared `argv` are the named ones; all of them
   * together also form `arguments` at runtime).
   */
  private macroCall( node: ElementNode, p: Path, scope: string[] ): ChildIR | null {
    const macro = this.macros.get( node.tag )!

    if( this.macroStack.includes( macro.name ) ){
      this.report( 'LIPS-C009', 'error',
        `Recursive macro <${macro.name}> (${[ ...this.macroStack, macro.name ].join(' → ')})`,
        node.loc.offset, node.loc.length )
      return null
    }

    /**
     * Assignments in SOURCE ORDER — spreads participate like any
     * other set, so `key=k ...each` lets the spread override `key`
     * while `...each key=k` lets the explicit attr win.
     *
     * Undeclared argv default to `undefined` at runtime: falsy in
     * conditions, attribute-removing, renders '' in text (RFC #4).
     */
    const sets: MacroSet[] = []
    for( const attr of node.attrs ){
      if( attr.k === 'literal' || attr.k === 'expr' || attr.k === 'interp' || attr.k === 'bool' )
        sets.push({ name: attr.name, ci: this.compInput( attr ) })
      else if( attr.k === 'spread' )
        sets.push({ spread: this.expr( attr.source, attr.loc ) })
    }

    this.macroStack.push( macro.name )
    const block = this.block( macro.children, [ ...scope, ...macro.argv ] )
    this.macroStack.pop()

    return { t: 'macro', p, name: macro.name, sets, args: macro.argv, block }
  }

  /** Components and dynamic tags share input/event/spread shape */
  /**
   * `on-click="…"` is NOT an event binding. The parser only produces an
   * `event` attribute for the instruction form `on-x( … )`; quoted, it
   * stays an ordinary attribute, so no listener is wired and the source
   * text lands in the DOM as a dead `on-click="() => …"`. Nothing failed
   * loudly, which is exactly the problem — same class as the `@text="…"`
   * and `style={…}` fall-throughs.
   */
  private quotedEvent( tag: string, attr: AttrNode ){
    if( !( 'name' in attr ) || !attr.name.startsWith('on-') ) return false

    this.report( 'LIPS-C020', 'error',
      `${attr.name}="…" on <${tag}> wires no listener`,
      attr.loc.offset, attr.loc.length,
      `Handlers use the instruction form: ${attr.name}( … ). `
      + `Quoted, it is an ordinary attribute — the handler never runs and the source is emitted into the DOM.` )
    return true
  }

  private compLike( node: ElementNode, p: Path, scope: string[], kind: 'comp' | 'dynamic' ): ChildIR {
    const
    inputs: Record<string, CompInput> = {},
    spreads: E[] = [],
    events: { name: string, e: E }[] = []
    let args: string[] = []

    for( const attr of node.attrs ){
      // A quoted handler on a component is the same dead attribute, as an input
      if( attr.k !== 'event' && this.quotedEvent( node.tag, attr ) ) continue

      switch( attr.k ){
        case 'literal': case 'bool': case 'expr': case 'interp':
          inputs[ attr.name ] = this.compInput( attr )
          break
        case 'event':
          events.push({ name: attr.name, e: this.synth( attr.source ) })
          break
        case 'spread':
          spreads.push( this.expr( attr.source, attr.loc ) )
          break
        case 'args':
          args = [ ...args, ...attr.names ]
          break
        case 'fn':
          inputs[ attr.name ] = { e: this.expr( attr.source, attr.loc ) }
          break
      }
    }

    const contents: ArmIR | undefined = node.children.length
      ? { args, block: this.block( node.children, [ ...scope, ...args ] ) }
      : undefined

    return kind === 'comp'
      ? { t: 'comp', p, name: node.tag, inputs, spreads, events, contents }
      : { t: 'dynamic', p, tag: this.expr( node.dynamicTag!.expr, node.dynamicTag!.loc ), inputs, spreads, events, contents }
  }
}

// -------------------------------------------------------------------- API
/** Parse `<macro [argv] name="X">…</macro>` blocks into a lookup */
function parseMacros( src: string, diagnostics: TemplateDiagnostic[] ){
  const macros = new Map<string, MacroDef>()
  if( !src?.trim() ) return macros

  const parsed = parseTemplate( src )
  diagnostics.push( ...parsed.diagnostics )

  for( const node of parsed.root.children ){
    if( node.t !== 'element' ) continue

    if( node.tag !== 'macro' ){
      diagnostics.push({
        code: 'LIPS-C010', severity: 'warning',
        message: `Only <macro> definitions are allowed in the macros source — ignoring <${node.tag}>`,
        loc: { line: 1, col: 1, offset: node.loc.offset, length: node.loc.length }
      })
      continue
    }

    let name = ''
    const argv: string[] = []
    for( const attr of node.attrs ){
      if( attr.k === 'args' ) argv.push( ...attr.names )
      else if( attr.k === 'literal' && attr.name === 'name' ) name = attr.value
    }

    if( !name ){
      diagnostics.push({
        code: 'LIPS-C011', severity: 'error',
        message: `<macro> requires a name attribute`,
        loc: { line: 1, col: 1, offset: node.loc.offset, length: node.loc.length }
      })
      continue
    }

    // Tag names arrive lowercased — match call sites case-insensitively
    macros.set( name.toLowerCase(), { name, argv, children: node.children })
  }

  return macros
}

export function compileTemplate( src: string, options?: CompileOptions ): CompileResult {
  const diagnostics: TemplateDiagnostic[] = []
  const macros = parseMacros( options?.macros || '', diagnostics )

  const parsed = parseTemplate( src )
  const compiler = new Compiler( src, macros )
  const ir = compiler.compile( parsed.root.children )

  return { ir, diagnostics: [ ...diagnostics, ...parsed.diagnostics, ...compiler.diagnostics ] }
}
