/**
 * Phase 2 — IR runtime (RFC-001 §6)
 *
 * TemplateIR → live DOM:
 *  - skeletons parsed ONCE per block into <template>, instantiated
 *    per use via content.cloneNode(true) + a bind walk over
 *    precomputed integer paths
 *  - every bind is its own effect over per-key signals — updates are
 *    O(changed bindings), no digest, no clones, no deep equality
 *  - block instances are bracketed by owned comment markers so
 *    control-flow content moves/disposes as a range
 *  - dual expression modes over the same IR: 'compiled' (Function,
 *    trusted) / 'interpreted' (sandboxed AST walker, CSP-safe)
 */

import type { TemplateIR, BlockIR, ChildIR, CompInput, E, Path } from './compiler'
import type { ExprEnv, Expr } from './expression'
import { parseExpression, compileExpression, interpretExpression } from './expression'
import { signal, effect, untrack, reactive } from './signal'

// ------------------------------------------------------------------- types
export interface IRComponentDef {
  ir: TemplateIR
  state?: Record<string, any>
  handlers?: Record<string, ( this: any, ...args: any[] ) => any>
}

export interface RuntimeOptions {
  mode?: 'compiled' | 'interpreted'
  components?: Record<string, IRComponentDef>
}

export interface RenderSetup {
  state?: Record<string, any>
  input?: Record<string, any>
  context?: Record<string, any>
  static?: Record<string, any>
  handlers?: Record<string, ( this: any, ...args: any[] ) => any>
}

export interface IRInstance {
  state: Record<string, any>
  nodes: Node[]
  mount( container: Element ): void
  dispose(): void
}

type RunEnv = ExprEnv

/** A rendered block: bracketed range + owned effect disposers */
interface BlockInstance {
  start: Comment
  end: Comment
  disposers: ( () => void )[]
}

// ----------------------------------------------------------------- helpers
const AST_CACHE = new Map<string, Expr>()
function astOf( src: string ): Expr {
  let ast = AST_CACHE.get( src )
  if( !ast ){
    ast = parseExpression( src ).ast
    AST_CACHE.set( src, ast )
  }
  return ast
}

const SKELETONS = new WeakMap<BlockIR, HTMLTemplateElement>()
function skeleton( block: BlockIR ): HTMLTemplateElement {
  let tpl = SKELETONS.get( block )
  if( !tpl ){
    tpl = document.createElement('template')
    tpl.innerHTML = block.html
    SKELETONS.set( block, tpl )
  }
  return tpl
}

function resolvePath( root: ParentNode, p: Path ): Node {
  let node: any = root
  for( const i of p ) node = node.childNodes[ i ]
  return node
}

function nodesOf( inst: BlockInstance ): Node[] {
  const out: Node[] = []
  let n: Node | null = inst.start
  while( n ){
    out.push( n )
    if( n === inst.end ) break
    n = n.nextSibling
  }
  return out
}
function insertAfter( ref: Node, nodes: Node[] ){
  const parent = ref.parentNode
  if( !parent ) return
  let anchor = ref
  for( const n of nodes ){
    parent.insertBefore( n, anchor.nextSibling )
    anchor = n
  }
}
function destroy( inst: BlockInstance | null ){
  if( !inst ) return
  for( const d of inst.disposers ) d()
  for( const n of nodesOf( inst ) ) ( n as ChildNode ).remove()
}

/** Split an instruction on top-level commas (strings/brackets opaque) */
function splitTopLevel( src: string ): string[] {
  const out: string[] = []
  let depth = 0, start = 0

  for( let i = 0; i < src.length; i++ ){
    const c = src[ i ]
    if( c === "'" || c === '"' || c === '`' ){
      i++
      while( i < src.length && src[ i ] !== c ){
        if( src[ i ] === '\\' ) i++
        i++
      }
      continue
    }
    if( c === '(' || c === '[' || c === '{' ) depth++
    else if( c === ')' || c === ']' || c === '}' ) depth--
    else if( c === ',' && depth === 0 ){
      out.push( src.slice( start, i ) )
      start = i + 1
    }
  }
  out.push( src.slice( start ) )
  return out.map( s => s.trim() ).filter( Boolean )
}

const applyAttr = ( el: Element, name: string, v: any ) => {
  v === false || v == null
    ? el.removeAttribute( name )
    : el.setAttribute( name, v === true ? '' : String( v ) )
}

const defineGetter = ( scope: any, name: string, get: () => any ) =>
  Object.defineProperty( scope, name, { get, enumerable: true, configurable: true } )

// ---------------------------------------------------------------- renderer
class IRRenderer {
  constructor( private ir: TemplateIR, private options: RuntimeOptions ){}

  /** Expression runner for a table entry, honoring the execution mode */
  private runner( e: E, scopeNames: string[] ): ( env: RunEnv ) => any {
    const src = this.ir.exprs[ e ]
    return this.srcRunner( src, scopeNames )
  }
  private srcRunner( src: string, scopeNames: string[] ): ( env: RunEnv ) => any {
    if( this.options.mode === 'interpreted' ){
      const ast = astOf( src )
      return env => interpretExpression( ast, env )
    }
    const compiled = compileExpression( src, scopeNames )
    return env => compiled.run( env )
  }

  renderBlock( block: BlockIR, env: RunEnv ): BlockInstance {
    const
    frag = skeleton( block ).content.cloneNode( true ) as DocumentFragment,
    disposers: ( () => void )[] = []

    /**
     * Resolve every bind/anchor path BEFORE any mutation —
     * runtime insertions (text nodes, markers, arm content)
     * shift childNodes indices.
     */
    const bindNodes = block.binds.map( b => resolvePath( frag, b.p ) )
    const anchorNodes = block.blocks.map( b => resolvePath( frag, b.p ) as Comment )

    // Bracket the block content as an owned range
    const start = document.createComment('^')
    const end = document.createComment('$')
    frag.insertBefore( start, frag.firstChild )
    frag.appendChild( end )

    // Scope chain for this block
    const scope = Object.create( env.scope ?? null )
    const benv: RunEnv = { ...env, scope }

    /**
     * <let>/<const> pass first — their names are visible to
     * every bind of this block (RFC decision #1)
     */
    block.blocks.forEach( child => {
      if( child.t !== 'let' ) return

      for( const [ name, input ] of Object.entries( child.vars ) ){
        if( 'lit' in input ){
          const [ get ] = signal( input.lit )
          defineGetter( scope, name, get )
        }
        else {
          const [ get, set ] = signal<any>( undefined )
          defineGetter( scope, name, get )
          const run = this.runner( input.e, block.scope )
          disposers.push( effect( () => set( run( benv ) ) ).dispose )
        }
      }
    })

    // Binds — one effect each
    block.binds.forEach( ( bind, i ) => {
      const node = bindNodes[ i ]

      switch( bind.t ){
        case 'text': {
          const textNode = document.createTextNode('')
          insertAfter( node, [ textNode ] )
          const run = this.runner( bind.e, block.scope )
          disposers.push( effect( () => {
            const v = run( benv )
            textNode.data = v == null ? '' : String( v )
          }).dispose )
          break
        }
        case 'attr': {
          const run = this.runner( bind.e, block.scope )
          disposers.push( effect( () => applyAttr( node as Element, bind.name, run( benv ) ) ).dispose )
          break
        }
        case 'prop': {
          const run = this.runner( bind.e, block.scope )
          disposers.push( effect( () => {
            const v = run( benv )
            bind.name === 'html'
              ? ( node as Element ).innerHTML = v == null ? '' : String( v )
              // 'text' | 'format' — format is the i18n plugin hook (Phase 3)
              : ( node as Element ).textContent = v == null ? '' : String( v )
          }).dispose )
          break
        }
        case 'event': {
          const handler = this.eventDispatcher( this.ir.exprs[ bind.e ], block.scope, benv )
          ;( node as Element ).addEventListener( bind.name, handler )
          disposers.push( () => ( node as Element ).removeEventListener( bind.name, handler ) )
          break
        }
        case 'spread': {
          const run = this.runner( bind.e, block.scope )
          let prev = new Set<string>()
          disposers.push( effect( () => {
            const obj = run( benv ) || {}
            const next = new Set<string>( Object.keys( obj ) )
            for( const k of prev ) !next.has( k ) && ( node as Element ).removeAttribute( k )
            for( const k of next ) applyAttr( node as Element, k, obj[ k ] )
            prev = next
          }).dispose )
          break
        }
      }
    })

    // Control-flow / component blocks
    block.blocks.forEach( ( child, i ) => {
      if( child.t === 'let' ) return
      this.execBlock( child, anchorNodes[ i ], benv, block.scope, disposers )
    })

    return { start, end, disposers }
  }

  // -------------------------------------------------------------- executors
  private execBlock( child: ChildIR, anchor: Comment, benv: RunEnv, scopeNames: string[], disposers: ( () => void )[] ){
    switch( child.t ){
      case 'if': {
        const runs = child.branches.map( b => b.when != null ? this.runner( b.when, scopeNames ) : null )
        let current: BlockInstance | null = null
        let activeIdx = -2

        const h = effect( () => {
          let idx = -1
          for( let i = 0; i < child.branches.length; i++ ){
            const run = runs[ i ]
            if( !run || run( benv ) ){ idx = i; break }
          }
          if( idx === activeIdx ) return
          activeIdx = idx

          untrack( () => {
            destroy( current )
            current = null
            if( idx >= 0 ){
              current = this.renderBlock( child.branches[ idx ].block, benv )
              insertAfter( anchor, nodesOf( current ) )
            }
          })
        })

        disposers.push( () => { h.dispose(); destroy( current ) } )
        break
      }

      case 'switch': {
        const onRun = this.runner( child.on, scopeNames )
        const caseRuns = child.cases.map( c =>
          c.is && 'e' in c.is ? this.runner( c.is.e, scopeNames ) : null )
        let current: BlockInstance | null = null
        let activeIdx = -2

        const h = effect( () => {
          const value = onRun( benv )
          let idx = -1, defaultIdx = -1

          for( let i = 0; i < child.cases.length; i++ ){
            const c = child.cases[ i ]
            if( c.is === null ){ defaultIdx = i; continue }

            const is = 'lit' in c.is ? c.is.lit : caseRuns[ i ]!( benv )
            if( Array.isArray( is ) ? is.includes( value ) : is === value ){ idx = i; break }
          }
          if( idx === -1 ) idx = defaultIdx
          if( idx === activeIdx ) return
          activeIdx = idx

          untrack( () => {
            destroy( current )
            current = null
            if( idx >= 0 ){
              current = this.renderBlock( child.cases[ idx ].block, benv )
              insertAfter( anchor, nodesOf( current ) )
            }
          })
        })

        disposers.push( () => { h.dispose(); destroy( current ) } )
        break
      }

      case 'for':
        this.execFor( child, anchor, benv, scopeNames, disposers )
        break

      case 'async': {
        const awaitRun = this.runner( child.awaitE, scopeNames )
        let current: BlockInstance | null = null
        let token = 0

        const swapTo = ( arm: { args: string[], block: BlockIR } | BlockIR | undefined, value?: any ) => {
          destroy( current )
          current = null
          if( !arm ) return

          const isArm = 'block' in arm
          const scope2 = Object.create( benv.scope ?? null )
          if( isArm && arm.args[0] !== undefined ){
            const [ get ] = signal( value )
            defineGetter( scope2, arm.args[0], get )
          }
          current = this.renderBlock( isArm ? arm.block : arm, { ...benv, scope: scope2 } )
          insertAfter( anchor, nodesOf( current ) )
        }

        const h = effect( () => {
          const p = awaitRun( benv )
          const my = ++token

          untrack( () => {
            child.loading ? swapTo( child.loading ) : swapTo( undefined )

            Promise.resolve( p ).then(
              v => my === token && untrack( () => swapTo( child.then, v ) ),
              err => my === token && untrack( () => swapTo( child.catch, err ) )
            )
          })
        })

        disposers.push( () => { token++; h.dispose(); destroy( current ) } )
        break
      }

      case 'log': {
        const segs = splitTopLevel( this.ir.exprs[ child.e ] ).map( s => this.srcRunner( s, scopeNames ) )
        disposers.push( effect( () => console.log( ...segs.map( run => run( benv ) ) ) ).dispose )
        break
      }

      case 'comp': {
        const def = this.options.components?.[ child.name ]
        def
          ? this.execComponent( def, child, anchor, benv, scopeNames, disposers )
          : this.execElement( child, anchor, benv, scopeNames, disposers )
        break
      }

      case 'dynamic': {
        const tagRun = this.runner( child.tag, scopeNames )
        let inner: ( () => void )[] = []
        let activeVerb: any = Symbol('init')

        const h = effect( () => {
          const verb = tagRun( benv )
          if( verb === activeVerb ) return
          activeVerb = verb

          untrack( () => {
            for( const d of inner ) d()
            inner = []

            if( verb == null ) return

            // Component name or definition object
            const def = typeof verb === 'string'
              ? this.options.components?.[ verb ]
              : ( verb && typeof verb === 'object' && verb.ir ? verb as IRComponentDef : undefined )

            if( def ) this.execComponent( def, child, anchor, benv, scopeNames, inner )
            else if( typeof verb === 'string' )
              this.execElement( { ...child, name: verb } as any, anchor, benv, scopeNames, inner )
          })
        })

        disposers.push( () => { h.dispose(); for( const d of inner ) d() } )
        break
      }
    }
  }

  /** Keyed <for> — per-item scope signals, range moves, natural entry keys */
  private execFor(
    child: ChildIR & { t: 'for' },
    anchor: Comment,
    benv: RunEnv,
    scopeNames: string[],
    disposers: ( () => void )[]
  ){
    type Item = {
      key: any
      sigs: [ () => any, ( v: any ) => void ][]
      inst: BlockInstance
    }

    const
    ofRun = child.of !== undefined ? this.runner( child.of, scopeNames ) : null,
    byRun = child.by && 'e' in child.by ? this.runner( child.by.e, scopeNames ) : null,
    byPath = child.by && 'lit' in child.by ? String( child.by.lit ).split('.') : null,
    inputVal = ( ci: CompInput | undefined, env: RunEnv ) =>
      ci === undefined ? undefined : 'lit' in ci ? ci.lit : this.runner( ci.e, scopeNames )( env )

    let items: Item[] = []
    const byKey = new Map<any, Item>()

    /** Normalize source → [{ key, values(aligned with args) }] */
    const tuples = (): { key: any, values: any[] }[] => {
      // Numeric range
      if( ofRun === null ){
        const from = Number( inputVal( child.from, benv ) ?? 0 )
        const to = Number( inputVal( child.to, benv ) ?? from )
        const asc = from <= to
        const out: { key: any, values: any[] }[] = []
        for( let v = from; asc ? v <= to : v >= to; asc ? v++ : v-- )
          out.push({ key: v, values: [ v ] })
        return out
      }

      const src = ofRun( benv )
      const keyFor = ( item: any, fallback: any, index: number ) => {
        if( byRun ){
          const fn = byRun( benv )
          return typeof fn === 'function' ? fn( item, index ) : fallback
        }
        if( byPath ) return byPath.reduce( ( v: any, k ) => v?.[ k ], item )
        return fallback
      }

      if( Array.isArray( src ) )
        return src.map( ( item, i ) => ({ key: keyFor( item, i, i ), values: [ item, i ] }) )

      if( src instanceof Map )
        return [ ...src.entries() ].map( ( [ k, v ], i ) => ({ key: k, values: [ k, v, i ] }) )

      if( src && typeof src === 'object' )
        return Object.entries( src ).map( ( [ k, v ], i ) => ({ key: k, values: [ k, v, i ] }) )

      return []
    }

    const h = effect( () => {
      const next = tuples() // tracked reads
      untrack( () => {
        const seen = new Set<any>()
        const ordered: Item[] = []

        for( const t of next ){
          let key = t.key
          // Duplicate keys degrade to positional identity
          if( seen.has( key ) ) key = `#dup:${ordered.length}`
          seen.add( key )

          const existing = byKey.get( key )
          if( existing ){
            existing.sigs.forEach( ( [ , set ], j ) => set( t.values[ j ] ) )
            ordered.push( existing )
          }
          else {
            const scope2 = Object.create( benv.scope ?? null )
            const sigs = t.values.map( v => signal( v ) )
            child.args.forEach( ( name, j ) => sigs[ j ] && defineGetter( scope2, name, sigs[ j ][0] ) )

            const inst = this.renderBlock( child.block, { ...benv, scope: scope2 } )
            const item: Item = { key, sigs, inst }
            byKey.set( key, item )
            ordered.push( item )
          }
        }

        // Remove disappeared keys
        for( const item of items )
          if( !ordered.includes( item ) ){
            byKey.delete( item.key )
            destroy( item.inst )
          }

        // Pointer walk: enforce order with range moves
        let pointer: Node = anchor
        for( const item of ordered ){
          if( pointer.nextSibling !== item.inst.start )
            insertAfter( pointer, nodesOf( item.inst ) )
          pointer = item.inst.end
        }

        items = ordered
      })
    })

    disposers.push( () => {
      h.dispose()
      for( const item of items ) destroy( item.inst )
      items = []
      byKey.clear()
    })
  }

  /** Registered component: reactive inputs, own state/handlers/env */
  private execComponent(
    def: IRComponentDef,
    child: { inputs: Record<string, CompInput>, spreads: E[] },
    anchor: Comment,
    benv: RunEnv,
    scopeNames: string[],
    disposers: ( () => void )[]
  ){
    const input = reactive( {} as Record<string, any> )

    for( const [ name, ci ] of Object.entries( child.inputs ) ){
      if( 'lit' in ci ) input[ name ] = ci.lit
      else {
        const run = this.runner( ci.e, scopeNames )
        disposers.push( effect( () => input[ name ] = run( benv ) ).dispose )
      }
    }
    for( const e of child.spreads ){
      const run = this.runner( e, scopeNames )
      disposers.push( effect( () => {
        const obj = run( benv ) || {}
        untrack( () => Object.entries( obj ).forEach( ( [ k, v ] ) => input[ k ] = v ) )
      }).dispose )
    }

    const state = reactive( { ...( def.state || {} ) } )
    const self: any = { state, input }
    def.handlers && Object.entries( def.handlers ).forEach( ( [ k, fn ] ) => self[ k ] = fn.bind( self ) )

    const cenv: RunEnv = { state, input, context: benv.context, static: benv.static, self, scope: undefined }
    const renderer = new IRRenderer( def.ir, this.options )
    const inst = renderer.renderBlock( def.ir.root, cenv )

    insertAfter( anchor, nodesOf( inst ) )
    disposers.push( () => destroy( inst ) )
    // TODO(Phase 2 follow-up): slotted contents + component events
  }

  /** Unresolved component candidate → plain element with binds */
  private execElement(
    child: ChildIR & { t: 'comp' },
    anchor: Comment,
    benv: RunEnv,
    scopeNames: string[],
    disposers: ( () => void )[]
  ){
    const el = document.createElement( child.name )

    for( const [ name, ci ] of Object.entries( child.inputs ) ){
      if( 'lit' in ci ) applyAttr( el, name, ci.lit )
      else {
        const run = this.runner( ci.e, scopeNames )
        disposers.push( effect( () => applyAttr( el, name, run( benv ) ) ).dispose )
      }
    }
    for( const ev of child.events ){
      const handler = this.eventDispatcher( this.ir.exprs[ ev.e ], scopeNames, benv )
      el.addEventListener( ev.name, handler )
      disposers.push( () => el.removeEventListener( ev.name, handler ) )
    }

    if( child.contents ){
      const inst = this.renderBlock( child.contents.block, benv )
      el.append( ...nodesOf( inst ) )
      disposers.push( () => destroy( inst ) )
    }

    insertAfter( anchor, [ el ] )
    disposers.push( () => el.remove() )
  }

  /**
   * Event instruction dispatch (lazy — evaluated per event):
   *  - `on-click( expr )` → value must be a function, called with (event)
   *  - `on-click( name, ...args )` → resolves `name` (expression, then
   *    self method fallback) and calls with (...args, event)
   * Scope getters read live values at dispatch — no stale memos.
   */
  private eventDispatcher( instruction: string, scopeNames: string[], benv: RunEnv ){
    const segs = splitTopLevel( instruction )

    return ( event: Event ) => untrack( () => {
      const resolveFn = ( src: string ) => {
        let v: any
        try { v = this.srcRunner( src, scopeNames )( benv ) }
        catch( e ){ v = undefined }
        if( typeof v !== 'function' && benv.self && typeof benv.self[ src ] === 'function' )
          v = benv.self[ src ]
        return v
      }

      if( !segs.length ) return

      const fn = resolveFn( segs[0] )
      if( typeof fn !== 'function' ) return

      const args = segs.slice( 1 ).map( src => this.srcRunner( src, scopeNames )( benv ) )
      fn( ...args, event )
    })
  }
}

// -------------------------------------------------------------------- API
export function renderIR( ir: TemplateIR, setup: RenderSetup = {}, options: RuntimeOptions = {} ): IRInstance {
  const
  state = reactive( setup.state || {} ),
  input = setup.input ? reactive( setup.input ) : undefined,
  self: any = { state, input }

  setup.handlers && Object.entries( setup.handlers ).forEach( ( [ k, fn ] ) => self[ k ] = fn.bind( self ) )

  const env: RunEnv = {
    state,
    input,
    context: setup.context,
    static: setup.static,
    self,
    scope: undefined
  }

  const renderer = new IRRenderer( ir, options )
  const inst = renderer.renderBlock( ir.root, env )

  return {
    state,
    get nodes(){ return nodesOf( inst ) },
    mount( container: Element ){ container.append( ...nodesOf( inst ) ) },
    dispose(){ destroy( inst ) }
  }
}
