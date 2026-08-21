/**
 * App shell — router host, toast stack, and the app-wide stylesheet.
 *
 * A component stylesheet is scoped to `[rel="<name>"]`, and this component
 * is the root (`lips.root()` names it `__ROOT__`), so its sheet compiles to
 * `[rel="__ROOT__"] …` — which matches every element under the shell,
 * pages included. That makes the ROOT sheet the idiomatic place for
 * app-wide layout and typography, with each component still owning its own
 * look. Only `html`/`body` and the design tokens stay in index.html,
 * because no scoped sheet can reach them.
 */
import type { Handler, Metavars } from '../../../src/types'
import type { Link } from './components/nav-bar'

import * as Home from './pages/home'
import * as Reactivity from './pages/reactivity'
import * as ControlFlow from './pages/control-flow'
import * as AsyncPage from './pages/async'
import * as I18nPage from './pages/i18n'
import * as StylesPage from './pages/styles'
import * as Compose from './pages/compose'
import * as Account from './pages/account'
import * as Product from './pages/product'

type Toast = { id: number, text: string, tone: string }

type Static = {
  routes: { path: string, template: any, default?: boolean }[]
  links: Link[]
}
type State = {
  /** Route pattern the router last matched — drives the active nav pill */
  path: string
  toasts: Toast[]
  missing: string | null
}
type Context = {
  online: boolean
}

export const _static: Static = {
  routes: [
    { path: '/', template: Home, default: true },
    { path: '/reactivity', template: Reactivity },
    { path: '/control-flow', template: ControlFlow },
    { path: '/async', template: AsyncPage },
    { path: '/i18n', template: I18nPage },
    { path: '/styles', template: StylesPage },
    { path: '/compose', template: Compose },
    { path: '/account', template: Account },
    { path: '/product/:id', template: Product }
  ],
  links: [
    { path: '/', label: 'Overview', icon: '◆' },
    { path: '/reactivity', label: 'Reactivity', icon: '⚡' },
    { path: '/control-flow', label: 'Control flow', icon: '⌥' },
    { path: '/async', label: 'Async', icon: '⏳' },
    { path: '/compose', label: 'Composition', icon: '⬡' },
    { path: '/styles', label: 'Styles', icon: '🎨' },
    { path: '/i18n', label: 'i18n', icon: '🌍' }
  ]
}

export const state: State = {
  path: '/',
  toasts: [],
  missing: null
}

export const context = ['online']

type MT = Metavars<{}, State, Static, Context>

let seq = 0

export const handler: Handler<MT> = {
  /**
   * The component bus runs both ways: `index.ts` holds the root handle and
   * calls `app.emit('toast', …)`, which reaches THIS listener. Inbound
   * events never invoke handler methods by name, so what the shell accepts
   * stays an explicit contract.
   */
  onCreate(){
    this.on('toast', ( text: string, tone = 'info' ) => this.toast( text, tone ) )
  },

  toast( text: string, tone = 'info' ){
    const id = ++seq
    this.state.toasts = [ ...this.state.toasts, { id, text, tone } ]
    setTimeout( () => this.dismiss( id ), 3200 )
  },
  dismiss( id: number ){
    this.state.toasts = this.state.toasts.filter( t => t.id !== id )
  },

  onRouteAfter( payload: { toState: { path: string } } ){
    this.state.path = payload?.toState?.path || '/'
    this.state.missing = null
  },
  onPageNotFound( path: string ){
    this.state.missing = path
    this.toast(`No route for ${path}`, 'warn')
  }
}

export const stylesheet = `
  /* ---------------------------------------------------------- shell */
  display: block;
  max-width: 62rem;
  margin: 0 auto;
  padding: 0 1.25rem;

  .top {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    padding: .85rem 0;
    margin-bottom: 1.5rem;
    background: color-mix(in srgb, var(--bg) 88%, transparent);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--border);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: .5rem;
    font-weight: 700;
    letter-spacing: -.01em;
    cursor: pointer;
    b { font-size: 1.05rem }
    small {
      font-family: var(--mono);
      font-size: .68rem;
      font-weight: 500;
      color: var(--text-faint);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: .05rem .4rem;
    }
  }
  .tools {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: .45rem;
    flex: 1 1 auto;
    flex-wrap: wrap;
  }

  /* -------------------------------------------------- page furniture */
  h1 {
    font-size: 1.75rem;
    line-height: 1.15;
    letter-spacing: -.02em;
    margin: 0 0 .35rem;
  }
  h2 {
    font-size: 1.05rem;
    margin: 0 0 .2rem;
    letter-spacing: -.01em;
  }
  p { margin: 0 0 .5rem }
  .lede { color: var(--text-dim); margin: 0 0 1.5rem; max-width: 46rem }
  .dim { color: var(--text-dim) }
  .faint { color: var(--text-faint); font-size: .85rem }

  section.panel {
    padding: 1.15rem 1.25rem;
    margin: 0 0 1.1rem;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
  section.panel > header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    min-width: 0;
    margin-bottom: .9rem;
  }
  /**
   * The code chip must never widen the PAGE. Keeping a signature on one
   * line needs nowrap, so it also needs a shrinkable box that scrolls
   * inside itself — min-width:0 is the part flexbox requires, since a flex
   * item defaults to min-width:auto and refuses to shrink below content.
   */
  .tag {
    font-family: var(--mono);
    font-size: .7rem;
    color: var(--text-faint);
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: .1rem .5rem;
    white-space: nowrap;
    max-width: 100%;
    min-width: 0;
    overflow-x: auto;
  }

  .grid { display: grid; gap: .9rem; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)) }
  .row { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center }
  .stack { display: grid; gap: .75rem }

  code {
    font-family: var(--mono);
    font-size: .85em;
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: .05rem .3rem;
  }
  pre {
    margin: .5rem 0 0;
    padding: .75rem .85rem;
    overflow-x: auto;
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    code { background: none; border: 0; padding: 0; font-size: .8rem; line-height: 1.5 }
  }

  button.act {
    font: inherit;
    font-size: .87rem;
    font-weight: 600;
    color: var(--accent-ink);
    background: var(--accent);
    border: 1px solid var(--accent);
    border-radius: var(--radius-sm);
    padding: .38rem .8rem;
    cursor: pointer;
    transition: filter .15s, transform .1s;
    &:hover { filter: brightness(1.08) }
    &:active { transform: translateY(1px) }
  }
  button.ghost {
    font: inherit;
    font-size: .87rem;
    font-weight: 550;
    color: var(--text);
    background: var(--panel-2);
    border: 1px solid var(--border-2);
    border-radius: var(--radius-sm);
    padding: .38rem .8rem;
    cursor: pointer;
    &:hover { border-color: var(--accent) }
  }

  input[type="text"] {
    font: inherit;
    font-size: .9rem;
    color: var(--text);
    background: var(--panel-2);
    border: 1px solid var(--border-2);
    border-radius: var(--radius-sm);
    padding: .38rem .6rem;
    min-width: 12rem;
    &:focus { outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent); outline-offset: 1px }
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: .35rem;
    font-size: .78rem;
    font-weight: 600;
    border-radius: 999px;
    padding: .18rem .6rem;
    border: 1px solid var(--border);
    background: var(--panel);
    color: var(--text-dim);
  }
  .pill.on { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 40%, transparent) }
  .pill.off { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 40%, transparent) }

  /* -------------------------------------------------------- toasts */
  .toasts {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    z-index: 50;
    display: grid;
    gap: .5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .toasts li {
    display: flex;
    align-items: center;
    gap: .6rem;
    min-width: 13rem;
    padding: .55rem .75rem;
    font-size: .86rem;
    background: var(--panel);
    border: 1px solid var(--border-2);
    border-left: 3px solid var(--accent);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow);
    animation: slide-in .22s cubic-bezier(.2, .9, .2, 1);
  }
  .toasts li.warn { border-left-color: var(--warn) }
  .toasts li.ok { border-left-color: var(--ok) }
  .toasts button {
    font: inherit;
    margin-left: auto;
    color: var(--text-faint);
    background: none;
    border: 0;
    cursor: pointer;
    &:hover { color: var(--text) }
  }

  @keyframes slide-in {
    from { opacity: 0; transform: translateX(12px) }
    to { opacity: 1; transform: none }
  }

  @media (max-width: 640px) {
    .top { padding: .7rem 0 }
    h1 { font-size: 1.45rem }
  }
`

export default `
  <main>
    <header class="top">
      <span class="brand" on-click(() => context.navigate('/') )>
        <b>💋 Lips</b>
        <small>feature tour</small>
      </span>

      <span class="tools">
        <nav-bar links=static.links current=state.path></nav-bar>
        <lang-switch></lang-switch>
        <theme-switch></theme-switch>
      </span>
    </header>

    <router routes=static.routes
            global
            on-after(onRouteAfter)
            on-not-found(onPageNotFound)></router>

    <if( state.missing )>
      <not-found path=state.missing></not-found>
    </if>

    <site-footer></site-footer>

    <ul class="toasts">
      <for [t] in=state.toasts by="id">
        <li class="{t.tone}">
          <span @text=t.text></span>
          <button title="Dismiss" on-click(dismiss, t.id)>✕</button>
        </li>
      </for>
    </ul>
  </main>
`
