/**
 * The host seam (RFC-006 §4.1).
 *
 * The IR runtime never touches a node itself. It creates, places, walks
 * and mutates nodes through a `Host`, so one runtime drives the DOM, an
 * in-memory tree (`./tree`) or a native element API. The node type is
 * the host's own and opaque to the runtime.
 *
 * What a host must provide is what the runtime actually does with
 * nodes, no more:
 *
 *  - instantiate a block's skeleton (`clone`), and create the few nodes
 *    the runtime adds itself: markers, text runs, unresolved elements
 *  - a sibling-linked tree with parents: block instances are ranges
 *    between two markers, walked and moved whole (`range`, `insertAfter`)
 *  - attributes, text, inline custom properties, listeners
 *  - two host decisions: how a stylesheet scope marks an element
 *    (`rel` here, a class on Lynx) and whether markup can be parsed
 *    (`html` is optional — the `'tree'` compile target rejects `@html`)
 *
 * Stylesheet injection is not here: it already reaches the runtime as
 * `RuntimeOptions.createStylesheet`, supplied by the facade.
 */

import type { BlockIR } from './compiler'

export interface Host<N = any> {
  /** A detached container holding a fresh copy of the block's skeleton */
  clone( block: BlockIR ): N
  /** An empty detached container */
  fragment(): N
  element( tag: string ): N
  text( value: string ): N
  /** An invisible node: block boundaries and control-flow anchors */
  marker( label: string ): N

  /** The child at `index` — skeleton paths are child-index walks */
  child( parent: N, index: number ): N
  next( node: N ): N | null
  /** `first`, its following siblings, up to and including `last` */
  range( first: N, last: N ): N[]
  /** Insert `node` before `ref`, or at the end when `ref` is null */
  insert( parent: N, node: N, ref: N | null ): void
  /** Place `nodes`, in order, right after `ref` — nothing when `ref` has no parent */
  insertAfter( ref: N, nodes: N[] ): void
  remove( node: N ): void
  isElement( node: N ): boolean
  /** In the live tree — what `onAttach` waits for */
  connected( node: N ): boolean
  /** `a` comes before `b` in tree order; false when they share no tree */
  precedes( a: N, b: N ): boolean

  /** A text node's value — the hot path of every text bind */
  setText( node: N, value: string ): void
  /** Replace an element's children with one text run (`@text`, `@format`) */
  content( el: N, value: string ): void
  /** `null` removes the attribute */
  attr( el: N, name: string, value: string | null ): void
  /** Replace the element's children with parsed markup (`@html`) — DOM only */
  html?( el: N, value: string ): void
  /** Set an inline custom property, or remove it when `null` (RFC-004 §8) */
  styleVar( el: N, prop: string, value: string | null ): void
  /** Mark a component root with its stylesheet scope. An inner scope already set wins */
  scope( el: N, nsp: string ): void
  /** Returns the unlisten function */
  listen( el: N, name: string, fn: ( event: any ) => void ): () => void
  /** Capture focus before a swap moves nodes; the returned function restores it */
  keepFocus?(): () => void
}

// ---------------------------------------------------------------- DOM host
const SKELETONS = new WeakMap<BlockIR, HTMLTemplateElement>()

/**
 * Today's behaviour, unchanged: skeletons parsed once per block into a
 * `<template>` and cloned per instance, scope stamped as `rel`.
 */
export const domHost: Host<Node> = {
  clone( block ){
    let tpl = SKELETONS.get( block )
    if( !tpl ){
      tpl = document.createElement('template')
      tpl.innerHTML = block.html
      SKELETONS.set( block, tpl )
    }
    return tpl.content.cloneNode( true )
  },
  fragment: () => document.createDocumentFragment(),
  element: tag => document.createElement( tag ),
  text: value => document.createTextNode( value ),
  marker: label => document.createComment( label ),

  child: ( parent, index ) => parent.childNodes[ index ],
  next: node => node.nextSibling,
  /**
   * Range walks and range moves are the hottest node work there is (a
   * keyed list walks every row's range on every change), so they are ONE
   * host call per range with the loop inside, not a host call per node.
   */
  range( first, last ){
    const out: Node[] = []
    for( let n: Node | null = first; n; n = n.nextSibling ){
      out.push( n )
      if( n === last ) break
    }
    return out
  },
  insert: ( parent, node, ref ) => { parent.insertBefore( node, ref ) },
  /**
   * The reference is re-read after every insert rather than captured
   * once: `nodes` may already contain `ref`'s next sibling, and a fixed
   * reference would put the rest of the range in front of it.
   */
  insertAfter( ref, nodes ){
    const parent = ref.parentNode
    if( !parent ) return
    let anchor = ref
    for( const n of nodes ){
      parent.insertBefore( n, anchor.nextSibling )
      anchor = n
    }
  },
  remove: node => ( node as ChildNode ).remove(),
  isElement: node => node.nodeType === 1,
  connected: node => node.isConnected,
  /**
   * Nodes in different trees compare as DISCONNECTED plus an arbitrary
   * but consistent order, so a range test `precedes( from, n ) &&
   * precedes( n, to )` still fails for them: one side always does.
   */
  precedes: ( a, b ) => !!( a.compareDocumentPosition( b ) & 4 /* FOLLOWING */ ),

  attr: ( el, name, value ) => value === null
                                  ? ( el as Element ).removeAttribute( name )
                                  : ( el as Element ).setAttribute( name, value ),
  /** `.data`: the direct write, as before the seam — no node-type dispatch */
  setText: ( node, value ) => { ( node as Text ).data = value },
  content: ( el, value ) => { el.textContent = value },
  html: ( el, value ) => { ( el as Element ).innerHTML = value },
  styleVar: ( el, prop, value ) => value === null
                                      ? ( el as HTMLElement ).style.removeProperty( prop )
                                      : ( el as HTMLElement ).style.setProperty( prop, value ),
  scope: ( el, nsp ) => { ( el as Element ).hasAttribute('rel') || ( el as Element ).setAttribute('rel', nsp ) },
  listen( el, name, fn ){
    el.addEventListener( name, fn )
    return () => el.removeEventListener( name, fn )
  },
  /**
   * Salvaged nodes are detached and re-inserted, which drops focus. The
   * element survives the move, so put the caret back where the user left it.
   */
  keepFocus(){
    const focused = document.activeElement as HTMLElement | null
    return () => { focused && focused.isConnected && focused !== document.activeElement && focused.focus() }
  }
}
