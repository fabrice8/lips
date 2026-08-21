/**
 * Composition — macros, slots with arguments, spreads, scoped context,
 * and `<const>`.
 *
 * `macros` is a compile-time facility: a macro body is INLINED at every
 * call site, so it costs no component instance and has no state of its
 * own. That also means macro markup lands inside THIS component's scope,
 * which is why the macro classes are styled by this page's sheet.
 */
import type { Handler, Metavars } from '../../../../src/types'

export const name = 'page-compose'

type Row = { id: string, label: string, kind: string, count: number }

type State = {
  rows: Row[]
  extra: Record<string, string>
}
type Static = {
  tiles: { label: string, value: number, max: number, unit: string, tone: string }[]
}
type Context = {
  toast: ( text: string, tone?: string ) => void
}

export const _static: Static = {
  tiles: [
    { label: 'bundle', value: 21, max: 40, unit: ' KB', tone: 'accent' },
    { label: 'runtime only', value: 12, max: 40, unit: ' KB', tone: 'ok' },
    { label: 'deps', value: 1, max: 10, unit: '', tone: 'ok' }
  ]
}

export const state: State = {
  rows: [
    { id: 'a', label: 'signal', kind: 'core', count: 4 },
    { id: 'b', label: 'effect', kind: 'core', count: 2 },
    { id: 'c', label: 'router', kind: 'built-in', count: 1 }
  ],
  extra: { 'data-source': 'spread', 'aria-label': 'spread onto the element' }
}

export const context = ['toast']

/**
 * `<macro [argv] name="X">` — argv become block-scoped reactive vars at the
 * call site. Reference one macro from another and it inlines recursively.
 */
export const macros = `
  <macro [label] name="chip">
    <em class="chip">{label}</em>
  </macro>

  <macro [row] name="RowLine">
    <li class="rowline">
      <b @text=row.label></b>
      <chip label=row.kind/>
      <span class="count" @text=row.count></span>
    </li>
  </macro>
`

export const handler: Handler<Metavars<{}, State, Static, Context>> = {
  bump( id: string ){
    const row = this.state.rows.find( r => r.id === id )
    row && row.count++
  },
  ping(){
    this.context.toast?.('Raised through context.toast → root bus', 'ok')
  }
}

export const stylesheet = `
  ul { margin: 0; padding: 0; list-style: none; display: grid; gap: .4rem }

  .rowline {
    display: flex;
    align-items: center;
    gap: .6rem;
    padding: .4rem .6rem;
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
  .rowline .count {
    margin-left: auto;
    font-family: var(--mono);
    font-size: .82rem;
    color: var(--text-dim);
  }

  .chip {
    font-family: var(--mono);
    font-style: normal;
    font-size: .72rem;
    color: var(--text-faint);
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: .05rem .45rem;
  }

  .spread {
    font-family: var(--mono);
    font-size: .8rem;
    color: var(--text-dim);
    padding: .5rem .7rem;
    background: var(--panel-2);
    border: 1px dashed var(--border-2);
    border-radius: var(--radius-sm);
  }

  .scoped {
    padding: .7rem .8rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--panel-2);
  }
`

export default `
  <div>
    <h1>Composition</h1>
    <p class="lede">
      Macros inline at compile time, components own state and events, slots close over the
      scope they were WRITTEN in, and context layers can be scoped to a subtree.
    </p>

    <section class="panel">
      <header>
        <h2>Macros</h2>
        <span class="tag">&lt;macro [row] name="RowLine"&gt;</span>
      </header>

      <ul>
        <for [row] in=state.rows by="id">
          <RowLine row=row/>
        </for>
      </ul>

      <div class="row" style="margin-top: .7rem">
        <button class="ghost" on-click(bump, 'a')>bump signal</button>
        <button class="ghost" on-click(bump, 'c')>bump router</button>
        <span class="faint">a macro is markup, so these updates are ordinary binds</span>
      </div>
    </section>

    <section class="panel">
      <header>
        <h2>Slots keep their own scope</h2>
        <span class="tag">&lt;{input.renderer}/&gt;</span>
      </header>

      <!-- "total" is declared HERE, and the slot body below still reads it,
           because a slot renders in the scope it was written in — not where
           the child places it. -->
      <const total={ state.rows.reduce( ( n, r ) => n + r.count, 0 ) }/>

      <counter initial=total limit=20 on-update(() => context.toast('counter emitted', 'ok'))>
        seeded from {total} macro rows
      </counter>
    </section>

    <section class="panel">
      <header>
        <h2>Inputs, spreads and tiles</h2>
        <span class="tag">...state.extra</span>
      </header>

      <div class="grid" style="margin-bottom: .8rem">
        <for [tile] in=static.tiles by="label">
          <stat-tile label=tile.label
                     value=tile.value
                     max=tile.max
                     unit=tile.unit
                     tone=tile.tone></stat-tile>
        </for>
      </div>

      <p class="spread" ...state.extra>
        this paragraph's data-source / aria-label came from a spread
      </p>
    </section>

    <section class="panel">
      <header>
        <h2>Scoped context &amp; the root bus</h2>
        <span class="tag">&lt;context lane="…"&gt;</span>
      </header>

      <div class="stack">
        <div class="scoped">outer lane: <code @text="{context.lane || 'unset'}"></code></div>

        <context lane="inner">
          <div class="scoped">
            inside &lt;context lane="inner"&gt;: <code @text=context.lane></code>
            <p class="faint" style="margin: .3rem 0 0">
              A scoped layer is a plain object whose prototype is the enclosing context, so
              reads fall through and only the provided key is overridden.
            </p>
          </div>
        </context>

        <div class="row">
          <button class="act" on-click(ping)>Raise a toast</button>
          <span class="faint">
            context.toast → the root handle's emit → the shell's this.on('toast')
          </span>
        </div>
      </div>
    </section>
  </div>
`
