/**
 * An in-memory host (RFC-006 §4.1): the IR runtime over plain objects,
 * with no DOM anywhere.
 *
 * What it is for:
 *  - proving the seam: the host spec renders the same IR through this
 *    and through the DOM and requires identical trees
 *  - the shape a native binding starts from: a background-thread Lynx
 *    host keeps exactly this kind of shadow tree, because the runtime
 *    walks siblings synchronously and the real elements live on another
 *    thread
 *  - rendering where there is no document (tests, servers)
 *
 * Skeletons are built from `BlockIR.nodes`, so the IR must be compiled
 * with `{ target: 'tree' }`.
 *
 *   const root = treeRoot()
 *   renderIR( compileTemplate( src, { target: 'tree' } ).ir, setup, { host: treeHost } ).mount( root )
 */

import type { BlockIR, NodeIR } from './compiler'
import type { Host } from './host'

export interface TreeNode {
  /** Element tag, or '#text' | '#marker' | '#fragment' | '#root' */
  type: string
  /** A text run's value, a marker's label */
  value: string
  attrs: Record<string, string>
  /** Inline custom properties (RFC-004 §8) */
  vars: Record<string, string>
  /** The stylesheet scope `Host.scope` assigned — recorded, not styled */
  scope?: string
  listeners: Record<string, Set<( event: any ) => void>>
  parent: TreeNode | null
  first: TreeNode | null
  last: TreeNode | null
  prev: TreeNode | null
  next: TreeNode | null
}

/** A fresh, unattached node — also the base of the Lynx background host's nodes */
export const treeNode = ( type: string, value = '' ): TreeNode => ({
  type, value,
  attrs: {}, vars: {}, listeners: {},
  parent: null, first: null, last: null, prev: null, next: null
})

const isElement = ( n: TreeNode ) => n.type[ 0 ] !== '#'

export function unlink( n: TreeNode ){
  const p = n.parent
  if( !p ) return

  n.prev ? n.prev.next = n.next : p.first = n.next
  n.next ? n.next.prev = n.prev : p.last = n.prev
  n.parent = n.prev = n.next = null
}

/** DOM `insertBefore`: the node leaves wherever it was first */
export function link( parent: TreeNode, n: TreeNode, ref: TreeNode | null ){
  unlink( n )
  n.parent = parent

  if( ref ){
    n.prev = ref.prev
    n.next = ref
    ref.prev ? ref.prev.next = n : parent.first = n
    ref.prev = n
  }
  else {
    n.prev = parent.last
    parent.last ? parent.last.next = n : parent.first = n
    parent.last = n
  }
}

function build( n: NodeIR ): TreeNode {
  if( typeof n === 'string' ) return treeNode( '#text', n )
  if( n === 0 ) return treeNode( '#marker', '$' )

  const [ tag, attrs, children ] = n
  const el = treeNode( tag )
  attrs && Object.assign( el.attrs, attrs )
  children?.forEach( c => link( el, build( c ), null ) )
  return el
}

/** Root to path, inclusive */
function chain( n: TreeNode | null ){
  const out: TreeNode[] = []
  for( ; n; n = n.parent ) out.unshift( n )
  return out
}

export const treeHost: Host<TreeNode> = {
  clone( block: BlockIR ){
    if( !block.nodes )
      throw new Error(`[lips] this IR has no node tree: compile it with { target: 'tree' } to render on a tree host`)

    const frag = treeNode('#fragment')
    for( const n of block.nodes ) link( frag, build( n ), null )
    return frag
  },
  fragment: () => treeNode('#fragment'),
  element: tag => treeNode( tag ),
  text: value => treeNode( '#text', value ),
  marker: label => treeNode( '#marker', label ),

  child( parent, index ){
    let n = parent.first
    while( n && index-- ) n = n.next
    return n!
  },
  next: n => n.next,
  range( first, last ){
    const out: TreeNode[] = []
    for( let n: TreeNode | null = first; n; n = n.next ){
      out.push( n )
      if( n === last ) break
    }
    return out
  },
  insert: link,
  insertAfter( ref, nodes ){
    const parent = ref.parent
    if( !parent ) return
    let anchor = ref
    for( const n of nodes ){
      link( parent, n, anchor.next )
      anchor = n
    }
  },
  remove: unlink,
  isElement,
  connected: n => chain( n )[ 0 ].type === '#root',
  /**
   * Tree order: an ancestor precedes its descendants, and at the first
   * divergence the earlier sibling wins. Nodes in different trees are
   * unordered, so the answer is false either way round.
   */
  precedes( a, b ){
    if( a === b ) return false

    const ca = chain( a ), cb = chain( b )
    if( ca[ 0 ] !== cb[ 0 ] ) return false

    let i = 0
    while( i < ca.length && i < cb.length && ca[ i ] === cb[ i ] ) i++

    if( i === ca.length ) return true   // a contains b
    if( i === cb.length ) return false  // b contains a

    for( let n = ca[ i ].next; n; n = n.next )
      if( n === cb[ i ] ) return true
    return false
  },

  setText: ( n, value ) => { n.value = value },
  content( el, value ){
    while( el.first ) unlink( el.first )
    value && link( el, treeNode( '#text', value ), null )
  },
  attr: ( el, name, value ) => { value === null ? delete el.attrs[ name ] : el.attrs[ name ] = value },
  styleVar: ( el, prop, value ) => { value === null ? delete el.vars[ prop ] : el.vars[ prop ] = value },
  scope: ( el, nsp ) => { el.scope ??= nsp },
  listen( el, name, fn ){
    ( el.listeners[ name ] ??= new Set() ).add( fn )
    return () => { el.listeners[ name ]?.delete( fn ) }
  }
}

/** A live root to mount into: what is under it counts as connected */
export const treeRoot = () => treeNode('#root')

export function childrenOf( n: TreeNode ){
  const out: TreeNode[] = []
  for( let c = n.first; c; c = c.next ) out.push( c )
  return out
}

/**
 * Fire an element's own listeners — what a tap would do. No bubbling:
 * the runtime attaches every listener to the element that declares it.
 */
export function dispatch( el: TreeNode, name: string, event: any = { type: name, target: el } ){
  for( const fn of [ ...( el.listeners[ name ] || [] ) ] ) fn( event )
}
