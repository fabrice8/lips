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

export type BindIR =
  | { t: 'text',   p: Path, e: E }                       // anchor; runtime inserts a text node after it
  | { t: 'attr',   p: Path, name: string, e: E }
  | { t: 'prop',   p: Path, name: string, e: E }         // @html / @text / @format
  | { t: 'event',  p: Path, name: string, e: E }         // raw instruction — runtime resolves handler form
  | { t: 'spread', p: Path, e: E }

export interface ArmIR {
  args: string[]
  block: BlockIR
}

export type ChildIR =
  | { t: 'if',      p: Path, branches: { when: E | null, block: BlockIR }[] }
  | { t: 'for',     p: Path, of?: E, from?: CompInput, to?: CompInput, by?: CompInput, args: string[], block: BlockIR }
  | { t: 'switch',  p: Path, on: E, cases: { is: CompInput | null, block: BlockIR }[] }
  | { t: 'async',   p: Path, awaitE: E, then?: ArmIR, catch?: ArmIR, loading?: BlockIR }
  | { t: 'let',     p: Path, const: boolean, vars: Record<string, CompInput> }
  | { t: 'log',     p: Path, e: E }
  | { t: 'comp',    p: Path, name: string, inputs: Record<string, CompInput>, spreads: E[], events: { name: string, e: E }[], contents?: ArmIR }
  | { t: 'dynamic', p: Path, tag: E, inputs: Record<string, CompInput>, spreads: E[], events: { name: string, e: E }[], contents?: ArmIR }

export interface CompileResult {
  ir: TemplateIR
  diagnostics: TemplateDiagnostic[]
}

// ------------------------------------------------------------------ tables
const ANCHOR = '<!--$-->'

const CONTROL_TAGS = new Set([ 'if', 'else-if', 'else', 'for', 'switch', 'async', 'let', 'const', 'log' ])
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

// ---------------------------------------------------------------- compiler
class Compiler {
  private exprs: string[] = []
  private exprIndex = new Map<string, E>()
  private lineStarts: number[] | null = null

  readonly diagnostics: TemplateDiagnostic[] = []

  constructor( private src: string ){}

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
    const emitSiblings = ( nodes: TemplateNode[], path: Path ) => {
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
            block.binds.push({ t: 'text', p: anchor(), e: this.concat( node.parts ) })
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
    emitSiblings: ( nodes: TemplateNode[], path: Path ) => void
  ){
    const p: Path = [ ...path, index ]
    let open = `<${node.tag}`

    for( const attr of node.attrs ){
      switch( attr.k ){
        case 'literal':
          attr.name.startsWith('@')
            ? block.binds.push({ t: 'prop', p, name: attr.name.slice( 1 ), e: this.synth( JSON.stringify( attr.value ) ) })
            : open += ` ${attr.name}="${escAttr( attr.value )}"`
          break
        case 'bool':
          attr.value && ( open += ` ${attr.name}` )
          break
        case 'expr':
          attr.name.startsWith('@')
            ? block.binds.push({ t: 'prop', p, name: attr.name.slice( 1 ), e: this.expr( attr.source, attr.loc ) })
            : block.binds.push({ t: 'attr', p, name: attr.name, e: this.expr( attr.source, attr.loc ) })
          break
        case 'interp':
          block.binds.push({ t: 'attr', p, name: attr.name, e: this.concat( attr.parts ) })
          break
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
    node.children.length && emitSiblings( node.children, p )
    html.push( `</${node.tag}>` )
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

        for( const attr of node.attrs )
          if( attr.k === 'literal' || attr.k === 'expr' || attr.k === 'interp' || attr.k === 'bool' ){
            vars[ attr.name ] = this.compInput( attr )
            /**
             * RFC decision #1: let/const names are block-scoped
             * (visible to every bind of the enclosing block)
             */
            !block.scope.includes( attr.name ) && block.scope.push( attr.name )
            !scope.includes( attr.name ) && scope.push( attr.name )
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

  /** Components and dynamic tags share input/event/spread shape */
  private compLike( node: ElementNode, p: Path, scope: string[], kind: 'comp' | 'dynamic' ): ChildIR {
    const
    inputs: Record<string, CompInput> = {},
    spreads: E[] = [],
    events: { name: string, e: E }[] = []
    let args: string[] = []

    for( const attr of node.attrs ){
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
export function compileTemplate( src: string ): CompileResult {
  const parsed = parseTemplate( src )
  const compiler = new Compiler( src )
  const ir = compiler.compile( parsed.root.children )

  return { ir, diagnostics: [ ...parsed.diagnostics, ...compiler.diagnostics ] }
}
