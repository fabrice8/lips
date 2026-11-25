/**
 * Parts page — a part installed as a plugin, element references, event
 * modifiers, a field state can reset, and the error boundary.
 *
 * Each panel is one thing a component reaches for once it leaves the
 * text-and-list basics, and each used to be a guess: is `value=` live after
 * the reader types? Does a throw in a branch take the page down?
 */
import type { Handlers, Shape } from '../../../../src/types'
import type { MenuItem } from '../../../../src/parts'

export const name = 'page-parts'

type Row = { id: number, label: string, pinned?: boolean }

type State = {
  open: boolean
  picked: string | null
  query: string
  rows: Row[]
  opened: number | null
  broken: boolean
  failure: string | null
}
type Static = {
  actions: MenuItem[]
}

export const state: State = {
  open: false,
  picked: null,
  query: 'lips',
  rows: [
    { id: 1, label: 'Inbox' },
    { id: 2, label: 'Drafts' },
    { id: 3, label: 'Archive' }
  ],
  opened: null,
  broken: false,
  failure: null
}

export const _static: Static = {
  actions: [
    { id: 'copy', label: 'Copy' },
    { id: 'rename', label: 'Rename' },
    { id: 'share', label: 'Share', disabled: true },
    { id: 'delete', label: 'Delete' }
  ]
}

export const handler: Handlers<Shape<{ state: State, static: Static }>> = {
  /** `<popover>` emits `change` with the open state it wants */
  setOpen( open: boolean ){ this.state.open = open },
  /** `<popover-menu>` emits `select` with the item, and closes itself */
  run( item: MenuItem ){ this.state.picked = item.label },

  onQuery( e: any ){ this.state.query = e.target.value },
  /** `value=` writes the input's property: a reset shows, after typing too */
  clear(){
    this.state.query = ''
    this.refs.search?.focus()
  },

  open( id: number ){ this.state.opened = id },
  pin( row: Row ){ row.pinned = !row.pinned },
  remove( id: number ){ this.state.rows = this.state.rows.filter( r => r.id !== id ) },

  breakIt(){ this.state.broken = true },
  mend(){
    this.state.broken = false
    this.state.failure = null
  },
  /** What a bind, a branch, a list or a handler of this page throws lands here */
  onError( error: Error ){ this.state.failure = error.message }
}

export const stylesheet = `
  .menu {
    margin: .3rem 0 0;
    padding: .3rem;
    list-style: none;
    min-width: 10rem;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    box-shadow: 0 6px 24px rgb(0 0 0 / .25);
  }
  .menu .is-active { background: var(--panel-2) }
  .menu .is-disabled { color: var(--text-faint) }
  .menu li { padding: .35rem .6rem; border-radius: var(--radius-sm); cursor: pointer }

  ul.rows { margin: 0; padding: 0; list-style: none; display: grid; gap: .4rem }
  ul.rows li {
    display: flex;
    justify-content: space-between;
    padding: .45rem .6rem;
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  ul.rows li.opened { border-color: var(--accent) }
  ul.rows .drop, ul.rows .pin { font: inherit; color: var(--text-faint); background: none; border: 0; cursor: pointer }
  ul.rows span { flex: 1 }

  .error { color: var(--danger); font-family: var(--mono); font-size: .8rem }
`

export default `
  <div>
    <h1>Parts &amp; the DOM</h1>
    <p class="lede">
      A headless part installed with <code>lips.use()</code>, element references,
      event modifiers, form fields state can reset, and the error boundary.
    </p>

    <section class="panel">
      <header>
        <h2>A menu, as a plugin</h2>
        <span class="tag">lips.use( menu )</span>
      </header>

      <div class="row">
        <popover open=state.open on-change( setOpen )>
          <popover-trigger class="ghost" haspopup="menu"><span>Actions ▾</span></popover-trigger>
          <popover-menu items=static.actions class="menu" item="menu-item" on-select( run )/>
        </popover>
        <span class="faint picked">
          <if( state.picked )>picked: <b @text=state.picked></b></if>
          <else>arrows, Home/End, a letter, Enter — or a tap</else>
        </span>
      </div>
    </section>

    <section class="panel">
      <header>
        <h2>A field state resets, and a reference</h2>
        <span class="tag">value=state.query · @ref="search"</span>
      </header>

      <div class="row">
        <input type="search" class="search" @ref="search" value=state.query on-input(onQuery)>
        <button class="ghost clear" on-click(clear)>Clear</button>
        <span class="faint">typed: <b class="typed" @text=state.query></b></span>
      </div>
    </section>

    <section class="panel">
      <header>
        <h2>Event modifiers</h2>
        <span class="tag">on-click.stop( … )</span>
      </header>

      <ul class="rows">
        <for [row] in=state.rows by="id">
          <li class=( row.id === state.opened ? 'opened' : '' ) on-click(open, row.id)>
            <span @text=row.label></span>
            <!-- .stop: pinning a row does not also open it -->
            <button class="pin" title="Pin" on-click.stop(pin, row)>{row.pinned ? '★' : '☆'}</button>
            <button class="drop" title="Remove" on-click.stop(remove, row.id)>✕</button>
          </li>
        </for>
      </ul>
      <p class="faint">opened: <b class="opened-id" @text=( state.opened ?? 'none' )></b></p>
    </section>

    <section class="panel">
      <header>
        <h2>The error boundary</h2>
        <span class="tag">onError( error )</span>
      </header>

      <div class="row">
        <button class="ghost break" on-click(breakIt)>Break a branch</button>
        <button class="ghost mend" on-click(mend)>Mend it</button>
      </div>

      <!-- Reads a path that is not there: the throw reaches onError, the page goes on -->
      <if( state.broken )><p>{ state.missing.value }</p></if>
      <if( state.failure )><p class="error" @text=state.failure></p></if>
    </section>
  </div>
`
