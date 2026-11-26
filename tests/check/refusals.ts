/**
 * One refusal each: tests/check.spec.ts finds each by the text beside it.
 */
import Lips from '../../src/lips'
import { component } from '../../src/component'

type Item = { id: string, label: string }

export const refusals = component<{ input: { size?: number }, state: { items: Item[], mode: 'a' | 'b', count: number } }>()({
  state: { items: [], mode: 'a', count: 0 },
  static: { limit: 3 },
  handler: { step( by: number ){ this.state.count += by } },
  macros: `<macro [item] name="row"><li>{item.lable}</li></macro>`,
  default: `
    <div>
      <p>{state.cuont}</p>
      <p>{stat.count}</p>
      <for [item] in=state.items><b>{item.labl}</b></for>
      <for [item, at, extra] in=state.items>{extra}</for>
      <let twice={ state.count * 2 }/>
      <p>{twice.length}</p>
      <button on-click(() => twice = 1)>let</button>
      <p>{input.size.toFixed()}</p>
      <button on-click(step, 'one')>arg</button>
      <button on-click(stpe, 1)>name</button>
      <switch( state.mode )><case is="c">c</case></switch>
      <async await( Promise.resolve({ name: 'x' }) )><then [u]>{u.nmae}</then></async>
      <p>{static.limt}</p>
      <row item=state.items[0]/>
      <p>{ state.count + }</p>
    </div>
  `
})

new Lips().register( 'inline', {
  state: { open: false },
  default: `<p>{state.opne}</p>`
})

const page = 'x'
export const skipped = component({ state: { a: 1 }, default: `<p>${ page }{state.a}</p>` })

const shared = { go(){} }
export const notInPlace = component({ state: { a: 1 }, handler: shared, default: `<p>{state.a}</p>` })
