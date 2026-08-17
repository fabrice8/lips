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
import type { StyleIR } from './style'
import { sameBinds, sameChild, sameLets } from './swap'

// ------------------------------------------------------------------- types
export interface IRComponentDef {
  ir: TemplateIR
  state?: Record<string, any>
  statics?: Record<string, any>
  /** Context fields this component subscribes to (fires onContext) */
  context?: string[]
  /** Compiled stylesheet (RFC-004) + scope name (the `rel` value) */
  stylesheet?: StyleIR
  nsp?: string
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
  /**
   * Resolve a plain template object (e.g. a route's `template`)
   * into a component definition — the host owns compilation and
   * caching. Enables `<{state.page}/>` with template objects.
   */
  resolveTemplate?( value: any ): IRComponentDef | undefined
  /** Extra members merged onto every component's self (e.g. setContext) */
  expose?: Record<string, any>
  /**
   * Host-provided stylesheet injector (full build wires Stylis; the
   * precompiled `./runtime` build omits it). Returns a handle whose
   * `clear()` releases one reference.
   */
  createStylesheet?( nsp: string, css: string ): { clear(): void }
  /**
   * i18n plugin hook (RFC §6). Every call must READ a language signal
   * so translated binds re-run on language change — including `lang()`,
   * which is what makes `<span text=self.lang>` live.
   *
   * `key` is a STABLE translation id (RFC-005 §3): given one, the
   * dictionary is consulted for it first and `text` is only the
   * fallback wording. `lang` overrides the active language for one
   * call — how `<i18n lang=…>` translates its subtree.
   */
  i18n?: {
    translate( text: string, key?: string, lang?: string ): string
    format( reference: string, params: any, lang?: string ): string
    /** Active language, read reactively */
    lang(): string
  }
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
  /** Compiled stylesheet (RFC-004) + scope name (the `rel` value) */
  stylesheet?: StyleIR
  nsp?: string
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

/**
 * A live component instance, tracked so a swap can re-home it
 * instead of destroying and recreating it (RFC-002 §salvage).
 *
 * `gen` is the ownership token: whoever wired the instance captures
 * the current value, and only a holder of the current token may tear
 * it down. Releasing a component into a salvage pass bumps `gen`, so
 * the old parent's disposal walks straight past it.
 */
interface LiveComp {
  name: string
  /** Explicit `key` input — identity across revisions, when given */
  key: any
  self: any
  input: Record<string, any>
  inst: BlockInstance
  /** Anchor of the child that currently owns it */
  anchor: Comment
  /** Parent-side wiring: input effects + event listeners */
  wiring: ( () => void )[]
  gen: number
  claimed: boolean
  teardown(): void
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

/**
 * `entry.fn()` runs `onAttach`, and an `onAttach` may RENDER — that is
 * exactly what `<router>` does when it navigates on attach. Rendering
 * appends new entries here, and rendering under an already-live parent
 * re-enters this function, so the array mutates arbitrarily mid-pass.
 *
 * Walking it by index is unsound in both directions:
 *  - an index outlives a shrunken array → `PENDING_ATTACH[i]` is
 *    undefined and the flush throws
 *  - entries appended during the pass sit below the descending index →
 *    their `onAttach` silently never fires
 *
 * So drain by IDENTITY over a snapshot, and repeat while a pass settles
 * anything. Reverse order is preserved: a component pushes after the
 * children rendered inside it, so walking back attaches parents first.
 */
function flushAttach(){
  let progressed = true

  while( progressed ){
    progressed = false

    for( const entry of [ ...PENDING_ATTACH ].reverse() ){
      const node = entry.node()
      if( !node || !node.isConnected ) continue

      // A re-entrant pass may have claimed it already
      const at = PENDING_ATTACH.indexOf( entry )
      if( at < 0 ) continue

      PENDING_ATTACH.splice( at, 1 )
      entry.fn()
      progressed = true
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
/**
 * Does `n` sit between two markers in document order? Position, not
 * ancestry — a component nested deep in the skeleton's markup still
 * counts, which is what makes a region-wide sweep possible. Nodes in
 * another tree compare as disconnected, so both bits fail.
 */
const within = ( from: Node, to: Node, n: Node ) =>
  n === from // a child's own component is anchored on the marker itself
  || ( !!( from.compareDocumentPosition( n ) & 4 /* FOLLOWING */ )
       && !!( to.compareDocumentPosition( n ) & 2 /* PRECEDING */ ) )

/**
 * Hand a live component to a salvage pass: its old owner loses the
 * right to destroy it, and its nodes are parked in a fragment. The
 * parking matters — an enclosing block that disposes before the
 * adoption runs would otherwise sweep those nodes out of the DOM
 * along with its own range.
 */
function release( rec: LiveComp ){
  rec.gen++
  for( const d of rec.wiring ) d()
  rec.wiring = []
  document.createDocumentFragment().append( ...nodesOf( rec.inst ) as ChildNode[] )
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

/**
 * Scoped stylesheet: stamp `rel="<nsp>"` on the component's top-level
 * element roots so the injected `[rel="<nsp>"] { … }` sheet matches,
 * then inject via the host factory. The `!rel` guard lets an inner
 * component's scope win on a shared root. Returns a clear disposer.
 */
function stampScope( inst: BlockInstance, nsp: string ){
  for( const n of nodesOf( inst ) )
    if( n.nodeType === 1 /* ELEMENT_NODE */ && !( n as Element ).hasAttribute('rel') )
      ( n as Element ).setAttribute('rel', nsp )
}

/** The element roots a scoped sheet matches, and its variables live on */
function scopeRoots( inst: BlockInstance ){
  return nodesOf( inst ).filter( n => n.nodeType === 1 ) as HTMLElement[]
}

/**
 * RFC-004 §8 — write a reactive declaration's custom property on the
 * scope roots. Every element the sheet matches is a root or a descendant,
 * and custom properties inherit (an inline one applying to the element
 * itself as well), so one write per root covers every match.
 *
 * A nullish value REMOVES the property rather than blanking it, so the
 * declaration falls through to an ancestor's value — that is what makes
 * "use mine if given, otherwise inherit" free (RFC-004 §7.3, §12.2).
 */
function writeStyleVar( roots: HTMLElement[], prop: string, value: any ){
  for( const root of roots )
    value === null || value === undefined || value === false
      ? root.style.removeProperty( prop )
      : root.style.setProperty( prop, String( value ) )
}

function applyScopedStyles(
  options: RuntimeOptions,
  inst: BlockInstance,
  nsp: string,
  style: StyleIR
): ( () => void ) | undefined {
  stampScope( inst, nsp )

  const sheet = style.css ? options.createStylesheet?.( nsp, style.css ) : undefined
  return sheet ? () => sheet.clear() : undefined
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
  constructor(
    readonly ir: TemplateIR,
    private options: RuntimeOptions,
    private hooks?: ComponentHooks,
    /**
     * Components alive under this renderer. A swap builds a new
     * renderer over the new IR and inherits this array, so the
     * instances outlive the IR that first rendered them.
     */
    readonly live: LiveComp[] = []
  ){}

  /** Records offered to the render pass currently running, if any */
  private pool: LiveComp[] | null = null
  /** Names salvaged during this renderer's lifetime (read by swap) */
  readonly salvaged: string[] = []

  /**
   * Render with `records` offered for adoption. Whatever nobody
   * claims is destroyed for real once the pass ends — so a component
   * the revision dropped still runs its teardown.
   */
  private withSalvage<T>( records: LiveComp[], fn: () => T ): T {
    const prev = this.pool
    this.pool = records
    try { return fn() }
    finally {
      this.pool = prev
      for( const r of records ) !r.claimed && r.teardown()
    }
  }

  /**
   * Take the record belonging to this call site. An explicit `key`
   * is identity; without one, position among same-name components
   * decides — the rule keyless JSX lists already follow.
   */
  private claim( name: string, key: any ): LiveComp | undefined {
    const rec = this.pool?.find( r => !r.claimed && r.name === name && r.key === key )
    if( !rec ) return

    rec.claimed = true
    this.salvaged.push( name )
    return rec
  }

  /** The `key` input, evaluated off the dependency graph */
  private keyOf( inputs: Record<string, CompInput>, benv: RunEnv, scopeNames: string[] ){
    const ci = inputs.key
    return ci === undefined
      ? undefined
      : 'lit' in ci ? ci.lit : untrack( () => this.runner( ci.e, scopeNames )( benv ) )
  }

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

  /**
   * RFC-004 §8 — wire a compiled stylesheet's reactive declarations.
   * These are ordinary binds: same guarded() effect, same dispose handle,
   * same onError boundary. No parallel reactive system.
   *
   * Roots are captured here, so a rebuild must re-bind (see swap()).
   */
  bindStyle( style: StyleIR, inst: BlockInstance, env: RunEnv ): () => void {
    if( !style.binds.length ) return () => {}

    const
    roots = scopeRoots( inst ),
    handles = style.binds.map( b => {
      const run = this.srcRunner( style.exprs[ b.e ], [] )
      return this.guarded( () => writeStyleVar( roots, b.prop, run( env ) ) )
    })

    return () => { for( const h of handles ) h.dispose() }
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
        const i18n = bind.i18n ? this.options.i18n : undefined
        const h = this.guarded( () => {
          const v = run( benv )
          const text = v == null ? '' : String( v )
          textNode.data = i18n ? i18n.translate( text, bind.ik, benv.lang?.() ) : text
        })
        return { bind, node, textNode, dispose: h.dispose }
      }
      case 'attr': {
        const run = this.runner( bind.e, scopeNames )
        const i18n = bind.i18n ? this.options.i18n : undefined
        const h = this.guarded( () => {
          const v = run( benv )
          applyAttr( node as Element, bind.name,
            i18n && v != null ? i18n.translate( String( v ), bind.ik, benv.lang?.() ) : v )
        })
        return { bind, node, dispose: h.dispose }
      }
      case 'prop': {
        const run = this.runner( bind.e, scopeNames )

        if( bind.name === 'format' ){
          const ref = bind.ref || ''
          const h = this.guarded( () => {
            const params = run( benv )
            const text = this.options.i18n?.format( ref, params, benv.lang?.() )
            ;( node as Element ).textContent = text == null ? '' : String( text )
          })
          return { bind, node, dispose: h.dispose }
        }

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

      /**
       * Components this child rendered survive its re-execution.
       * The sweep spans the child's whole region, not just its own
       * anchor: a custom tag like `<mblock>` is itself a child, and
       * everything the template puts inside it lives under there.
       */
      const records = this.live.filter( r =>
        within( oldH.anchor, inst.childHandles[ i + 1 ]?.anchor ?? inst.end, r.anchor ) )
      for( const r of records ) release( r )

      oldH?.dispose()
      inst.childHandles[ i ] = {
        child: newChild, exprs: this.ir.exprs, anchor: oldH.anchor,
        dispose: this.withSalvage( records,
          () => this.execBlock( newChild, oldH.anchor, inst.benv, newBlock.scope ) )
      }
      report.push({ kind: 'block', path: `${path}/${i}` })
    }

    inst.block = newBlock
    inst.exprs = this.ir.exprs
    return inst
  }

  private rebuild( inst: BlockInstance, newBlock: BlockIR, report: SwapChange[], path: string ): BlockInstance {
    /**
     * Salvage: every component living in the region about to be
     * rebuilt is released from it first and offered to the fresh
     * render. What the revision still wants keeps its state and its
     * DOM subtree; what it dropped is destroyed by `withSalvage`.
     */
    const records = this.live.filter( r => within( inst.start, inst.end, r.anchor ) )
    for( const r of records ) release( r )

    const fresh = this.withSalvage( records, () => this.renderBlock( newBlock, inst.penv ) )

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
         *
         * `sets` apply in SOURCE ORDER — spreads (`...each`) and
         * explicit attrs override each other left to right, JS
         * object-literal style.
         */
        const scope = Object.create( benv.scope ?? null )
        const args = reactive( {} as Record<string, any> )

        // One signal per declared argv (undeclared → stays undefined)
        const argSignals: Record<string, ReturnType<typeof signal<any>>> = {}
        for( const name of child.args ){
          argSignals[ name ] = signal<any>( undefined )
          defineGetter( scope, name, argSignals[ name ][0] )
        }

        type SetRunner =
          | { kind: 'spread', run: ( env: RunEnv ) => any }
          | { kind: 'value', name: string, value: () => any }

        const runners: SetRunner[] = child.sets.map( s => {
          if( 'spread' in s )
            return { kind: 'spread', run: this.runner( s.spread, scopeNames ) }

          if( 'lit' in s.ci ){
            const lit = s.ci.lit
            return { kind: 'value', name: s.name, value: () => lit }
          }

          const run = this.runner( s.ci.e, scopeNames )
          return { kind: 'value', name: s.name, value: () => run( benv ) }
        })

        let prevKeys = new Set<string>()

        disposers.push( effect( () => {
          // Evaluate every set in order into one flat view
          const next: Record<string, any> = {}

          for( const r of runners ){
            if( r.kind === 'spread' ){
              const obj = r.run( benv )
              if( obj && typeof obj === 'object' )
                for( const [ k, v ] of ( obj instanceof Map ? obj : Object.entries( obj ) ) )
                  next[ k ] = v
            }
            else next[ r.name ] = r.value()
          }

          untrack( () => {
            // Feed declared argv signals (Object.is skips no-ops)
            for( const name of child.args )
              argSignals[ name ][1]( next[ name ] )

            // Mirror everything into `arguments`; drop vanished keys
            const nextKeys = new Set( Object.keys( next ) )
            for( const k of prevKeys ) !nextKeys.has( k ) && delete args[ k ]
            for( const k of nextKeys ) args[ k ] = next[ k ]
            prevKeys = nextKeys
          })
        }).dispose )

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

      /**
       * Scoped context / scoped language (RFC-005 §4).
       *
       * The layer is a plain object whose PROTOTYPE is the enclosing
       * context, with one reactive getter per provided key. That single
       * choice buys the whole feature:
       *
       *  - a read of a provided key hits the own getter and tracks the
       *    layer's signal;
       *  - a read of anything else walks the chain into the global
       *    reactive store and tracks THERE, so unprovided keys stay live;
       *  - `Object.create` costs nothing per read, so a component under
       *    a provider pays no lookup penalty.
       *
       * Nesting composes for free — an inner `<context>` prototypes off
       * the outer layer, so the nearest provider wins.
       */
      case 'provide': {
        const ctx = Object.create( benv.context ?? null )

        for( const [ name, input ] of Object.entries( child.vars ) ){
          if( 'lit' in input ){
            const [ get ] = signal( input.lit )
            defineGetter( ctx, name, get )
            continue
          }
          const [ get, set ] = signal<any>( undefined )
          defineGetter( ctx, name, get )
          const run = this.runner( input.e, scopeNames )
          disposers.push( effect( () => set( run( benv ) ) ).dispose )
        }

        /**
         * The scoped language rides on the env rather than on the
         * context object: it is framework state, not a user-space key,
         * so `<i18n lang=…>` must not collide with a `context.lang` the
         * app happens to own.
         */
        let lang = benv.lang
        if( child.lang ){
          if( 'lit' in child.lang ){
            const v = String( child.lang.lit )
            lang = () => v
          }
          else {
            const [ get, set ] = signal<any>( undefined )
            const run = this.runner( child.lang.e, scopeNames )
            disposers.push( effect( () => set( run( benv ) ) ).dispose )
            // Nullish falls back to the enclosing language, not to ''
            lang = () => get() ?? benv.lang?.()
          }
        }

        const inner = this.renderBlock( child.block, { ...benv, context: ctx, lang })
        insertAfter( anchor, nodesOf( inner ) )
        disposers.push( () => destroy( inner ) )
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
          ? this.execComponent( def, child, anchor, benv, scopeNames, disposers, child.name )
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

            /**
             * Component name, a ready IRComponentDef, or a plain
             * template object resolved through the host hook.
             */
            const def = typeof verb === 'string'
              ? this.options.components?.[ verb ]
              : verb && typeof verb === 'object'
                ? ( verb.ir ? verb as IRComponentDef : this.options.resolveTemplate?.( verb ) )
                : undefined

            if( def ) this.execComponent( def, child, anchor, benv, scopeNames, inner,
              typeof verb === 'string' ? verb : '#dynamic' )
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

      /** Sets iterate like arrays: [ value, index ] */
      if( src instanceof Set )
        return [ ...src ].map( ( item, i ) => ({ key: keyFor( item, item, i ), values: [ item, i ] }) )

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

  // ------------------------------------------------------- component wiring
  /**
   * Parent-side input wiring: call-site expressions write into the
   * component's reactive `input`. Kept separate from creation so an
   * adopted instance can be re-wired to a new call site.
   * `written` collects the keys this call site supplies.
   */
  private wireInputs(
    child: { inputs: Record<string, CompInput>, spreads: E[] },
    benv: RunEnv,
    scopeNames: string[],
    input: Record<string, any>,
    wiring: ( () => void )[],
    written?: Set<string>
  ){
    for( const [ name, ci ] of Object.entries( child.inputs ) ){
      written?.add( name )

      if( 'lit' in ci ) input[ name ] = ci.lit
      else {
        const run = this.runner( ci.e, scopeNames )
        wiring.push( effect( () => input[ name ] = run( benv ) ).dispose )
      }
    }
    for( const e of child.spreads ){
      const run = this.runner( e, scopeNames )
      wiring.push( effect( () => {
        const obj = run( benv ) || {}
        untrack( () => Object.entries( obj ).forEach( ( [ k, v ] ) => {
          written?.add( k )
          input[ k ] = v
        }) )
      }).dispose )
    }
  }

  /** Parent `on-*( … )` instructions → listeners on the child's bus */
  private wireEvents(
    events: { name: string, e: E }[] | undefined,
    benv: RunEnv,
    scopeNames: string[],
    self: any,
    wiring: ( () => void )[]
  ){
    events?.forEach( ev => {
      const dispatch = this.eventDispatcher( this.ir.exprs[ ev.e ], scopeNames, benv )
      self.on( ev.name, dispatch )
      wiring.push( () => self.off( ev.name, dispatch ) )
    })
  }

  /**
   * Slotted body → `input.renderer` (old-engine convention):
   * the child template places it with `<{input.renderer}/>`.
   * Content renders in the PARENT scope — a slot closes over
   * where it was written, not where it is placed.
   */
  private slotRenderer( contents: ArmIR, penv: RunEnv ): SlotRenderer {
    const parent = this

    return {
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

  /**
   * Re-home a salvaged instance: same state, same DOM, same handlers
   * — only the parent-side wiring is rebuilt, against the new call
   * site and the new expression table. No lifecycle hook fires: from
   * the component's point of view nothing happened.
   */
  private adoptComponent(
    rec: LiveComp,
    child: { inputs: Record<string, CompInput>, spreads: E[], events?: { name: string, e: E }[], contents?: ArmIR },
    anchor: Comment,
    benv: RunEnv,
    scopeNames: string[],
    disposers: ( () => void )[]
  ){
    const
    wiring: ( () => void )[] = [],
    written = new Set<string>()

    this.wireInputs( child, benv, scopeNames, rec.input, wiring, written )

    if( child.contents ){
      rec.input.renderer = this.slotRenderer( child.contents, benv )
      written.add('renderer')
    }
    // Inputs the revision dropped must not linger on the instance
    for( const k of Object.keys( rec.input ) )
      !written.has( k ) && delete rec.input[ k ]

    this.wireEvents( child.events, benv, scopeNames, rec.self, wiring )

    rec.wiring = wiring
    rec.anchor = anchor

    const gen = rec.gen
    insertAfter( anchor, nodesOf( rec.inst ) )

    disposers.push( () => {
      if( gen !== rec.gen ) return // salvaged away; wiring already released

      for( const d of rec.wiring ) d()
      rec.wiring = []
      rec.teardown()
    })
  }

  /** Registered component: reactive inputs, slots, events, own env */
  private execComponent(
    def: IRComponentDef,
    child: { inputs: Record<string, CompInput>, spreads: E[], events?: { name: string, e: E }[], contents?: ArmIR },
    anchor: Comment,
    benv: RunEnv,
    scopeNames: string[],
    disposers: ( () => void )[],
    cname: string
  ){
    /**
     * A live instance released by a swap is re-homed here rather
     * than rebuilt from scratch. Only ever true mid-swap, so a
     * normal render pays nothing for it.
     */
    const salvaged = this.pool?.length
      ? this.claim( cname, this.keyOf( child.inputs, benv, scopeNames ) )
      : undefined

    if( salvaged )
      return this.adoptComponent( salvaged, child, anchor, benv, scopeNames, disposers )

    const
    input = reactive( {} as Record<string, any> ),
    wiring: ( () => void )[] = []

    this.wireInputs( child, benv, scopeNames, input, wiring )
    if( child.contents ) input.renderer = this.slotRenderer( child.contents, benv )

    const state = reactive( { ...( def.state || {} ) }, def.deep ?? false )

    /**
     * Component event bus: the child emits, the parent's
     * `on-*( … )` instructions receive the emitted arguments.
     */
    const listeners = new Map<string, ( ( ...args: any[] ) => void )[]>()
    /** Set once the block renders — backs `self.node` */
    let selfInst: BlockInstance | null = null

    // `this` inside the self literal's getters is the literal, not the renderer
    const irr = this

    const self: any = {
      ...( this.options.expose || {} ),
      state, input, static: def.statics, context: benv.context,
      /**
       * Active language for THIS component — the scoped one when it sits
       * under `<i18n lang=…>`, the global one otherwise. A getter, so a
       * bind that reads `self.lang` subscribes to the language signal and
       * re-renders on `setLanguage()`. Without it there is no way to show
       * the current language, which is what pushed apps into mirroring it
       * into context by hand (RFC-005 §2).
       */
      get lang(){ return benv.lang?.() ?? irr.options.i18n?.lang() ?? '' },
      /**
       * Live element nodes of this component — the handle external
       * controls (drag/resize/sort) bind to. Elements only: comment
       * boundaries are an implementation detail.
       */
      get node(){
        return selfInst
          ? nodesOf( selfInst ).filter( n => n.nodeType === 1 ) as Element[]
          : []
      },
      emit( event: string, ...args: any[] ){
        listeners.get( event )?.forEach( fn => fn( ...args ) )
      },
      on( event: string, fn: ( ...args: any[] ) => void ){
        listeners.set( event, [ ...( listeners.get( event ) || [] ), fn ])
        return self
      },
      once( event: string, fn: ( ...args: any[] ) => void ){
        const wrapped = ( ...args: any[] ) => {
          self.off( event, wrapped )
          fn( ...args )
        }
        return self.on( event, wrapped )
      },
      off( event: string, fn?: ( ...args: any[] ) => void ){
        if( !fn ) listeners.delete( event )
        else {
          const rest = ( listeners.get( event ) || [] ).filter( f => f !== fn )
          rest.length ? listeners.set( event, rest ) : listeners.delete( event )
        }
        return self
      }
    }
    def.handlers && Object.entries( def.handlers ).forEach( ( [ k, fn ] ) => self[ k ] = fn.bind( self ) )

    this.wireEvents( child.events, benv, scopeNames, self, wiring )

    const hooks = makeHooks( self )

    // Lifecycle: creation → (initial input) → render → mount → attach
    try { typeof self.onCreate === 'function' && self.onCreate() }
    catch( error ){ hooks.onError( error ) }

    // Handlers receive the input object (Modela: onInput({ host, settings }))
    try { Object.keys( input ).length && typeof self.onInput === 'function' && self.onInput( input ) }
    catch( error ){ hooks.onError( error ) }

    /**
     * `context` and `lang` are INHERITED from the call site, not reset:
     * a component placed inside `<context …>` or `<i18n lang=…>` renders
     * under that layer. `scope` is not — a component is a fresh
     * expression scope, unlike a block.
     */
    const cenv: RunEnv = {
      state, input, context: benv.context, lang: benv.lang,
      static: def.statics, self, scope: undefined
    }
    const renderer = new IRRenderer( def.ir, this.options, hooks )
    const inst = renderer.renderBlock( def.ir.root, cenv )
    selfInst = inst // backs self.node

    /**
     * Scoped stylesheet — stamp `rel` and write the reactive declarations'
     * variables BEFORE the nodes go live, or the first paint resolves
     * `var()` against nothing (RFC-004 §8).
     */
    const
    clearStyles = def.stylesheet
      ? applyScopedStyles( this.options, inst, def.stylesheet.nsp || def.nsp || 'lips', def.stylesheet )
      : undefined,
    clearStyleBinds = def.stylesheet
      ? renderer.bindStyle( def.stylesheet, inst, cenv )
      : undefined

    insertAfter( anchor, nodesOf( inst ) )
    hooks.ready()

    try {
      typeof self.onMount === 'function' && self.onMount()
      typeof self.onRender === 'function' && self.onRender()
      self.emit('component:mount')
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

    /**
     * Attachment is always tracked (not only when onAttach is
     * defined): external controls subscribe via the event bus with
     * `self.on('component:attached', …)`.
     */
    let attached = false
    {
      PENDING_ATTACH.push({
        node: () => inst.start,
        fn: () => {
          attached = true
          try {
            typeof self.onAttach === 'function' && self.onAttach()
            self.emit('component:attached')
          }
          catch( error ){ hooks.onError( error ) }
        }
      })
      // Parent already live → attach now
      inst.start.isConnected && flushAttach()
    }

    /**
     * The instance is now tracked for salvage. `teardown` is the one
     * real destruction path — idempotent, because an unclaimed
     * record and its old owner may both reach for it.
     */
    let torn = false
    const rec: LiveComp = {
      name: cname,
      key: input.key, // already wired — no second evaluation
      self, input, inst, anchor, wiring,
      gen: 0,
      claimed: false,
      teardown: () => {
        if( torn ) return
        torn = true

        const i = this.live.indexOf( rec )
        i > -1 && this.live.splice( i, 1 )

        unwatchContext?.()
        clearStyleBinds?.()
        clearStyles?.()
        destroy( inst )
        try {
          if( attached ){
            typeof self.onDetach === 'function' && self.onDetach()
            self.emit('component:detached')
          }
          typeof self.onDestroy === 'function' && self.onDestroy()
          self.emit('component:destroy')
        }
        catch( error ){ hooks.onError( error ) }
      }
    }
    this.live.push( rec )

    const gen = rec.gen
    disposers.push( () => {
      if( gen !== rec.gen ) return // salvaged away; wiring already released

      for( const d of rec.wiring ) d()
      rec.wiring = []
      rec.teardown()
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
  listeners = new Map<string, ( ( ...args: any[] ) => void )[]>()

  /** Set after the first render — backs `self.node` */
  let rootInst: BlockInstance | null = null

  const self: any = {
    state, input, static: setup.static,
    /** Active language, read reactively — see the nested-component note */
    get lang(){ return options.i18n?.lang() ?? '' },
    /** Live element nodes — the handle external controls bind to */
    get node(){
      return rootInst
        ? nodesOf( rootInst ).filter( n => n.nodeType === 1 ) as Element[]
        : []
    },
    emit( event: string, ...args: any[] ){
      listeners.get( event )?.forEach( fn => fn( ...args ) )
    },
    /** Always the runtime-local bus — a host `emit` chains into it */
    emitLocal( event: string, ...args: any[] ){
      listeners.get( event )?.forEach( fn => fn( ...args ) )
    },
    on( event: string, fn: ( ...args: any[] ) => void ){
      listeners.set( event, [ ...( listeners.get( event ) || [] ), fn ])
      return self
    },
    once( event: string, fn: ( ...args: any[] ) => void ){
      const wrapped = ( ...args: any[] ) => {
        self.off( event, wrapped )
        fn( ...args )
      }
      return self.on( event, wrapped )
    },
    off( event: string, fn?: ( ...args: any[] ) => void ){
      if( !fn ) listeners.delete( event )
      else {
        const rest = ( listeners.get( event ) || [] ).filter( f => f !== fn )
        rest.length ? listeners.set( event, rest ) : listeners.delete( event )
      }
      return self
    },
    /**
     * `options.expose` is what every NESTED component self gets
     * (setContext, setLanguage). The root is a component too, so it
     * gets the same — otherwise `self.setLanguage(…)` would work
     * everywhere except the top of the tree.
     */
    ...( options.expose || {} ),
    // Host-provided members (e.g. the facade's emit → Events) win
    ...( setup.expose || {} )
  }

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

  try { input && Object.keys( input ).length && typeof self.onInput === 'function' && self.onInput( input ) }
  catch( error ){ hooks.onError( error ) }

  let renderer = new IRRenderer( ir, options, hooks )
  let current = renderer.renderBlock( ir.root, env )
  rootInst = current // backs self.node
  hooks.ready()

  // Scoped stylesheet for the root component
  const clearStyles = setup.stylesheet
    ? applyScopedStyles( options, current, setup.stylesheet.nsp || setup.nsp || 'lips', setup.stylesheet )
    : undefined

  /**
   * Style binds capture the scope roots, so a swap that rebuilds the root
   * has to re-bind against the fresh ones.
   */
  let clearStyleBinds = setup.stylesheet
    ? renderer.bindStyle( setup.stylesheet, current, env )
    : undefined

  try {
    typeof self.onMount === 'function' && self.onMount()
    typeof self.onRender === 'function' && self.onRender()
  }
  catch( error ){ hooks.onError( error ) }

  let attached = false
  const attachSelf = () => {
    if( attached ) return
    attached = true
    try {
      typeof self.onAttach === 'function' && self.onAttach()
      self.emit('component:attached')
    }
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
      const
      changes: SwapChange[] = [],
      /**
       * Salvaged nodes are detached and re-inserted, which drops
       * focus. The element survives the move, so put the caret back
       * where the user left it.
       */
      focused = document.activeElement as HTMLElement | null

      // The new renderer inherits the live components: they outlive the IR
      renderer = new IRRenderer( newIR, options, hooks, renderer.live )
      current = renderer.swapBlock( current, newIR.root, changes, 'root' )
      rootInst = current // a rebuild replaces the instance

      /**
       * A rebuild produces fresh element roots, which arrive without
       * the `rel` the scoped sheet selects on — re-stamp them, or the
       * component silently loses its styles on the first revision.
       */
      if( setup.stylesheet ){
        stampScope( current, setup.stylesheet.nsp || setup.nsp || 'lips' )
        clearStyleBinds?.()
        clearStyleBinds = renderer.bindStyle( setup.stylesheet, current, env )
      }

      focused && focused.isConnected && focused !== document.activeElement && focused.focus()

      return { changes, salvaged: renderer.salvaged }
    },
    dispose(){
      clearStyleBinds?.()
      clearStyles?.()
      destroy( current )
      try {
        if( attached ){
          typeof self.onDetach === 'function' && self.onDetach()
          self.emit('component:detached')
        }
        typeof self.onDestroy === 'function' && self.onDestroy()
      }
      catch( error ){ hooks.onError( error ) }
    }
  }
}
