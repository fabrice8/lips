/**
 * Phase 2 — hot-swap support (RFC-001 §8)
 *
 * Structural IR comparison by EXPRESSION SOURCE: two compilations
 * of related templates produce different expression-table indices,
 * so equality must resolve every `E` through its own table before
 * comparing. These normalizers produce plain comparable shapes.
 */

import type { BlockIR, BindIR, ChildIR, CompInput } from './compiler'

export interface SwapChange {
  kind: 'skeleton' | 'binds' | 'block'
  /** Block-tree coordinates, e.g. 'root', 'root/2', 'root/2/0' */
  path: string
}
export interface SwapReport {
  changes: SwapChange[]
}

// ------------------------------------------------------------- normalizers
const normInput = ( ci: CompInput | null | undefined, x: string[] ): any =>
  ci == null ? ci : 'e' in ci ? { $: x[ ci.e ] } : ci

export const normBind = ( b: BindIR, x: string[] ): any => ({ ...b, e: x[ b.e ] })

export function normChild( c: ChildIR, x: string[] ): any {
  switch( c.t ){
    case 'macro':
      return { t: c.t, name: c.name, args: c.args,
        sets: c.sets.map( s => 'spread' in s
          ? { spread: x[ s.spread ] }
          : { name: s.name, ci: normInput( s.ci, x ) } ),
        block: normBlock( c.block, x ) }
    case 'if':
      return { t: c.t, branches: c.branches.map( b => ({
        when: b.when == null ? null : x[ b.when ],
        block: normBlock( b.block, x )
      }) ) }
    case 'for':
      return {
        t: c.t, args: c.args,
        of: c.of === undefined ? undefined : x[ c.of ],
        from: normInput( c.from, x ), to: normInput( c.to, x ), by: normInput( c.by, x ),
        block: normBlock( c.block, x )
      }
    case 'switch':
      return { t: c.t, on: x[ c.on ], cases: c.cases.map( k => ({
        is: k.is === null ? null : normInput( k.is, x ),
        block: normBlock( k.block, x )
      }) ) }
    case 'async':
      return {
        t: c.t, awaitE: x[ c.awaitE ],
        then: c.then && { args: c.then.args, block: normBlock( c.then.block, x ) },
        catch: c.catch && { args: c.catch.args, block: normBlock( c.catch.block, x ) },
        loading: c.loading && normBlock( c.loading, x )
      }
    case 'let':
      return { t: c.t, const: c.const,
        vars: Object.fromEntries( Object.entries( c.vars ).map( ( [ k, v ] ) => [ k, normInput( v, x ) ] ) ) }
    case 'log':
      return { t: c.t, e: x[ c.e ] }
    case 'comp':
    case 'dynamic':
      return {
        t: c.t,
        name: c.t === 'comp' ? c.name : undefined,
        tag: c.t === 'dynamic' ? x[ c.tag ] : undefined,
        inputs: Object.fromEntries( Object.entries( c.inputs ).map( ( [ k, v ] ) => [ k, normInput( v, x ) ] ) ),
        spreads: c.spreads.map( e => x[ e ] ),
        events: c.events.map( ev => ({ name: ev.name, e: x[ ev.e ] }) ),
        contents: c.contents && { args: c.contents.args, block: normBlock( c.contents.block, x ) }
      }
  }
}

export const normBlock = ( b: BlockIR, x: string[] ): any => ({
  html: b.html,
  scope: b.scope,
  binds: b.binds.map( bind => normBind( bind, x ) ),
  blocks: b.blocks.map( c => normChild( c, x ) )
})

// ------------------------------------------------------------- comparators
export const sameChild = ( a: ChildIR, ax: string[], b: ChildIR, bx: string[] ) =>
  a.t === b.t && JSON.stringify( normChild( a, ax ) ) === JSON.stringify( normChild( b, bx ) )

export const sameBinds = ( a: BindIR[], ax: string[], b: BindIR[], bx: string[] ) =>
  JSON.stringify( a.map( x => normBind( x, ax ) ) ) === JSON.stringify( b.map( x => normBind( x, bx ) ) )

export const sameLets = ( a: BlockIR, ax: string[], b: BlockIR, bx: string[] ) => {
  const lets = ( blk: BlockIR, x: string[] ) =>
    JSON.stringify( blk.blocks.filter( c => c.t === 'let' ).map( c => normChild( c, x ) ) )
  return lets( a, ax ) === lets( b, bx )
}
