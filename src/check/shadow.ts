/**
 * A template as TypeScript: the shadow `lips-check` has `tsc` type-check.
 *
 * The shadow is the body of a method in the component's own `handler`,
 * so `this` is typed exactly as a handler's is: `state`, `input`,
 * `static`, `context` and `self` come from it, and the handlers with it.
 * Each construct is written as the runtime reads it:
 *
 *   {state.x}                  ( state.x );
 *   <let a={ e }/>             const a = ( e );        hoisted, as the block sees it
 *   <for [e, i] in=xs>         for( const [ e, i ] of __lips_each( xs ) ){ … }
 *   <if( c )> … <else>         if( c ){ … } else { … }
 *   <switch( on )><case is=v>  __lips_is( on, v )
 *   <async await( p )><then [v]>   const v = await ( p )
 *   on-click( step, 1 )        __lips_on( this.step, 1 )   the event appended, as the runtime does
 *   <macro-call a={ e }/>      the macro's body, its argv bound to the call's values
 *
 * Every expression is copied verbatim, but for a same-length rename of
 * the two roots that are reserved words in TypeScript (`static`,
 * `arguments`), so a diagnostic inside one maps back to its exact place in
 * the template (`spans`). Pure: no TypeScript here, `./program` runs it.
 */
import { parseTemplate } from '../ir/parser'
import type { TemplateNode, ElementNode, AttrNode, ExprSlot } from '../ir/parser'
import { parseExpression, splitTopLevel, freeRoots } from '../ir/expression'
import type { Expr } from '../ir/expression'
import { CONTROL_TAGS, ARM_TAGS, HTML_TAGS } from '../ir/tags'

/** The two texts a component's template is written in */
export type Source = 'template' | 'macros'

/** Where a stretch of the shadow came from */
export interface Span {
  /** Offset and length in the shadow */
  at: number
  length: number
  source: Source
  /** Offset and length in that source */
  from: number
  size: number
  /** The source's own text, offset for offset; else scaffolding written for the node at `from` */
  exact: boolean
}

export interface Shadow {
  /** Statements: the body of an `async` method whose `this` is the component's */
  body: string
  spans: Span[]
  /**
   * Event instructions that name a handler (`on-click( step )`). Where a
   * component's handlers are typed by hand, every name reads as `any` to
   * TypeScript, so `./program` holds these to the names written instead.
   */
  handlers: { name: string, source: Source, from: number }[]
}

/**
 * What the shadow calls, declared once per file. Named for the runtime
 * behaviour each stands for; `NoInfer` keeps an argument from widening
 * what it is checked against (TypeScript 5.4 and later).
 */
export const SHADOW_DECLARATIONS = `
/** What \`<for>\` binds per item: [ value, index ], or [ key, value, index ] over a Map or an object */
type __LipsEach<T> = T extends readonly ( infer U )[] ? [ U, number ]
  : T extends ReadonlyMap<infer K, infer V> ? [ K, V, number ]
  : T extends ReadonlySet<infer U> ? [ U, number ]
  : T extends null | undefined ? never
  : T extends object ? [ Extract<keyof T, string>, T[ keyof T ], number ]
  : never
declare function __lips_each<T>( value: T ): __LipsEach<T>[]
/** A range: \`<for from=… to=…>\` binds the number */
declare function __lips_range( from?: unknown, to?: unknown ): [ number ][]
/** \`<case is=…>\`: the value, or an array that holds it */
declare function __lips_is<T>( on: T, is: NoInfer<T> | readonly NoInfer<T>[] ): boolean
/** A handler, called with what the instruction gives first; the event or emitted values follow */
declare function __lips_on<A extends any[]>( fn: ( ...args: A ) => any, ...args: NoInfer<Partial<A>> ): void
/** A function an instruction's expression gives */
declare function __lips_fn( fn: ( ...args: any[] ) => any, ...args: unknown[] ): void
/** Interpolated text */
declare function __lips_text( ...parts: unknown[] ): string
`

/**
 * Where the component's own handlers are, by name: `handler.pick` keeps
 * `pick`'s parameters where `this.pick` would be typed by hand as `any`
 */
export interface Own {
  ref: string
  names: string[]
}

interface MacroDef {
  name: string
  argv: string[]
  children: TemplateNode[]
}

/** Words no variable can be named */
const RESERVED_WORDS = new Set( ( 'break case catch class const continue debugger default delete do else enum export extends false finally '
  + 'for function if import in instanceof new null return super switch this throw true try typeof var void while with '
  + 'implements interface let package private protected public static yield await arguments eval' ).split(' ') )

/** The roots TypeScript reserves, renamed to names of the same length */
const RENAMES: Record<string, string> = { __proto__: null, static: '$tatic', arguments: '$rguments' } as any

/** Every identifier node of an expression, with where it starts */
function ids( ast: Expr, out: { name: string, at: number }[] = [] ){
  const walk = ( n: Expr ) => {
    switch( n.t ){
      case 'id': n.at !== undefined && out.push({ name: n.name, at: n.at }); return
      case 'member': walk( n.obj ); typeof n.prop !== 'string' && walk( n.prop ); return
      case 'call': walk( n.callee ); n.args.forEach( walk ); return
      case 'unary': case 'update': walk( n.arg ); return
      case 'bin': case 'logic': walk( n.l ); walk( n.r ); return
      case 'cond': walk( n.test ); walk( n.cons ); walk( n.alt ); return
      case 'assign': walk( n.target ); walk( n.value ); return
      case 'arrow': walk( n.body ); return
      case 'arr': n.items.forEach( i => walk( i.value ) ); return
      // A shorthand `{ static }` is left as written: renamed, its key would change too
      case 'obj': n.props.forEach( p => p.key !== undefined && p.value.t === 'id' && p.value.at === p.at ? 0 : walk( p.value ) ); return
    }
  }
  walk( ast )
  return out
}

/** `<macro [argv] name="X">…</macro>` definitions, as the compiler reads them */
function macrosOf( src: string ){
  const macros = new Map<string, MacroDef>()
  if( !src.trim() ) return macros

  for( const node of parseTemplate( src ).root.children ){
    if( node.t !== 'element' || node.tag !== 'macro' ) continue
    let name = ''
    const argv: string[] = []
    for( const attr of node.attrs ){
      if( attr.k === 'args' ) argv.push( ...attr.names )
      else if( attr.k === 'literal' && attr.name === 'name' ) name = attr.value
    }
    name && macros.set( name.toLowerCase(), { name, argv, children: node.children })
  }
  return macros
}

class Writer {
  body = ''
  spans: Span[] = []
  handlers: Shadow['handlers'] = []
  /** Names in scope here: `<let>`, `<for>`, arms, macro and slot arguments */
  private scope: string[] = []
  private stack: string[] = []
  private n = 0

  constructor(
    private texts: Record<Source, string>,
    private macros: Map<string, MacroDef>,
    private own?: Own
  ){}

  write( text: string ){ this.body += text }
  private fresh( stem: string ){ return `__${stem}${ ++this.n }` }

  /** Scaffolding that stands for the node at `from`: what goes wrong in it is reported there */
  private node( source: Source, from: number, size: number, fn: () => void ){
    const at = this.body.length
    fn()
    this.spans.push({ at, length: this.body.length - at, source, from, size, exact: false })
  }

  /** Where `text` sits in a source, at or after `from` (a slot's loc includes its padding) */
  private find( source: Source, text: string, from: number, end?: number ){
    const src = this.texts[ source ]
    // Within an attribute, its value comes last: search back from its end
    if( end !== undefined ){
      const at = src.lastIndexOf( text, end - text.length )
      if( at >= from ) return at
    }
    const at = src.indexOf( text, from )
    return at === -1 ? from : at
  }

  /**
   * An expression, verbatim but for the renamed roots, in parentheses.
   * One that does not parse is left to the compiler, which reports it:
   * `undefined` stands in.
   */
  expr( text: string, source: Source, from: number ){
    const { ast, diagnostics } = parseExpression( text )
    if( diagnostics.length || !text.trim() ){
      this.write('undefined')
      return
    }
    let out = text
    for( const id of ids( ast ) ){
      const to = RENAMES[ id.name ]
      if( to && !this.scope.includes( id.name ) )
        out = out.slice( 0, id.at ) + to + out.slice( id.at + to.length )
    }
    this.write('( ')
    this.spans.push({ at: this.body.length, length: out.length, source, from, size: text.length, exact: true })
    this.write( out + ' )' )
  }

  /** An expression as a statement */
  private stmt( text: string, source: Source, from: number ){
    this.write(';')
    this.expr( text, source, from )
    this.write('\n')
  }
  private slot( slot: ExprSlot, source: Source ){
    this.stmt( slot.expr, source, this.find( source, slot.expr, slot.loc.offset ) )
  }
  /** An attribute's expression: `name={ e }`, `name=e`, `on-x( e )`, `...e` */
  private attrExpr( attr: AttrNode & { source: string }, source: Source ){
    return this.find( source, attr.source, attr.loc.offset, attr.loc.offset + attr.loc.length )
  }
  /** A name a construct binds, mapped to where it is written */
  private name( name: string, source: Source, from: number ){
    this.spans.push({ at: this.body.length, length: name.length, source, from, size: name.length, exact: true })
    this.write( name )
  }

  /** `{ … }` with names of its own */
  private scoped( names: string[], fn: () => void ){
    const saved = this.scope
    this.scope = [ ...saved, ...names ]
    this.write('{\n')
    fn()
    this.write('}\n')
    this.scope = saved
  }

  // ---- blocks
  /**
   * A block: its `<let>`/`<const>` first, since each is visible to the
   * whole block, before or after where it is written. In the order they
   * read one another, so a name is declared before what reads it.
   */
  block( nodes: TemplateNode[], source: Source, names: string[] = [], head?: () => void ){
    this.scoped( names, () => {
      head?.()
      const lets = this.letsOf( nodes )
      this.scope.push( ...lets.map( l => l.attr.name ) )
      for( const l of lets ) this.let( l.attr, source )
      this.siblings( nodes, source )
    })
  }

  /** A block's `<let>`/`<const>` names: in plain elements too, not in nested blocks */
  private letsOf( nodes: TemplateNode[] ){
    const found: { attr: AttrNode & { name: string }, reads: string[] }[] = []
    const walk = ( list: TemplateNode[] ) => {
      for( const node of list ){
        if( node.t === 'fragment' ) walk( node.children )
        if( node.t !== 'element' ) continue
        if( node.tag === 'let' || node.tag === 'const' ){
          for( const attr of node.attrs )
            if( attr.k === 'literal' || attr.k === 'expr' || attr.k === 'interp' || attr.k === 'bool' ){
              const reads = attr.k === 'expr' ? freeRoots( parseExpression( attr.source ).ast )
                : attr.k === 'interp' ? attr.parts.flatMap( p => typeof p === 'string' ? [] : freeRoots( parseExpression( p.expr ).ast ) )
                : []
              found.push({ attr, reads })
            }
        }
        else if( HTML_TAGS.has( node.tag ) && !this.macros.has( node.tag ) ) walk( node.children )
      }
    }
    walk( nodes )

    // Declared before what reads them; a cycle keeps the order written
    const names = new Map( found.map( l => [ l.attr.name, l ] ) ), done = new Set<string>(), out: typeof found = []
    const visit = ( l: typeof found[ number ], path: Set<string> ) => {
      if( done.has( l.attr.name ) || path.has( l.attr.name ) ) return
      path.add( l.attr.name )
      for( const r of l.reads ){ const dep = names.get( r ); dep && dep !== l && visit( dep, path ) }
      done.add( l.attr.name )
      out.push( l )
    }
    for( const l of found ) visit( l, new Set() )
    return out
  }

  private let( attr: AttrNode & { name: string }, source: Source ){
    this.write('const ')
    this.name( attr.name, source, this.find( source, attr.name, attr.loc.offset ) )
    this.write(' = ')
    this.value( attr, source )
    this.write('\n')
  }

  /** An attribute as the value it gives: a literal, `true`, an expression or interpolated text */
  private value( attr: AttrNode, source: Source ){
    switch( attr.k ){
      case 'literal': this.write( JSON.stringify( attr.value ) ); break
      case 'bool': this.write( String( attr.value ) ); break
      case 'expr': this.expr( attr.source, source, this.attrExpr( attr, source ) ); break
      case 'interp':
        this.write('__lips_text( ')
        attr.parts.forEach( ( p, i ) => {
          i && this.write(', ')
          typeof p === 'string' ? this.write( JSON.stringify( p ) ) : this.expr( p.expr, source, this.find( source, p.expr, p.loc.offset ) )
        })
        this.write(' )')
        break
      default: this.write('undefined')
    }
  }

  private siblings( nodes: TemplateNode[], source: Source ){
    for( let i = 0; i < nodes.length; i++ ){
      const node = nodes[ i ]
      if( node.t === 'interp' ){
        for( const p of node.parts ) typeof p !== 'string' && this.slot( p, source )
        continue
      }
      if( node.t === 'fragment' ){ this.siblings( node.children, source ); continue }
      if( node.t !== 'element' ) continue

      // Hoisted with the block
      if( node.tag === 'let' || node.tag === 'const' ) continue
      if( CONTROL_TAGS.has( node.tag ) ){ i = this.control( nodes, i, source ); continue }
      // Out of place: the compiler says so
      if( ARM_TAGS.has( node.tag ) ) continue

      if( node.tag === '#dynamic' ){
        node.dynamicTag && this.slot( node.dynamicTag, source )
        this.component( node, source )
      }
      else if( this.macros.has( node.tag ) ) this.macroCall( node, source )
      else if( !HTML_TAGS.has( node.tag ) ) this.component( node, source )
      else this.element( node, source )
    }
  }

  // ---- elements
  private element( node: ElementNode, source: Source ){
    for( const attr of node.attrs ){
      // `on-click="…"` is a dead attribute the compiler refuses
      if( 'name' in attr && attr.name.startsWith('on-') && attr.k !== 'event' ) continue

      if( 'name' in attr && attr.name === '@format' ){ this.format( attr, source ); continue }
      switch( attr.k ){
        case 'expr': case 'spread': this.stmt( attr.source, source, this.attrExpr( attr, source ) ); break
        case 'interp': for( const p of attr.parts ) typeof p !== 'string' && this.slot( p, source ); break
        case 'event': this.event( attr, source ); break
      }
    }
    this.siblings( node.children, source )
  }

  /** `@format="reference, { params }"`: the params are an expression */
  private format( attr: AttrNode, source: Source ){
    const src = this.texts[ source ], whole = src.slice( attr.loc.offset, attr.loc.offset + attr.loc.length )
    const eq = whole.indexOf('=')
    if( eq === -1 ) return
    let start = attr.loc.offset + eq + 1, raw = whole.slice( eq + 1 )
    if( raw[ 0 ] === '"' || raw[ 0 ] === "'" || raw[ 0 ] === '{' ){ start++; raw = raw.slice( 1, -1 ) }
    const comma = raw.indexOf(',')
    if( comma === -1 ) return
    const params = raw.slice( comma + 1 ).trim()
    params && this.stmt( params, source, this.find( source, params, start + comma + 1 ) )
  }

  /**
   * `on-x( name, …args )` calls the handler `name`, unless a scope name
   * holds it; `on-x( expr, …args )` calls the function the expression
   * gives. Either way the event (or a component's emitted values) comes
   * after the arguments, so they are checked as the first of its
   * parameters.
   */
  private event( attr: AttrNode & { source: string }, source: Source ){
    const segs = splitTopLevel( attr.source )
    if( !segs.length ) return
    let from = this.attrExpr( attr, source )
    const at = segs.map( seg => ( from = this.find( source, seg, from ), from += seg.length, from - seg.length ) )

    const named = /^[A-Za-z_$][\w$]*$/.test( segs[ 0 ] ) && !this.scope.includes( segs[ 0 ] )
    const ref = named && this.own?.names.includes( segs[ 0 ] ) ? this.own.ref : 'this'
    this.write( named ? `;__lips_on( ${ ref }.` : ';__lips_fn( ' )
    if( named ){
      this.handlers.push({ name: segs[ 0 ], source, from: at[ 0 ] })
      this.name( segs[ 0 ], source, at[ 0 ] )
    }
    else this.expr( segs[ 0 ], source, at[ 0 ] )
    segs.slice( 1 ).forEach( ( seg, i ) => {
      this.write(', ')
      this.expr( seg, source, at[ i + 1 ] )
    })
    this.write(' )\n')
  }

  /** A component, or a dynamic tag: inputs, events, spreads, and content with its arguments */
  private component( node: ElementNode, source: Source ){
    const args: { name: string, from: number }[] = []
    for( const attr of node.attrs ){
      if( 'name' in attr && attr.name.startsWith('on-') && attr.k !== 'event' ) continue
      if( 'name' in attr && attr.name === '@format' ){ this.format( attr, source ); continue }
      switch( attr.k ){
        case 'expr': case 'spread': case 'fn': this.stmt( attr.source, source, this.attrExpr( attr, source ) ); break
        case 'interp': for( const p of attr.parts ) typeof p !== 'string' && this.slot( p, source ); break
        case 'event': this.event( attr, source ); break
        case 'args': args.push( ...this.argsAt( attr, source ) ); break
      }
    }
    if( !node.children.length ) return

    // What the component hands its content is not typed: `any`
    this.block( node.children, source, args.map( a => a.name ), () => {
      if( !args.length ) return
      this.write('const [ ')
      args.forEach( ( a, i ) => { i && this.write(', '); this.name( a.name, source, a.from ) })
      this.write(' ]: any[] = []\n')
    })
  }

  /** The names of `[ a, b ]`, each where it is written */
  private argsAt( attr: AttrNode & { k: 'args' }, source: Source ){
    let from = attr.loc.offset
    return attr.names.map( name => {
      from = this.find( source, name, from )
      const at = from
      from += name.length
      return { name, from: at }
    })
  }

  // ---- control flow
  /** Returns the index of the last sibling it took (an `<if>` takes its `<else>`s) */
  private control( nodes: TemplateNode[], i: number, source: Source ): number {
    const node = nodes[ i ] as ElementNode
    const byName = new Map<string, AttrNode>()
    const args: { name: string, from: number }[] = []
    for( const attr of node.attrs )
      attr.k === 'args' ? args.push( ...this.argsAt( attr, source ) ) : 'name' in attr && byName.set( attr.name, attr )

    const head = () => node.head ? this.expr( node.head.expr, source, this.find( source, node.head.expr, node.head.loc.offset ) ) : this.write('undefined')

    switch( node.tag ){
      case 'if': {
        this.write('if( '); head(); this.write(' )')
        this.block( node.children, source )
        let j = i + 1
        for( ; j < nodes.length; j++ ){
          const sib = nodes[ j ]
          if( sib.t !== 'element' ) break
          if( sib.tag === 'else-if' ){
            this.write('else if( ')
            sib.head ? this.expr( sib.head.expr, source, this.find( source, sib.head.expr, sib.head.loc.offset ) ) : this.write('undefined')
            this.write(' )')
            this.block( sib.children, source )
          }
          else if( sib.tag === 'else' ){
            this.write('else ')
            this.block( sib.children, source )
            return j
          }
          else break
        }
        return j - 1
      }

      case 'for': {
        const value = ( name: string ) => {
          const a = byName.get( name )
          if( !a ) return undefined
          if( a.k === 'expr' ) return { text: a.source, from: this.attrExpr( a, source ) }
          if( a.k === 'interp' && a.parts.length === 1 && typeof a.parts[ 0 ] !== 'string' )
            return { text: a.parts[ 0 ].expr, from: this.find( source, a.parts[ 0 ].expr, a.parts[ 0 ].loc.offset ) }
          if( a.k === 'literal' ) return { text: JSON.stringify( a.value ), from: -1 }
        }
        const by = value('by')
        by && by.from >= 0 && this.stmt( by.text, source, by.from )

        this.node( source, node.loc.offset, node.loc.length, () => {
          this.write('for( const [ ')
          args.length
            ? args.forEach( ( a, k ) => { k && this.write(', '); this.name( a.name, source, a.from ) })
            : this.write('__item')
          this.write(' ] of ')
          const of = value('in')
          if( of && of.from >= 0 ){
            this.write('__lips_each( ')
            this.expr( of.text, source, of.from )
            this.write(' )')
          }
          else {
            this.write('__lips_range( ')
            ;[ value('from'), value('to') ].forEach( ( v, k ) => {
              k && this.write(', ')
              v ? v.from >= 0 ? this.expr( v.text, source, v.from ) : this.write( v.text ) : this.write('undefined')
            })
            this.write(' )')
          }
          this.write(' )')
        })
        this.block( node.children, source, args.map( a => a.name ) )
        return i
      }

      case 'switch': {
        const on = this.fresh('on')
        this.write(`{ const ${on} = `); head(); this.write('\n')
        for( const child of node.children ){
          if( child.t !== 'element' ) continue
          if( child.tag === 'default' ){ this.block( child.children, source ); continue }
          if( child.tag !== 'case' ) continue
          const is = child.attrs.find( a => 'name' in a && a.name === 'is' )
          if( !is || ( is.k !== 'literal' && is.k !== 'expr' ) ) continue
          this.node( source, is.loc.offset, is.loc.length, () => {
            this.write(`;__lips_is( ${on}, `)
            is.k === 'literal' ? this.write( JSON.stringify( is.value ) ) : this.expr( is.source, source, this.attrExpr( is, source ) )
            this.write(' )\n')
          })
          this.block( child.children, source )
        }
        this.write('}\n')
        return i
      }

      case 'async': {
        const awaited = node.attrs.find( a => a.k === 'fn' && a.name === 'await' ) as ( AttrNode & { source: string } ) | undefined
        if( !awaited ) return i
        const p = this.fresh('p')
        this.write(`{ const ${p} = `)
        this.expr( awaited.source, source, this.attrExpr( awaited, source ) )
        this.write('\n')
        for( const arm of node.children ){
          if( arm.t !== 'element' ) continue
          const armArgs = arm.attrs.flatMap( a => a.k === 'args' ? this.argsAt( a, source ) : [] )
          const first = armArgs[ 0 ]
          if( arm.tag === 'then' || arm.tag === 'catch' )
            this.block( arm.children, source, first ? [ first.name ] : [], () => {
              if( !first ) return
              this.write('const ')
              this.name( first.name, source, first.from )
              // What rejects is not typed
              this.write( arm.tag === 'then' ? ` = await ${p}\n` : ': any = undefined\n' )
            })
          else if( arm.tag === 'loading' ) this.block( arm.children, source )
        }
        this.write('}\n')
        return i
      }

      case 'log':
        if( node.head ){
          let from = this.find( source, node.head.expr, node.head.loc.offset )
          for( const seg of splitTopLevel( node.head.expr ) ){
            from = this.find( source, seg, from )
            this.stmt( seg, source, from )
            from += seg.length
          }
        }
        return i

      case 'context':
        for( const attr of node.attrs ){
          if( attr.k === 'expr' ) this.stmt( attr.source, source, this.attrExpr( attr, source ) )
          else if( attr.k === 'interp' ) for( const p of attr.parts ) typeof p !== 'string' && this.slot( p, source )
        }
        this.block( node.children, source )
        return i

      case 'i18n': {
        const lang = byName.get('lang')
        lang?.k === 'expr' && this.stmt( lang.source, source, this.attrExpr( lang, source ) )
        lang?.k === 'interp' && lang.parts.forEach( p => typeof p !== 'string' && this.slot( p, source ) )
        this.block( node.children, source )
        return i
      }
    }
    // `<else>` without an `<if>`, and the like: the compiler says so
    return i
  }

  /**
   * A macro call: its body, where each attribute of the call is a name,
   * as `arguments` holds them all. An `argv` name the call does not set
   * is `undefined`, or whatever a spread gives it.
   */
  private macroCall( node: ElementNode, source: Source ){
    const macro = this.macros.get( node.tag )!
    if( this.stack.includes( macro.name ) ) return

    const sets: AttrNode[] = [], spreads: AttrNode[] = []
    for( const attr of node.attrs ){
      if( attr.k === 'spread' ) spreads.push( attr ), sets.push( attr )
      else if( attr.k === 'literal' || attr.k === 'expr' || attr.k === 'interp' || attr.k === 'bool' ){
        // The last set of a name wins
        const prev = sets.findIndex( s => 'name' in s && s.name === attr.name )
        prev >= 0 && sets.splice( prev, 1 )
        sets.push( attr )
      }
    }
    const named = sets.filter( ( s ): s is AttrNode & { name: string } => 'name' in s ).map( s => s.name )
    // A name an expression can read: `aria-label=…` sets `arguments` only
    const names = [ ...new Set([ ...named, ...macro.argv ]) ].filter( n => /^[A-Za-z_$][\w$]*$/.test( n ) && !RESERVED_WORDS.has( n ) )

    // Bound outside the body's block: a value may read a name the body binds again (`row=row`)
    const args = this.fresh('args')
    this.node( source, node.loc.offset, node.loc.length, () => this.scoped( [], () => {
      this.write(`const ${ args } = { `)
      sets.forEach( ( s, k ) => {
        k && this.write(', ')
        if( s.k === 'spread' ){
          this.write('...')
          this.expr( s.source, source, this.attrExpr( s, source ) )
        }
        else {
          this.write( JSON.stringify( ( s as { name: string } ).name ) + ': ' )
          this.value( s, source )
        }
      })
      this.write(' }\n')

      this.stack.push( macro.name )
      // The body is written in the macros source, `arguments` its own
      this.block( macro.children, 'macros', names, () => {
        this.write(`const $rguments = ${ args }\n`)
        for( const name of names )
          this.write(`const ${ name } = ${
            named.includes( name ) ? `${ args }[ ${ JSON.stringify( name ) } ]`
            : spreads.length ? `( ${ args } as any )[ ${ JSON.stringify( name ) } ]`
            : 'undefined'
          }\n`)
      })
      this.stack.pop()
    }))
  }
}

/**
 * A template, and the macros it may call, as a shadow. Each expression
 * that does not parse is left out: the compiler reports it.
 */
export function shadowTemplate( template: string, macros = '', own?: Own ): Shadow {
  const w = new Writer({ template, macros }, macrosOf( macros ), own )
  const root = parseTemplate( template ).root
  w.block( root.children, 'template', [], () => {
    // `static` and `arguments` are reserved words: renamed where they are read
    w.write('const { state, input, context } = this, $tatic = this.static, self = this, $rguments: Record<string, unknown> = {}\n')
  })
  return { body: w.body, spans: w.spans, handlers: w.handlers }
}
