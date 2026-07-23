/**
 * Phase 2 — Template parser (RFC-001 §3–4)
 *
 * A dedicated recursive-descent parser for Lips templates:
 *  - owns the syntax (no innerHTML, no regex preprocessing) — immune to
 *    table-context hoisting, host-parser attribute lenience, whitespace
 *    corruption
 *  - positioned machine-readable diagnostics with error recovery
 *    (`parse` never throws; broken templates yield partial ASTs)
 *  - accepts the `.lips` SFC layout (frontscript + template) per
 *    RFC-001 decision #5
 *
 * Attribute value semantics (predictable, no heuristics):
 *  - `name="text"`        → literal string
 *  - `name="a {expr} b"`  → interpolated parts
 *  - `name=expr`          → expression (whitespace-free, depth-aware)
 *  - `name={ expr }`      → expression (braced — spaces allowed)
 *  - `name` / `!name`     → boolean true / false
 *  - `on-click( … )`      → event instruction
 *  - `await( … )` etc.    → callable (fn) attribute
 *  - `[a, b]`             → iterator argument names
 *  - `...expr`            → spread
 */

// ------------------------------------------------------------------- shared
export interface Loc {
  offset: number
  length: number
}
export interface TemplateDiagnostic {
  code: string
  severity: 'error' | 'warning'
  message: string
  hint?: string
  loc: { line: number, col: number, offset: number, length: number }
}

export type ExprSlot = { expr: string, loc: Loc }

// ---------------------------------------------------------------------- AST
export type TemplateNode =
  | ElementNode
  | FragmentNode
  | { t: 'text', value: string, loc: Loc }
  | { t: 'interp', parts: ( string | ExprSlot )[], loc: Loc }
  | { t: 'comment', value: string, loc: Loc }

export interface FragmentNode {
  t: 'fragment'
  children: TemplateNode[]
  loc: Loc
}
export interface ElementNode {
  t: 'element'
  tag: string                   // '#dynamic' for <{expr}>
  dynamicTag?: ExprSlot
  head?: ExprSlot               // <if( … )>, <switch( … )>, <log( … )>
  attrs: AttrNode[]
  children: TemplateNode[]
  selfClosed: boolean
  loc: Loc
}

export type AttrNode =
  | { k: 'literal', name: string, value: string, loc: Loc }
  | { k: 'interp',  name: string, parts: ( string | ExprSlot )[], loc: Loc }
  | { k: 'expr',    name: string, source: string, loc: Loc }
  | { k: 'bool',    name: string, value: boolean, loc: Loc }
  | { k: 'event',   name: string, source: string, loc: Loc }
  | { k: 'fn',      name: string, source: string, loc: Loc }
  | { k: 'args',    names: string[], loc: Loc }
  | { k: 'spread',  source: string, loc: Loc }

export interface ParseResult {
  root: FragmentNode
  diagnostics: TemplateDiagnostic[]
}
export interface SFCResult extends ParseResult {
  script: string
}

// ------------------------------------------------------------------- tables
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
])
const RAW_WHITESPACE_TAGS = new Set([ 'pre', 'textarea' ])
const HEAD_SUGAR_TAGS = new Set([ 'if', 'else-if', 'switch', 'log' ])

const NAMED_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' '
}
function decodeEntities( text: string ){
  return text.replace( /&(?:amp|lt|gt|quot|#39|nbsp);/g, m => NAMED_ENTITIES[ m ] )
}

// ------------------------------------------------------------------- parser
class TemplateParser {
  private pos = 0
  private lineStarts: number[] | null = null

  readonly diagnostics: TemplateDiagnostic[] = []

  constructor( private src: string ){}

  // ---- diagnostics helpers
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

  // ---- scanning helpers
  private eof(){ return this.pos >= this.src.length }
  private peek( offset = 0 ){ return this.src[ this.pos + offset ] }
  private startsWith( str: string ){ return this.src.startsWith( str, this.pos ) }
  private skipSpace(){ while( !this.eof() && /\s/.test( this.src[ this.pos ] ) ) this.pos++ }

  /**
   * Scan a balanced region: from an opening delimiter already
   * consumed, up to (not including) its matching closer at depth 0.
   * String literals are opaque; (), [], {} all nest.
   */
  private scanBalanced( closer: string, code: string ): { content: string, loc: Loc } | null {
    const start = this.pos
    let depth = 0

    while( !this.eof() ){
      const c = this.src[ this.pos ]

      if( c === "'" || c === '"' || c === '`' ){
        this.pos++
        while( !this.eof() && this.src[ this.pos ] !== c ){
          if( this.src[ this.pos ] === '\\' ) this.pos++
          this.pos++
        }
        this.pos++
        continue
      }

      if( depth === 0 && c === closer ){
        const content = this.src.slice( start, this.pos )
        this.pos++ // consume closer
        return { content, loc: { offset: start, length: content.length } }
      }

      if( c === '(' || c === '[' || c === '{' ) depth++
      else if( c === ')' || c === ']' || c === '}' ){
        if( depth === 0 && c !== closer ){
          this.report( code, 'error', `Unbalanced '${c}'`, this.pos )
          this.pos++
          continue
        }
        depth--
      }

      this.pos++
    }

    this.report( code, 'error', `Unterminated — expected '${closer}'`, start, this.pos - start )
    return null
  }

  // ---- entry
  parse(): ParseResult {
    const children: TemplateNode[] = []

    while( !this.eof() ){
      children.push( ...this.parseNodes( [] ) )

      // Root-level stray closing tag: report, consume, resume
      if( this.startsWith('</') ){
        const closeStart = this.pos
        this.pos += 2
        while( !this.eof() && this.peek() !== '>' ) this.pos++
        !this.eof() && this.pos++
        this.report( 'LIPS-P005', 'error',
          `Stray closing tag ${this.src.slice( closeStart, this.pos )}`, closeStart, this.pos - closeStart )
      }
    }

    return {
      root: { t: 'fragment', children, loc: { offset: 0, length: this.src.length } },
      diagnostics: this.diagnostics
    }
  }

  /**
   * Parse siblings until EOF or a closing tag belonging to
   * an ancestor. `stack` holds open ancestor tag names for
   * mismatch recovery.
   */
  private parseNodes( stack: string[] ): TemplateNode[] {
    const nodes: TemplateNode[] = []

    while( !this.eof() ){
      if( this.startsWith('</') ) break

      const before = this.pos

      if( this.peek() === '<' && this.peek( 1 ) !== undefined ){
        const node = this.parseTag( stack )
        node && nodes.push( node )
      }
      else {
        const text = this.parseText( stack )
        text && nodes.push( text )
      }

      /**
       * Progress guard: recovery paths must never stall the
       * loop (e.g. a lone '<' at EOF yields no node and no
       * consumption) — force one character forward.
       */
      if( this.pos === before ) this.pos++
    }

    return nodes
  }

  // ---- text & interpolation
  private parseText( stack: string[] ): TemplateNode | null {
    const start = this.pos
    const parts: ( string | ExprSlot )[] = []
    let buffer = ''

    while( !this.eof() && this.peek() !== '<' ){
      if( this.peek() === '{' ){
        this.pos++ // consume '{'
        const region = this.scanBalanced( '}', 'LIPS-P007' )
        if( region ){
          buffer && parts.push( buffer )
          buffer = ''
          parts.push({ expr: region.content.trim(), loc: region.loc })
        }
        continue
      }

      buffer += this.peek()
      this.pos++
    }
    buffer && parts.push( buffer )

    const loc: Loc = { offset: start, length: this.pos - start }

    // Interpolated text
    if( parts.some( p => typeof p !== 'string' ) )
      return {
        t: 'interp',
        parts: parts.map( p => typeof p === 'string' ? decodeEntities( p ) : p ),
        loc
      }

    const raw = parts.length ? parts[0] as string : ''
    /**
     * Drop whitespace-only text except inside <pre>/<textarea>
     */
    const inRaw = stack.some( tag => RAW_WHITESPACE_TAGS.has( tag ) )
    if( !raw || ( !inRaw && !raw.trim() ) ) return null

    return { t: 'text', value: decodeEntities( raw ), loc }
  }

  // ---- tags
  private parseTag( stack: string[] ): TemplateNode | null {
    const start = this.pos

    // Comment
    if( this.startsWith('<!--') ){
      const end = this.src.indexOf( '-->', this.pos + 4 )
      if( end === -1 ){
        this.report( 'LIPS-P003', 'error', 'Unterminated comment', start, this.src.length - start )
        this.pos = this.src.length
        return null
      }
      const value = this.src.slice( this.pos + 4, end )
      this.pos = end + 3
      return { t: 'comment', value, loc: { offset: start, length: this.pos - start } }
    }

    // Fragment open <>
    if( this.startsWith('<>') ){
      this.pos += 2
      const children: TemplateNode[] = []

      while( true ){
        children.push( ...this.parseNodes( [ ...stack, '#fragment' ] ) )
        if( this.closeStatus( '#fragment', start, stack ) !== 'stray' ) break
      }

      return { t: 'fragment', children, loc: { offset: start, length: this.pos - start } }
    }

    // Dynamic tag <{expr} …>
    if( this.startsWith('<{') ){
      this.pos += 2
      const region = this.scanBalanced( '}', 'LIPS-P008' )
      if( !region ) return null

      const el: ElementNode = {
        t: 'element',
        tag: '#dynamic',
        dynamicTag: { expr: region.content.trim(), loc: region.loc },
        attrs: [],
        children: [],
        selfClosed: false,
        loc: { offset: start, length: 0 }
      }
      this.finishTag( el, stack, start )
      return el
    }

    // Named tag
    this.pos++ // consume '<'
    const nameStart = this.pos
    while( !this.eof() && /[A-Za-z0-9_-]/.test( this.peek() ) ) this.pos++
    const tag = this.src.slice( nameStart, this.pos )

    if( !tag || !/^[A-Za-z]/.test( tag ) ){
      this.report( 'LIPS-P002', 'error', 'Invalid tag name', start, this.pos - start + 1 )
      // Recovery: emit the '<' as literal text
      return { t: 'text', value: '<', loc: { offset: start, length: 1 } }
    }

    const el: ElementNode = {
      t: 'element',
      tag: tag.toLowerCase(),
      attrs: [],
      children: [],
      selfClosed: false,
      loc: { offset: start, length: 0 }
    }

    // Sugar head: <if( … )>, <else-if( … )>, <switch( … )>, <log( … )>
    if( this.peek() === '(' ){
      if( HEAD_SUGAR_TAGS.has( el.tag ) ){
        this.pos++ // consume '('
        const region = this.scanBalanced( ')', 'LIPS-P012' )
        region && ( el.head = { expr: region.content.trim(), loc: region.loc } )
      }
      else this.report( 'LIPS-P011', 'error', `Head expression is not allowed on <${el.tag}>`, this.pos,
                        1, `Only ${[ ...HEAD_SUGAR_TAGS ].map( t => `<${t}(…)>` ).join(', ')} take a head` )
    }

    this.finishTag( el, stack, start )
    return el
  }

  /** attrs → '>' | '/>' → children → closing tag */
  private finishTag( el: ElementNode, stack: string[], start: number ){
    this.parseAttrs( el )

    // Self closing / void
    if( el.selfClosed || VOID_ELEMENTS.has( el.tag ) ){
      el.selfClosed = true
      el.loc = { offset: start, length: this.pos - start }
      return
    }

    const stackName = el.tag === '#dynamic' ? '#dynamic' : el.tag
    el.children = []

    /**
     * Loop so a stray closing tag inside the element is
     * consumed (with a diagnostic) and children parsing
     * resumes — the element doesn't silently end early.
     */
    while( true ){
      el.children.push( ...this.parseNodes( [ ...stack, stackName ] ) )
      if( this.closeStatus( stackName, start, stack ) !== 'stray' ) break
    }

    el.loc = { offset: start, length: this.pos - start }
  }

  /**
   * Consume the closing tag for `tag`. Recovery rules:
   *  - `</>` closes fragments and dynamic tags (and anything, with a warning)
   *  - mismatch that matches an ancestor → auto-close (warning), leave input
   *    for the ancestor to consume
   *  - stray close → report, consume, caller resumes children
   *  - EOF → unclosed element (error)
   */
  private closeStatus( tag: string, openOffset: number, stack: string[] ): 'closed' | 'ancestor' | 'stray' | 'eof' {
    if( this.eof() ){
      this.report( 'LIPS-P006', 'error', `Unclosed <${tag === '#fragment' ? '' : tag}> — reached end of template`, openOffset,
                   1, `Add </${tag === '#fragment' || tag === '#dynamic' ? '' : tag}>` )
      return 'eof'
    }

    if( !this.startsWith('</') ) return 'closed' // parseNodes stopped for another reason

    const closeStart = this.pos
    this.pos += 2

    // Generic close </>
    if( this.peek() === '>' ){
      this.pos++
      if( tag !== '#fragment' && tag !== '#dynamic' )
        this.report( 'LIPS-P004', 'warning', `Generic '</>' closes <${tag}>`, closeStart, 3, `Prefer </${tag}>` )
      return 'closed'
    }

    const nameStart = this.pos
    while( !this.eof() && /[A-Za-z0-9_-]/.test( this.peek() ) ) this.pos++
    const closeTag = this.src.slice( nameStart, this.pos ).toLowerCase()
    this.skipSpace()
    this.peek() === '>' ? this.pos++ : this.report( 'LIPS-P001', 'error', `Malformed closing tag`, closeStart, this.pos - closeStart )

    if( closeTag === tag ) return 'closed'

    // Mismatch: ancestor match → rewind so the ancestor consumes it
    if( stack.includes( closeTag ) ){
      this.report( 'LIPS-P004', 'warning', `</${closeTag}> auto-closes <${tag}>`, closeStart, this.pos - closeStart,
                   `Add the missing </${tag}> before </${closeTag}>` )
      this.pos = closeStart
      return 'ancestor'
    }

    this.report( 'LIPS-P005', 'error', `Stray closing tag </${closeTag}> — <${tag}> is open`, closeStart, this.pos - closeStart )
    return 'stray'
  }

  // ---- attributes
  private parseAttrs( el: ElementNode ){
    while( true ){
      this.skipSpace()
      if( this.eof() ){
        this.report( 'LIPS-P001', 'error', 'Unexpected end of template inside tag', el.loc.offset )
        return
      }

      if( this.startsWith('/>') ){ this.pos += 2; el.selfClosed = true; return }
      if( this.peek() === '>' ){ this.pos++; return }

      const attrStart = this.pos

      // Spread: ...expr
      if( this.startsWith('...') ){
        this.pos += 3
        const source = this.readUnquotedValue()
        el.attrs.push({ k: 'spread', source, loc: { offset: attrStart, length: this.pos - attrStart } })
        continue
      }

      // Iterator args: [a, b]
      if( this.peek() === '[' ){
        this.pos++
        const region = this.scanBalanced( ']', 'LIPS-P009' )
        if( region ){
          const names = region.content.split(',').map( s => s.trim() ).filter( Boolean )
          el.attrs.push({ k: 'args', names, loc: { offset: attrStart, length: this.pos - attrStart } })
        }
        continue
      }

      // Boolean negation: !name
      let negated = false
      if( this.peek() === '!' ){ negated = true; this.pos++ }

      // Attribute name
      const nameStart = this.pos
      while( !this.eof() && /[^\s=/>()]/.test( this.peek() ) ) this.pos++
      const name = this.src.slice( nameStart, this.pos )

      if( !name ){
        this.report( 'LIPS-P009', 'error', `Invalid attribute syntax at '${this.peek()}'`, this.pos )
        this.pos++
        continue
      }

      // Callable form: on-click( … ), await( … )
      if( this.peek() === '(' ){
        this.pos++
        const region = this.scanBalanced( ')', 'LIPS-P010' )
        const source = region ? region.content.trim() : ''
        const loc: Loc = { offset: attrStart, length: this.pos - attrStart }

        name.startsWith('on-')
          ? el.attrs.push({ k: 'event', name: name.slice( 3 ), source, loc })
          : el.attrs.push({ k: 'fn', name, source, loc })
        continue
      }

      // Valued: name=…
      if( this.peek() === '=' ){
        this.pos++
        this.parseAttrValue( el, name, attrStart )
        continue
      }

      // Bare boolean
      el.attrs.push({ k: 'bool', name, value: !negated, loc: { offset: attrStart, length: this.pos - attrStart } })
    }
  }

  private parseAttrValue( el: ElementNode, name: string, attrStart: number ){
    const q = this.peek()

    // Quoted: literal or interpolated
    if( q === '"' || q === "'" ){
      this.pos++
      const valueStart = this.pos
      const parts: ( string | ExprSlot )[] = []
      let buffer = ''

      while( !this.eof() && this.peek() !== q ){
        if( this.peek() === '{' ){
          this.pos++
          const region = this.scanBalanced( '}', 'LIPS-P007' )
          if( region ){
            buffer && parts.push( buffer )
            buffer = ''
            parts.push({ expr: region.content.trim(), loc: region.loc })
          }
          continue
        }
        buffer += this.peek()
        this.pos++
      }
      buffer && parts.push( buffer )

      this.eof()
        ? this.report( 'LIPS-P010', 'error', `Unterminated value for '${name}'`, valueStart, this.pos - valueStart )
        : this.pos++ // consume quote

      const loc: Loc = { offset: attrStart, length: this.pos - attrStart }

      parts.some( p => typeof p !== 'string' )
        ? el.attrs.push({ k: 'interp', name, parts: parts.map( p => typeof p === 'string' ? decodeEntities( p ) : p ), loc })
        : el.attrs.push({ k: 'literal', name, value: decodeEntities( ( parts[0] as string ) ?? '' ), loc })
      return
    }

    // Braced expression: name={ expr } — spaces allowed
    if( q === '{' ){
      this.pos++
      const region = this.scanBalanced( '}', 'LIPS-P007' )
      el.attrs.push({
        k: 'expr', name,
        source: region ? region.content.trim() : '',
        loc: { offset: attrStart, length: this.pos - attrStart }
      })
      return
    }

    // Unquoted expression — whitespace-free, depth-aware
    const source = this.readUnquotedValue()
    source
      ? el.attrs.push({ k: 'expr', name, source, loc: { offset: attrStart, length: this.pos - attrStart } })
      : this.report( 'LIPS-P010', 'error', `Missing value for attribute '${name}'`, attrStart )
  }

  /** Read an unquoted value: until whitespace/'>'/'/>' at depth 0 */
  private readUnquotedValue(): string {
    const start = this.pos
    let depth = 0

    while( !this.eof() ){
      const c = this.peek()

      if( c === "'" || c === '"' || c === '`' ){
        this.pos++
        while( !this.eof() && this.peek() !== c ){
          if( this.peek() === '\\' ) this.pos++
          this.pos++
        }
        this.pos++
        continue
      }

      if( depth === 0 ){
        if( /\s/.test( c ) || c === '>' ) break
        if( c === '/' && this.peek( 1 ) === '>' ) break
      }

      if( c === '(' || c === '[' || c === '{' ) depth++
      else if( c === ')' || c === ']' || c === '}' ) depth--

      this.pos++
    }

    return this.src.slice( start, this.pos ).trim()
  }
}

// -------------------------------------------------------------------- API
export function parseTemplate( src: string ): ParseResult {
  return new TemplateParser( src || '' ).parse()
}

/**
 * `.lips` single-file component: frontscript (JS/TS) followed by the
 * template. The template starts at the first line-leading `<` that sits
 * at top-level script depth (outside strings, comments, and brackets).
 */
export function parseSFC( src: string ): SFCResult {
  const splitAt = findTemplateStart( src || '' )
  const script = ( src || '' ).slice( 0, splitAt ).trimEnd()
  const templateSrc = ( src || '' ).slice( splitAt )

  const result = new TemplateParser( templateSrc ).parse()
  /**
   * Re-anchor diagnostic lines to the full SFC source
   */
  const lineOffset = script ? script.split('\n').length + ( /\n\s*\n$/.test( src.slice( 0, splitAt ) ) ? 1 : 0 ) : 0
  result.diagnostics.forEach( d => {
    d.loc.line += script ? src.slice( 0, splitAt ).split('\n').length - 1 : 0
    d.loc.offset += splitAt
  })

  return { script, ...result }
}

function findTemplateStart( src: string ): number {
  let
  depth = 0,
  lineStart = true

  for( let i = 0; i < src.length; i++ ){
    const c = src[ i ]

    // Strings are opaque
    if( c === "'" || c === '"' || c === '`' ){
      const quote = c
      i++
      while( i < src.length && src[ i ] !== quote ){
        if( src[ i ] === '\\' ) i++
        i++
      }
      lineStart = false
      continue
    }
    // Comments are opaque
    if( c === '/' && src[ i + 1 ] === '/' ){
      while( i < src.length && src[ i ] !== '\n' ) i++
      lineStart = true
      continue
    }
    if( c === '/' && src[ i + 1 ] === '*' ){
      const end = src.indexOf( '*/', i + 2 )
      i = end === -1 ? src.length : end + 1
      continue
    }

    if( c === '\n' ){ lineStart = true; continue }

    if( lineStart && depth === 0 && c === '<' && /[A-Za-z{>!]/.test( src[ i + 1 ] || '' ) )
      return i

    if( c === '(' || c === '[' || c === '{' ) depth++
    else if( c === ')' || c === ']' || c === '}' ) depth = Math.max( 0, depth - 1 )

    if( !/\s/.test( c ) ) lineStart = false
  }

  return 0 // no script section — whole source is template
}
