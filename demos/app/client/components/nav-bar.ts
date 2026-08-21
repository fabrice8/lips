/**
 * Nav bar — keyed `<for>` over a link list, navigation through
 * `context.navigate` (published by `<router>`), and an active state
 * driven by an input.
 *
 * Registered as `nav-bar`, not `nav`: `nav` is a standard HTML tag, and
 * the compiler resolves known HTML tags as ELEMENTS before it ever looks
 * at the component registry — so a component registered under an HTML
 * tag name silently never renders.
 */
import type { Handler, Metavars } from '../../../../src/types'

export type Link = { path: string, label: string, icon: string }

export type Input = {
  links: Link[]
  /** Path the router last resolved — drives the active pill */
  current: string
}
type Context = {
  navigate: ( path: string ) => void
}

export const context = ['navigate']

export const handler: Handler<Metavars<Input, {}, {}, Context>> = {
  go( path: string ){
    this.context.navigate?.( path )
  }
}

export const stylesheet = `
  /* Root-level: the element carrying rel= is not a descendant of itself */
  display: flex;
  gap: .1rem;
  flex-wrap: wrap;
  align-items: center;

  button {
    display: inline-flex;
    align-items: center;
    gap: .35rem;
    font: inherit;
    font-size: .84rem;
    font-weight: 550;
    color: var(--text-dim);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 999px;
    padding: .28rem .6rem;
    cursor: pointer;
    transition: color .15s, background .15s, border-color .15s;

    &:hover {
      color: var(--text);
      background: var(--panel-2);
      border-color: var(--border);
    }
  }

  button.active {
    color: var(--accent-ink);
    background: var(--accent);
    border-color: var(--accent);
  }

  .icon { font-size: .95rem; line-height: 1 }

  @media (max-width: 640px) {
    .label { display: none }
    button { padding: .3rem .55rem }
  }
`

export default `
  <div class="nav">
    <for [link] in=input.links by="path">
      <button class="{input.current === link.path ? 'active' : ''}"
              title=link.label
              on-click(go, link.path)>
        <span class="icon" @text=link.icon></span>
        <span class="label" @text=link.label></span>
      </button>
    </for>
  </div>
`
