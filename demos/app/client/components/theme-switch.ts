/**
 * Theme switch — `self.setContext()` from a template handler, plus a
 * `<switch>` over the current choice.
 *
 * The tokens themselves live on `:root` in index.html, so this writes
 * `data-theme` on `<html>`; the context copy is what lets any component
 * READ the theme reactively (see the `styles` page, which colours a
 * declaration off `context.theme`).
 */
import type { Handler, Metavars } from '../../../../src/types'

type State = {
  mode: 'system' | 'light' | 'dark'
}
type Context = {
  theme: string
}

export const state: State = {
  mode: 'system'
}

export const context = ['theme']

const resolve = ( mode: State['mode'] ) =>
  mode !== 'system'
    ? mode
    : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

export const handler: Handler<Metavars<{}, State, {}, Context>> = {
  onMount(){ this.apply( this.state.mode ) },

  apply( mode: State['mode'] ){
    this.state.mode = mode

    mode === 'system'
      ? delete document.documentElement.dataset.theme
      : document.documentElement.dataset.theme = mode

    // Publish the RESOLVED theme so stylesheets can branch on it
    this.setContext('theme', resolve( mode ) )
  },

  cycle(){
    const order: State['mode'][] = [ 'system', 'light', 'dark' ]
    this.apply( order[ ( order.indexOf( this.state.mode ) + 1 ) % order.length ] )
  }
}

export const stylesheet = `
  /* This component's root IS the <button>, so its own styling is
     root-level — a \`button { … }\` rule would look for a descendant one */
  display: inline-flex;
  align-items: center;
  gap: .4rem;
  font: inherit;
  font-size: .82rem;
  font-weight: 550;
  color: var(--text-dim);
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: .28rem .7rem;
  cursor: pointer;
  transition: color .15s, border-color .15s;

  &:hover { color: var(--text); border-color: var(--accent) }

  .glyph { font-size: .95rem; line-height: 1 }
`

export default `
  <button title="Theme" on-click(cycle)>
    <span class="glyph">
      <switch( state.mode )>
        <case is="light">☀️</case>
        <case is="dark">🌙</case>
        <default>🖥️</default>
      </switch>
    </span>
    <span @text=state.mode></span>
  </button>
`
