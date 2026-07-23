/**
 * Phase 2 — IR runtime (RFC-001 §6, §8)
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
 *
 * Hot-swap (§8): instances retain their structure (bind handles,
 * child handles, resolved path nodes) so `instance.swap( newIR )`
 * can diff old vs new by expression source and update surgically:
 *  - identical subtrees   → kept wholesale (zero DOM work)
 *  - bind-only changes    → effects rewired onto the SAME nodes
 *  - skeleton changes     → that block re-rendered in place
 * State lives outside the IR, so it survives by construction.
 */

import type { TemplateIR, BlockIR, BindIR, ChildIR, ArmIR, CompInput, E, Path } from './compiler'
import type { ExprEnv, Expr } from './expression'
import { parseExpression, compileExpression, interpretExpression } from './expression'
import { signal, effect, untrack, reactive } from './signal'
import type { SwapChange, SwapReport } from './swap'
import { sameBinds, sameChild, sameLets } from './swap'

// ------------------------------------------------------------------- types
export interface IRComponentDef {
  ir: TemplateIR
  state?: Record<string, any>
  statics?: Record<string, any>
  /** Context fields this component subscribes to (fires onContext) */
  context?: string[]
  /** Deep-reactive component state (old-engine parity) */
  deep?: boolean
  /**
   * Methods bound to the component self — lifecycle keys
   * (onCreate/onInput/onMount/onDestroy) are invoked by the
   * runtime at the matching moments.
   */
  handlers?: Record<string, ( this: any, ...args: any[] ) => any>
}

export interface RuntimeOptions {
  mode?: 'compiled' | 'interpreted'
  components?: Record<string, IRComponentDef>
  /** Host-provided context subscription (returns an unsubscribe) */
  watchContext?( fields: string[], fn: () => void ): () => void
}

export interface RenderSetup {
  state?: Record<string, any>
  input?: Record<string, any>
  context?: Record<string, any>
  static?: Record<string, any>
  handlers?: Record<string, ( this: any, ...args: any[] ) => any>
  /** Deep-reactive root state (old-engine parity) */
  deep?: boolean
  /** Extra members merged onto self before handlers bind (e.g. emit) */
  expose?: Record<string, any>
}

export interface IRInstance {
  state: Record<string, any>
  self: Record<string, any>
  nodes: Node[]
  mount( container: Element ): void
  swap( newIR: TemplateIR ): SwapReport
  dispose(): void
}

type RunEnv = ExprEnv

interface BindHandle {
  bind: BindIR
  node: Node
  textNode?: Text
  dispose: () => void
}
interface ChildHandle {
  child: ChildIR
  exprs: string[]
  anchor: Comment
  dispose: () => void
}

/** A rendered block: bracketed range + retained structure for swap */
interface BlockInstance {
  start: Comment
  end: Comment
  block: BlockIR
  exprs: string[]
  penv: RunEnv                    // parent env (for full re-render)
  benv: RunEnv                    // env with this block's scope layer
  pathNodes: Map<string, Node>    // pathKey → resolved node (binds + anchors)
  bindHandles: BindHandle[]
  childHandles: ChildHandle[]
}

// ----------------------------------------------------------------- helpers
/** Marks a slot renderer handed to a child as `input.renderer` */
const SLOT = Symbol('lips.slot')

interface SlotRenderer {
  [ SLOT ]: true
  args: string[]
  render( argvalues?: Record<string, any> ): BlockInstance
}
const isSlot = ( v: any ): v is SlotRenderer => !!v && typeof v === 'object' && v[ SLOT ] === true

/**
 * Component lifecycle plumbing (RFC §6: ownership events, not
 * document-wide observation). One hooks object per component
 * instance; nested components get their own.
 */
interface ComponentHooks {
  notifyUpdate(): void
  onError( error: unknown ): void
  /** Called once the component's first render completes */
  ready(): void
}

function makeHooks( self: any ): ComponentHooks {
  let scheduled = false
  let isReady = false

  const onError = ( error: unknown ) =>
    typeof self.onError === 'function'
      ? self.onError( error )
      : console.error('[lips:ir]', error )

  return {
    onError,
    ready(){ isReady = true },
    notifyUpdate(){
      // Suppress during the initial render pass
      if( !isReady || scheduled ) return
      scheduled = true

      queueMicrotask( () => {
        scheduled = false
        try {
          typeof self.onUpdate === 'function' && self.onUpdate()
          typeof self.onRender === 'function' && self.onRender()
        }
        catch( error ){ onError( error ) }
      })
    }
  }
}

/**
 * Attach callbacks queued during render, flushed once the nodes
 * are actually in the document (root mount, or immediate when the
 * insertion point is already live).
 */
const PENDING_ATTACH: { node: () => Node | undefined, fn: () => void }[] = []

function flushAttach(){
  for( let i = PENDING_ATTACH.length - 1; i >= 0; i-- ){
    const entry = PENDING_ATTACH[ i ]
    const node = entry.node()

    if( node && node.isConnected ){
      PENDING_ATTACH.splice( i, 1 )
      entry.fn()
    }
  }
}

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

const pathKey = ( p: Path ) => p.join(',')

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
function disposeInstance( inst: BlockInstance ){
  for( const h of inst.bindHandles ) h.dispose()
  for( const h of inst.childHandles ) h.dispose()
}
function destroy( inst: BlockInstance | null ){
  if( !inst ) return
  disposeInstance( inst )
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
  constructor( readonly ir: TemplateIR, private options: RuntimeOptions, private hooks?: ComponentHooks ){}

  /**
   * Bind effects run inside the component's error boundary and
   * report post-initial re-runs as component updates.
   */
  private guarded( fn: () => void ){
    let first = true
    return effect( () => {
      try { fn() }
      catch( error ){
        this.hooks ? this.hooks.onError( error ) : console.error('[lips:ir]', error )
      }
      first ? first = false : this.hooks?.notifyUpdate()
    })
  }

  /** Expression runner for a table entry, honoring the execution mode */
  private runner( e: E, scopeNames: string[] ): ( env: RunEnv ) => any {
    return this.srcRunner( this.ir.exprs[ e ], scopeNames )
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
    const frag = skeleton( block ).content.cloneNode( true ) as DocumentFragment

    /**
     * Resolve every bind/anchor path BEFORE any mutation —
     * runtime insertions (text nodes, markers, arm content)
     * shift childNodes indices.
     */
    const pathNodes = new Map<string, Node>()
    const bindNodes = block.binds.map( b => {
      const node = resolvePath( frag, b.p )
      pathNodes.set( pathKey( b.p ), node )
      return node
    })
    const anchorNodes = block.blocks.map( b => {
      const node = resolvePath( frag, b.p ) as Comment
      pathNodes.set( pathKey( b.p ), node )
      return node
    })

    // Bracket the block content as an owned range
    const start = document.createComment('^')
    const end = document.createComment('$')
    frag.insertBefore( start, frag.firstChild )
    frag.appendChild( end )

    // Scope chain for this block
    const scope = Object.create( env.scope ?? null )
    const benv: RunEnv = { ...env, scope }

    const inst: BlockInstance = {
      start, end, block,
      exprs: this.ir.exprs,
      penv: env, benv,
      pathNodes,
      bindHandles: [],
      childHandles: []
    }

    /**
     * <let>/<const> pass first — their names are visible to
     * every bind of this block (RFC decision #1)
     */
    block.blocks.forEach( ( child, i ) => {
      if( child.t !== 'let' ) return

      const letDisposers: ( () => void )[] = []
      for( const [ name, input ] of Object.entries( child.vars ) ){
        if( 'lit' in input ){
          const [ get ] = signal( input.lit )
          defineGetter( scope, name, get )
        }
        else {
          const [ get, set ] = signal<any>( undefined )
          defineGetter( scope, name, get )
          const run = this.runner( input.e, block.scope )
          letDisposers.push( effect( () => set( run( benv ) ) ).dispose )
        }
      }

      inst.childHandles[ i ] = {
        child, exprs: this.ir.exprs, anchor: anchorNodes[ i ],
        dispose: () => letDisposers.forEach( d => d() )
      }
    })

    // Binds — one effect each
    inst.bindHandles = block.binds.map( ( bind, i ) =>
      this.bindOne( bind, bindNodes[ i ], benv, block.scope ) )

    // Control-flow / component blocks
    block.blocks.forEach( ( child, i ) => {
      if( child.t === 'let' ) return
      inst.childHandles[ i ] = {
        child, exprs: this.ir.exprs, anchor: anchorNodes[ i ],
        dispose: this.execBlock( child, anchorNodes[ i ], benv, block.scope )
      }
    })

    return inst
  }

  /** Wire one bind onto its node; returns a swap-capable handle */
  private bindOne( bind: BindIR, node: Node, benv: RunEnv, scopeNames: string[], reuseText?: Text ): BindHandle {
    switch( bind.t ){
      case 'text': {
        const textNode = reuseText ?? document.createTextNode('')
        !reuseText && insertAfter( node, [ textNode ] )
        const run = this.runner( bind.e, scopeNames )
        const h = this.guarded( () => {
          const v = run( benv )
          textNode.data = v == null ? '' : String( v )
        })
        return { bind, node, textNode, dispose: h.dispose }
      }
      case 'attr': {
        const run = this.runner( bind.e, scopeNames )
        const h = this.guarded( () => applyAttr( node as Element, bind.name, run( benv ) ) )
        return { bind, node, dispose: h.dispose }
      }
      case 'prop': {
        const run = this.runner( bind.e, scopeNames )
        const h = this.guarded( () => {
          const v = run( benv )
          bind.name === 'html'
            ? ( node as Element ).innerHTML = v == null ? '' : String( v )
            // 'text' | 'format' — format is the i18n plugin hook (Phase 3)
            : ( node as Element ).textContent = v == null ? '' : String( v )
        })
        return { bind, node, dispose: h.dispose }
      }
      case 'event': {
        const handler = this.eventDispatcher( this.ir.exprs[ bind.e ], scopeNames, benv )
        ;( node as Element ).addEventListener( bind.name, handler )
        return { bind, node, dispose: () => ( node as Element ).removeEventListener( bind.name, handler ) }
      }
      case 'spread': {
        const run = this.runner( bind.e, scopeNames )
        let prev = new Set<string>()
        const h = this.guarded( () => {
          const obj = run( benv ) || {}
          const next = new Set<string>( Object.keys( obj ) )
          for( const k of prev ) !next.has( k ) && ( node as Element ).removeAttribute( k )
          for( const k of next ) applyAttr( node as Element, k, obj[ k ] )
          prev = next
        })
        return { bind, node, dispose: h.dispose }
      }
    }
  }

  // ----------------------------------------------------------------- swap
  /**
   * Diff-and-patch a live block against a new BlockIR (whose E
   * indices refer to THIS renderer's expression table). Returns
   * the live instance — a fresh one when a rebuild was needed.
   */
  swapBlock( inst: BlockInstance, newBlock: BlockIR, report: SwapChange[], path: string ): BlockInstance {
    /**
     * Structural rebuild triggers: skeleton, scope shape, or
     * let wiring changed — re-render this block in place.
     * (Worst case equals a fresh render — never worse.)
     */
    if( inst.block.html !== newBlock.html
        || JSON.stringify( inst.block.scope ) !== JSON.stringify( newBlock.scope )
        || !sameLets( inst.block, inst.exprs, newBlock, this.ir.exprs ) )
      return this.rebuild( inst, newBlock, report, path )

    // Bind-only changes: rewire effects onto the SAME nodes
    if( !sameBinds( inst.block.binds, inst.exprs, newBlock.binds, this.ir.exprs ) ){
      const nodes = newBlock.binds.map( b => inst.pathNodes.get( pathKey( b.p ) ) )

      // A bind on a path we never resolved → degrade to rebuild
      if( nodes.some( n => !n ) )
        return this.rebuild( inst, newBlock, report, path )

      const oldTexts = new Map<string, Text>()
      inst.bindHandles.forEach( h => h.textNode && oldTexts.set( pathKey( h.bind.p ), h.textNode ) )
      inst.bindHandles.forEach( h => h.dispose() )

      const reused = new Set<string>()
      inst.bindHandles = newBlock.binds.map( ( b, i ) => {
        const key = pathKey( b.p )
        const reuse = b.t === 'text' ? oldTexts.get( key ) : undefined
        reuse && reused.add( key )
        return this.bindOne( b, nodes[ i ]!, inst.benv, newBlock.scope, reuse )
      })
      // Text nodes whose bind disappeared
      oldTexts.forEach( ( tn, key ) => !reused.has( key ) && tn.remove() )

      report.push({ kind: 'binds', path })
    }

    /**
     * Children pairwise (equal html ⇒ equal anchor count):
     * identical-by-source subtrees are kept wholesale; changed
     * subtrees re-execute at their existing anchor.
     */
    for( let i = 0; i < newBlock.blocks.length; i++ ){
      const newChild = newBlock.blocks[ i ]
      const oldH = inst.childHandles[ i ]
      if( newChild.t === 'let' ) continue // covered by sameLets above

      if( oldH && sameChild( oldH.child, oldH.exprs, newChild, this.ir.exprs ) ) continue

      oldH?.dispose()
      inst.childHandles[ i ] = {
        child: newChild, exprs: this.ir.exprs, anchor: oldH.anchor,
        dispose: this.execBlock( newChild, oldH.anchor, inst.benv, newBlock.scope )
      }
      report.push({ kind: 'block', path: `${path}/${i}` })
    }

    inst.block = newBlock
    inst.exprs = this.ir.exprs
    return inst
  }

  private rebuild( inst: BlockInstance, newBlock: BlockIR, report: SwapChange[], path: string ): BlockInstance {
    const fresh = this.renderBlock( newBlock, inst.penv )
    insertAfter( inst.end, nodesOf( fresh ) )
    destroy( inst )
    report.push({ kind: 'skeleton', path })
    return fresh
  }

  // -------------------------------------------------------------- executors
  /** Execute a control-flow/component block; returns its disposer */
  private execBlock( child: ChildIR, anchor: Comment, benv: RunEnv, scopeNames: string[] ): () => void {
    const disposers: ( () => void )[] = []

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

      case 'macro': {
        /**
         * Inlined macro body: declared argv become block-scoped
         * reactive vars; every call-site attribute also lands in
         * `arguments` (per-key reactive, so `arguments.x` binds
         * track only that key).
         */
        const scope = Object.create( benv.scope ?? null )
        const args = reactive( {} as Record<string, any> )

        for( const [ name, ci ] of Object.entries( child.vars ) ){
          if( 'lit' in ci ){
            args[ name ] = ci.lit
            if( child.args.includes( name ) ){
              const [ get ] = signal( ci.lit )
              defineGetter( scope, name, get )
            }
            continue
          }

          const run = this.runner( ci.e, scopeNames )
          const [ get, set ] = signal<any>( undefined )

          if( child.args.includes( name ) ) defineGetter( scope, name, get )

          disposers.push( effect( () => {
            const v = run( benv )
            set( v )
            args[ name ] = v
          }).dispose )
        }

        const inst = this.renderBlock( child.block, { ...benv, arguments: args, scope })
        insertAfter( anchor, nodesOf( inst ) )
        disposers.push( () => destroy( inst ) )
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

            /**
             * Slot placement: `<{input.renderer} …/>` renders the
             * parent's slotted body here; this tag's inputs become
             * the slot's argument values.
             */
            if( isSlot( verb ) ){
              const argvalues: Record<string, any> = {}
              for( const [ name, ci ] of Object.entries( child.inputs ) )
                argvalues[ name ] = 'lit' in ci ? ci.lit : this.runner( ci.e, scopeNames )( benv )

              const slotInst = verb.render( argvalues )
              insertAfter( anchor, nodesOf( slotInst ) )
              inner.push( () => destroy( slotInst ) )
              return
            }

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

    return () => disposers.forEach( d => d() )
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
      sigs: [ () => any, ( v: any ) => void, () => void ][]
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
          if( seen.has( key ) ){
            console.warn(`<for> duplicate key '${String( key )}' — falling back to positional identity`)
            key = `#dup:${ordered.length}`
          }
          seen.add( key )

          const existing = byKey.get( key )
          if( existing ){
            existing.sigs.forEach( ( [ get, set, touch ], j ) => {
              const nv = t.values[ j ]
              /**
               * Same object reference may have mutated in place
               * (deep-reactive mode) — force the item's binds to
               * re-evaluate; unchanged primitives stay silent.
               */
              Object.is( get(), nv ) && typeof nv === 'object' && nv !== null
                ? touch()
                : set( nv )
            })
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

  /** Registered component: reactive inputs, slots, events, own env */
  private execComponent(
    def: IRComponentDef,
    child: { inputs: Record<string, CompInput>, spreads: E[], events?: { name: string, e: E }[], contents?: ArmIR },
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

    /**
     * Slotted body → `input.renderer` (old-engine convention):
     * the child template places it with `<{input.renderer}/>`.
     * Content renders in the PARENT scope — a slot closes over
     * where it was written, not where it is placed.
     */
    if( child.contents ){
      const
      parent = this,
      contents = child.contents,
      penv = benv

      input.renderer = {
        [ SLOT ]: true,
        args: contents.args,
        render( argvalues?: Record<string, any> ){
          const scope = Object.create( penv.scope ?? null )

          contents.args.forEach( name => {
            const [ get ] = signal( argvalues?.[ name ] )
            defineGetter( scope, name, get )
          })

          return parent.renderBlock( contents.block, { ...penv, scope } )
        }
      }
    }

    const state = reactive( { ...( def.state || {} ) }, def.deep ?? false )

    /**
     * Component event bus: the child emits, the parent's
     * `on-*( … )` instructions receive the emitted arguments.
     */
    const listeners = new Map<string, ( ( ...args: any[] ) => void )[]>()
    const self: any = {
      state, input, static: def.statics, context: benv.context,
      emit( event: string, ...args: any[] ){
        listeners.get( event )?.forEach( fn => fn( ...args ) )
      },
      on( event: string, fn: ( ...args: any[] ) => void ){
        listeners.set( event, [ ...( listeners.get( event ) || [] ), fn ])
        return self
      },
      off( event: string ){
        listeners.delete( event )
        return self
      }
    }
    def.handlers && Object.entries( def.handlers ).forEach( ( [ k, fn ] ) => self[ k ] = fn.bind( self ) )

    child.events?.forEach( ev => {
      const dispatch = this.eventDispatcher( this.ir.exprs[ ev.e ], scopeNames, benv )
      self.on( ev.name, dispatch )
    })

    const hooks = makeHooks( self )

    // Lifecycle: creation → (initial input) → render → mount → attach
    try { typeof self.onCreate === 'function' && self.onCreate() }
    catch( error ){ hooks.onError( error ) }

    try { Object.keys( input ).length && typeof self.onInput === 'function' && self.onInput() }
    catch( error ){ hooks.onError( error ) }

    const cenv: RunEnv = { state, input, context: benv.context, static: def.statics, self, scope: undefined }
    const renderer = new IRRenderer( def.ir, this.options, hooks )
    const inst = renderer.renderBlock( def.ir.root, cenv )

    insertAfter( anchor, nodesOf( inst ) )
    hooks.ready()

    try {
      typeof self.onMount === 'function' && self.onMount()
      typeof self.onRender === 'function' && self.onRender()
    }
    catch( error ){ hooks.onError( error ) }

    /**
     * Declared context subscription — fires onContext only when
     * one of the component's own fields changes.
     */
    let unwatchContext: ( () => void ) | undefined
    if( def.context?.length && typeof self.onContext === 'function' && this.options.watchContext )
      unwatchContext = this.options.watchContext( def.context, () => {
        try { self.onContext() }
        catch( error ){ hooks.onError( error ) }
      })

    let attached = false
    if( typeof self.onAttach === 'function' || typeof self.onDetach === 'function' ){
      PENDING_ATTACH.push({
        node: () => inst.start,
        fn: () => {
          attached = true
          try { typeof self.onAttach === 'function' && self.onAttach() }
          catch( error ){ hooks.onError( error ) }
        }
      })
      // Parent already live → attach now
      inst.start.isConnected && flushAttach()
    }

    disposers.push( () => {
      unwatchContext?.()
      destroy( inst )
      try {
        attached && typeof self.onDetach === 'function' && self.onDetach()
        typeof self.onDestroy === 'function' && self.onDestroy()
      }
      catch( error ){ hooks.onError( error ) }
    })
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
   *  - `on-click( expr )` → value must be a function, called with (…params)
   *  - `on-click( name, ...args )` → resolves `name` (expression, then
   *    self method fallback) and calls with (...args, ...params)
   *
   * `params` are the DOM event for element listeners, or the emitted
   * arguments for component events — same append-after-declared-args
   * rule either way.
   * Scope getters read live values at dispatch — no stale memos.
   */
  private eventDispatcher( instruction: string, scopeNames: string[], benv: RunEnv ){
    const segs = splitTopLevel( instruction )

    return ( ...params: any[] ) => untrack( () => {
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
      fn( ...args, ...params )
    })
  }
}

// -------------------------------------------------------------------- API
export function renderIR( ir: TemplateIR, setup: RenderSetup = {}, options: RuntimeOptions = {} ): IRInstance {
  const
  state = reactive( setup.state || {}, setup.deep ?? false ),
  input = setup.input ? reactive( setup.input, setup.deep ?? false ) : undefined,
  self: any = { state, input, static: setup.static, ...( setup.expose || {} ) }

  setup.handlers && Object.entries( setup.handlers ).forEach( ( [ k, fn ] ) => self[ k ] = fn.bind( self ) )

  const env: RunEnv = {
    state,
    input,
    context: setup.context,
    static: setup.static,
    self,
    scope: undefined
  }

  const hooks = makeHooks( self )

  /**
   * Root lifecycle mirrors the nested path exactly:
   * create → (initial input) → render → mount/render → attach.
   */
  try { typeof self.onCreate === 'function' && self.onCreate() }
  catch( error ){ hooks.onError( error ) }

  try { input && Object.keys( input ).length && typeof self.onInput === 'function' && self.onInput() }
  catch( error ){ hooks.onError( error ) }

  let renderer = new IRRenderer( ir, options, hooks )
  let current = renderer.renderBlock( ir.root, env )
  hooks.ready()

  try {
    typeof self.onMount === 'function' && self.onMount()
    typeof self.onRender === 'function' && self.onRender()
  }
  catch( error ){ hooks.onError( error ) }

  let attached = false
  const attachSelf = () => {
    if( attached ) return
    attached = true
    try { typeof self.onAttach === 'function' && self.onAttach() }
    catch( error ){ hooks.onError( error ) }
  }

  return {
    state,
    self,
    get nodes(){ return nodesOf( current ) },
    mount( container: Element ){
      container.append( ...nodesOf( current ) )
      /**
       * Ownership-based attach (RFC §6): mounting a live tree
       * settles this component and every child queued during
       * render — no document-wide MutationObserver.
       */
      if( current.start.isConnected ){
        attachSelf()
        flushAttach()
      }
    },
    swap( newIR: TemplateIR ): SwapReport {
      const changes: SwapChange[] = []
      renderer = new IRRenderer( newIR, options, hooks )
      current = renderer.swapBlock( current, newIR.root, changes, 'root' )
      return { changes }
    },
    dispose(){
      destroy( current )
      try {
        attached && typeof self.onDetach === 'function' && self.onDetach()
        typeof self.onDestroy === 'function' && self.onDestroy()
      }
      catch( error ){ hooks.onError( error ) }
    }
  }
}
