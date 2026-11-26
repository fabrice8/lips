/**
 * Every construct a template has, each read as its component types it:
 * `lips-check` finds nothing here (tests/check.spec.ts).
 */
import Lips from '../../src/lips'
import { component } from '../../src/component'
import type { Handlers, Shape } from '../../src/types'

type Row = { id: string, label: string, tags: string[] }

export const list = component<{ input: { title?: string }, state: { rows: Row[], picked: string | null, mode: 'grid' | 'list' } }>()({
  state: { rows: [], picked: null, mode: 'grid' },
  static: { limit: 3, byId: new Map<string, Row>(), seen: new Set<number>() },
  handler: {
    pick( id: string, _e?: Event ){ this.state.picked = id },
    clear(){ this.state.picked = null }
  },
  macros: `<macro [row, at] name="line"><li title=row.label>{at + 1}. {row.label} {arguments.extra}</li></macro>`,
  default: `
    <section title="{input.title ?? 'Rows'}">
      <let count={ state.rows.length } first={ state.rows[0] } label="rows"/>
      <h2>{count} {label} {first?.label.toUpperCase()}</h2>
      <for [row, i] in=state.rows by="id">
        <button on-click(pick, row.id) class="{state.picked === row.id ? 'on' : ''}">{i}: {row.label}</button>
        <for [tag] in=row.tags><span>{tag.toLowerCase()}</span></for>
        <line row=row at=i extra="!"/>
      </for>
      <for [id, row, n] in=static.byId>{id.length + n} {row.tags.length}</for>
      <for [value] in=static.seen>{value.toFixed( 1 )}</for>
      <for [n] from=1 to=static.limit>{n * 2}</for>
      <if( state.picked )><p>{state.picked.length}</p></if>
      <else-if( state.rows.length > static.limit )><p>many</p></else-if>
      <else><p on-click(clear)>none</p></else>
      <switch( state.mode )><case is="grid">grid</case><case is=['list']>list</case><default>?</default></switch>
      <async await( Promise.resolve({ name: 'Ada' }) )>
        <loading>…</loading>
        <then [user]>{user.name.trim()}</then>
        <catch [error]>{error}</catch>
      </async>
      <button on-click(() => state.mode = 'list')>{self.lang}</button>
      <log( count, state.mode )>
      <tile label=label ...state on-select(pick)>[slot]</tile>
      <tile [a, b]>{a}{b}</tile>
    </section>
  `
})

const lips = new Lips()
lips.register( 'counter', {
  state: { count: 0 },
  handler: { step( by: number ){ this.state.count += by } },
  default: `<button on-click(step, 1)>{state.count.toFixed()}</button>`
})
