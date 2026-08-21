/**
 * Control flow — every branching tag Lips ships, plus dynamic tags.
 */
import type { Handler, Metavars } from '../../../../src/types'

export const name = 'page-control-flow'

type State = {
  level: number
  tab: string
  rows: number
  tag: string
}
type Static = {
  tabs: { id: string, label: string }[]
  tags: string[]
}

export const _static: Static = {
  tabs: [
    { id: 'draft', label: 'Draft' },
    { id: 'review', label: 'In review' },
    { id: 'live', label: 'Live' },
    { id: 'archived', label: 'Archived' }
  ],
  tags: [ 'b', 'i', 'mark', 'code', 'small' ]
}

export const state: State = {
  level: 42,
  tab: 'review',
  rows: 4,
  tag: 'mark'
}

export const handler: Handler<Metavars<{}, State, Static>> = {
  pick( id: string ){ this.state.tab = id },
  nextTag(){
    const list = this.static.tags
    this.state.tag = list[ ( list.indexOf( this.state.tag ) + 1 ) % list.length ]
  }
}

export const stylesheet = `
  input[type="range"] { accent-color: var(--accent); width: 100%; max-width: 22rem }

  .verdict {
    font-weight: 600;
    font-size: 1.05rem;
  }
  .verdict.low { color: var(--danger) }
  .verdict.mid { color: var(--warn) }
  .verdict.high { color: var(--ok) }

  .tabs { display: flex; gap: .3rem; flex-wrap: wrap; margin-bottom: .8rem }
  .tabs button {
    font: inherit;
    font-size: .85rem;
    font-weight: 550;
    color: var(--text-dim);
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: .25rem .7rem;
    cursor: pointer;
    &:hover { color: var(--text) }
  }
  .tabs button.on {
    color: var(--accent-ink);
    background: var(--accent);
    border-color: var(--accent);
  }
  .panel-body {
    padding: .8rem .9rem;
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    min-height: 3.5rem;
  }

  .chips { display: flex; gap: .35rem; flex-wrap: wrap }
  .chip {
    font-family: var(--mono);
    font-size: .78rem;
    color: var(--text-dim);
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: .12rem .45rem;
  }
  .demo-out {
    font-size: 1.05rem;
    padding: .6rem .8rem;
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
`

export default `
  <div>
    <h1>Control flow</h1>
    <p class="lede">
      Branching is element-shaped, so a template reads as markup and the compiler can
      turn each branch into its own block with precomputed anchor paths.
    </p>

    <section class="panel">
      <header>
        <h2>if / else-if / else</h2>
        <span class="tag">&lt;if( … )&gt; &lt;else-if( … )&gt; &lt;else&gt;</span>
      </header>

      <input type="range" min="0" max="100" value=state.level
             on-input(( e ) => state.level = Number( e.target.value ))>

      <p>
        <span class="tag" @text=state.level></span>
        <if( state.level < 34 )>
          <span class="verdict low">Needs work</span>
        </if>
        <else-if( state.level < 67 )>
          <span class="verdict mid">Getting there</span>
        </else-if>
        <else>
          <span class="verdict high">Shipping shape</span>
        </else>
      </p>
      <p class="faint">Only the branch that changed is destroyed and rebuilt — drag slowly across a threshold.</p>
    </section>

    <section class="panel">
      <header>
        <h2>switch / case / default</h2>
        <span class="tag">&lt;case is=['live','archived']&gt;</span>
      </header>

      <div class="tabs">
        <for [tab] in=static.tabs by="id">
          <button class="{state.tab === tab.id ? 'on' : ''}" on-click(pick, tab.id)>{tab.label}</button>
        </for>
      </div>

      <div class="panel-body">
        <switch( state.tab )>
          <case is="draft"><p>Nobody has seen this yet. <code>is="draft"</code></p></case>
          <case is="review"><p>Waiting on a second pair of eyes. <code>is="review"</code></p></case>
          <case is=['live','archived']>
            <p>One arm, two values — <code>is=['live','archived']</code> matches either.</p>
          </case>
          <default><p class="dim">No arm matched, so &lt;default&gt; renders.</p></default>
        </switch>
      </div>
    </section>

    <section class="panel">
      <header>
        <h2>for … in / for … from-to</h2>
        <span class="tag">&lt;for [x] from="1" to=state.rows&gt;</span>
      </header>

      <div class="row" style="margin-bottom: .7rem">
        <button class="ghost" on-click(() => state.rows = Math.max( 1, state.rows - 1 ))>−</button>
        <span class="tag">{state.rows} rows</span>
        <button class="ghost" on-click(() => state.rows = Math.min( 9, state.rows + 1 ))>+</button>
      </div>

      <div class="chips">
        <for [n] from="1" to=state.rows>
          <span class="chip">row {n}</span>
        </for>
      </div>

      <p class="faint" style="margin-top: .8rem">
        The tab list above is the <code>in=</code> form with <code>by="id"</code>; this one is the
        numeric range form. Both are the same block type in the IR.
      </p>
    </section>

    <section class="panel">
      <header>
        <h2>Dynamic tags</h2>
        <span class="tag">&lt;{state.tag}&gt;…&lt;/&gt;</span>
      </header>

      <p class="demo-out">
        The element around this text is
        <!-- </> is the closing form for a dynamic tag, and for a fragment -->
        <{state.tag}>&lt;{state.tag}&gt;</>
        — chosen at runtime.
      </p>

      <div class="row" style="margin-top: .7rem">
        <button class="ghost" on-click(nextTag)>Next tag</button>
        <span class="faint">the same mechanism the router uses to place a page</span>
      </div>
    </section>
  </div>
`
