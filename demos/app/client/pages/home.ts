/**
 * Overview page.
 *
 * `name` is not decoration: a route page is resolved through
 * `resolveTemplate`, which uses `template.name` as the style NAMESPACE and
 * falls back to `'dynamic'`. Two nameless pages would both compile to
 * `[rel="dynamic"]`, and `Stylesheet.load()` takes a reference to the
 * sheet already in `<head>` rather than injecting a second one — so the
 * second page's CSS would silently never appear. Every page here is named.
 */
import type { Handler, Metavars } from '../../../../src/types'

export const name = 'page-home'

type Static = {
  features: { icon: string, title: string, body: string, path: string }[]
}
type Context = {
  online: boolean
  navigate: ( path: string ) => void
}

export const _static: Static = {
  features: [
    { icon: '⚡', title: 'Fine-grained reactivity', path: '/reactivity',
      body: 'Per-key signals. A write notifies only the bindings that read that key — no virtual DOM, no diffing.' },
    { icon: '⌥', title: 'Element-shaped control flow', path: '/control-flow',
      body: '<if>, <for>, <switch>, <async> are tags, not an attribute DSL. Keyed lists keep node identity.' },
    { icon: '⏳', title: 'Async as markup', path: '/async',
      body: 'One block holds loading, resolved and failed. The await expression is an effect, so retry is a state write.' },
    { icon: '⬡', title: 'Composition', path: '/compose',
      body: 'Slots, macros, spreads, dynamic tags, and a component bus that runs both ways.' },
    { icon: '🎨', title: 'Reactive stylesheets', path: '/styles',
      body: 'Scoped CSS where any declaration value can be an expression — including inside :hover, @media and @keyframes.' },
    { icon: '🌍', title: 'i18n by stable key', path: '/i18n',
      body: 'Reword the source text and the translation holds. @format carries params for plurals.' }
  ]
}

export const context = [ 'online', 'navigate' ]

export const handler: Handler<Metavars<{}, {}, Static, Context>> = {
  open( path: string ){
    this.context.navigate?.( path )
  }
}

export const stylesheet = `
  .hero {
    padding: 1.5rem 0 2rem;
    border-bottom: 1px solid var(--border);
    margin-bottom: 1.5rem;
  }
  .hero h1 { font-size: 2.1rem }
  .hero .mark {
    background: linear-gradient(90deg, var(--accent), var(--accent-2));
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .pipeline {
    font-family: var(--mono);
    font-size: .78rem;
    color: var(--text-faint);
    margin-top: 1rem;
    overflow-x: auto;
    white-space: nowrap;
  }

  .card {
    display: grid;
    gap: .4rem;
    align-content: start;
    padding: 1rem;
    text-align: left;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
    transition: border-color .16s, transform .16s, box-shadow .16s;

    &:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
      box-shadow: var(--shadow);
    }
  }
  .card .icon { font-size: 1.3rem; line-height: 1 }
  .card h2 { font-size: .98rem }
  .card p { font-size: .86rem; color: var(--text-dim); margin: 0 }

  .status { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; margin-top: 1rem }
`

export default `
  <div>
    <div class="hero">
      <h1>A UI framework that updates <span class="mark">exactly what changed</span></h1>
      <p class="lede">
        Every binding on this page is its own effect over per-key signals. Nothing below is
        a mock-up — each panel is the feature it describes, running.
      </p>

      <div class="status">
        <if( context.online )>
          <span class="pill on">● online</span>
        </if>
        <else>
          <span class="pill off">● offline</span>
        </else>
        <span class="faint">context.online, toggled from the Reactivity page</span>
      </div>

      <p class="pipeline">template string ──parse──▶ AST ──compile──▶ IR ──render──▶ DOM</p>
    </div>

    <div class="grid">
      <for [f] in=static.features by="path">
        <button class="card" on-click(open, f.path)>
          <span class="icon" @text=f.icon></span>
          <h2 @text=f.title></h2>
          <p @text=f.body></p>
        </button>
      </for>
    </div>
  </div>
`
