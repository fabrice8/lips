/**
 * Lips: the template is compiled here at run time, from its source. So a
 * changed template can be pushed into the running app as text (`PUSH`),
 * with no rebuild, and swapped into the live instance: the L4 gate's
 * last check.
 */
import { compileLynxTemplate } from '@lipsjs/lips/lynx'
import { renderIR } from '@lipsjs/lips/runtime'
import { connectBackground } from '@lipsjs/lips/lynx/background'
import { drive, rowsAt } from '../screen'

declare const lynx: any

export const TEMPLATE = `
<div class="screen">
  <p class="count" id="count">Count: {state.n}</p>
  <for [row] in=state.rows by="id"><div class="row"><span>{row.label}</span></div></for>
</div>`

/** Served next to the bundle: a changed template, fetched after the run */
const PUSH = 'http://localhost:3125/gate/pushed.lips'

const bg = connectBackground()
const state = { n: 0, rows: rowsAt( 0 ) }
const inst = renderIR<any>( compileLynxTemplate( TEMPLATE ).ir, { state }, { host: bg.host, mode: 'interpreted' })
inst.mount( bg.root )

drive( 'lips', step => {
  inst.state.n = step
  inst.state.rows = rowsAt( step )
}, () => fetch( PUSH ).then( ( r: any ) => r.text() ).then( ( src: string ) => {
  const { ir, diagnostics } = compileLynxTemplate( src )
  if( diagnostics.length ) return console.log(`L4 lips push refused ${JSON.stringify( diagnostics )}`)
  // Hot-swap (RFC-002 §8): the instance keeps its state and what did not change
  const report = inst.swap( ir )
  console.log(`L4 lips swap ${report.changes.length} change(s), ${report.salvaged.length} salvaged`)
  console.log(`L4 lips pushed ${src.length}`)
}).catch( ( e: any ) => console.log(`L4 lips push failed ${e}`) ) )
