/**
 * Reactivity page — signals, keyed lists, component events, `<let>`,
 * and proof that a nested write does not wake the list.
 */
import type { Handler, Metavars } from '../../../../src/types'

export const name = 'page-reactivity'

type Todo = { id: number, text: string, done: boolean }

type State = {
  seed: number
  lastEmit: number | null
  draft: string
  todos: Todo[]
  renders: number
}
type Context = {
  online: boolean
  toast: ( text: string, tone?: string ) => void
}

export const state: State = {
  seed: 3,
  lastEmit: null,
  draft: '',
  todos: [
    { id: 1, text: 'Read the IR compiler', done: true },
    { id: 2, text: 'Write a keyed <for>', done: false },
    { id: 3, text: 'Ship something small', done: false }
  ],
  renders: 0
}

export const context = [ 'online', 'toast' ]

let nextId = 4

type MT = Metavars<{}, State, {}, Context>

export const handler: Handler<MT> = {
  /** `on-update(onCount)` on <counter> — the child's `this.emit('update', n)` */
  onCount( value: number ){
    this.state.lastEmit = value
  },

  add(){
    const text = this.state.draft.trim()
    if( !text ) return this.context.toast?.('Type something first', 'warn')

    this.state.todos = [ ...this.state.todos, { id: nextId++, text, done: false } ]
    this.state.draft = ''
  },
  /** A NESTED write: only the bindings that read this row's `done` re-run */
  toggle( todo: Todo ){
    todo.done = !todo.done
  },
  remove( id: number ){
    this.state.todos = this.state.todos.filter( t => t.id !== id )
  },
  shuffle(){
    const rows = [ ...this.state.todos ]
    for( let i = rows.length - 1; i > 0; i-- ){
      const j = Math.floor( Math.random() * ( i + 1 ) )
      ;[ rows[ i ], rows[ j ] ] = [ rows[ j ], rows[ i ] ]
    }
    this.state.todos = rows
    this.context.toast?.('Reordered — DOM nodes were moved, not rebuilt', 'ok')
  },

  onDraft( e: any ){
    this.state.draft = e.target.value
  },
  onDraftKey( e: any ){
    e.key === 'Enter' && this.add()
  },

  goOffline(){
    this.setContext('online', !this.context.online )
  }
}

export const stylesheet = `
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: .4rem;
  }
  li {
    display: flex;
    align-items: center;
    gap: .6rem;
    padding: .45rem .6rem;
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
  li .text { flex: 1 }
  li.done .text { color: var(--text-faint); text-decoration: line-through }
  li .drop {
    font: inherit;
    color: var(--text-faint);
    background: none;
    border: 0;
    cursor: pointer;
    &:hover { color: var(--danger) }
  }
  input[type="checkbox"] { accent-color: var(--accent); width: 1rem; height: 1rem; cursor: pointer }

  .emit {
    font-family: var(--mono);
    font-size: .8rem;
    color: var(--text-dim);
  }
  .counters { display: grid; gap: .9rem; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)) }
`

export default `
  <div>
    <h1>Reactivity</h1>
    <p class="lede">
      A state write notifies only the bindings that read that key. Nested writes are
      per-object, so <code>todo.done = …</code> wakes one row, not the list.
    </p>

    <section class="panel">
      <header>
        <h2>Component events &amp; slots</h2>
        <span class="tag">this.emit('update', n) → on-update(…)</span>
      </header>

      <div class="counters">
        <counter initial=state.seed limit=8 on-update(onCount)>Slotted label</counter>
        <counter initial=0 limit=4 on-update(onCount)>Second instance, own state</counter>
      </div>

      <p class="emit">
        last emitted value:
        <if( state.lastEmit === null )><span class="dim">— nothing yet</span></if>
        <else><b @text=state.lastEmit></b></else>
      </p>

      <div class="row">
        <button class="ghost" on-click(() => state.seed = 5)>Re-seed both to 5</button>
        <span class="faint">writes state.seed → each counter's onInput re-runs</span>
      </div>
    </section>

    <section class="panel">
      <header>
        <h2>Keyed list</h2>
        <span class="tag">&lt;for [t, i] in=state.todos by="id"&gt;</span>
      </header>

      <div class="row" style="margin-bottom: .75rem">
        <input type="text"
               placeholder="Add a task…"
               value=state.draft
               on-input(onDraft)
               on-keydown(onDraftKey)>
        <button class="act" on-click(add)>Add</button>
        <button class="ghost" on-click(shuffle)>Shuffle</button>
      </div>

      <!-- <let> computes once per render pass, in template scope -->
      <let open={ state.todos.filter( t => !t.done ).length }/>

      <if( !state.todos.length )>
        <p class="dim">Nothing left. Add one above.</p>
      </if>
      <else>
        <ul>
          <for [todo, i] in=state.todos by="id">
            <li class="{todo.done ? 'done' : ''}">
              <input type="checkbox" checked=todo.done on-change(toggle, todo)>
              <!-- Quoted: an UNQUOTED value ends at the first top-level space,
                   so @text=i + 1 would bind "i" alone and drop the rest -->
              <span class="faint" @text="{i + 1}"></span>
              <span class="text" @text=todo.text></span>
              <button class="drop" title="Remove" on-click(remove, todo.id)>✕</button>
            </li>
          </for>
        </ul>
        <p class="faint" style="margin-top: .6rem">{open} of {state.todos.length} still open</p>
      </else>
    </section>

    <section class="panel">
      <header>
        <h2>Shared context</h2>
        <span class="tag">setContext('online', …)</span>
      </header>
      <div class="row">
        <if( context.online )><span class="pill on">● online</span></if>
        <else><span class="pill off">● offline</span></else>

        <button class="ghost" on-click(goOffline)>Toggle</button>
        <span class="faint">every component reading context.online updates — check the Overview page</span>
      </div>
    </section>
  </div>
`
