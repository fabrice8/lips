/**
 * Rendered by the shell when `<router>` emits `not-found`. A component,
 * not a route: there is no route to match, which is the whole point.
 */
import type { Handler, Metavars } from '../../../../src/types'

export type Input = {
  path: string
}
type Context = {
  navigate: ( path: string ) => void
}

export const context = ['navigate']

export const handler: Handler<Metavars<Input, {}, {}, Context>> = {
  go( path: string ){ this.context.navigate?.( path ) }
}

export const stylesheet = `
  /* Root-level: the element carrying rel= is not a descendant of itself */
  display: grid;
  gap: .6rem;
  justify-items: start;
  padding: 1.6rem 1.25rem;
  background: var(--panel);
  border: 1px solid color-mix(in srgb, var(--warn) 35%, var(--border));
  border-radius: var(--radius);

  .code {
    font-family: var(--mono);
    font-size: 2.2rem;
    line-height: 1;
    color: var(--warn);
  }
  .path {
    font-family: var(--mono);
    font-size: .9rem;
    color: var(--text-dim);
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: .2rem .5rem;
  }
`

export default `
  <div class="miss">
    <span class="code">404</span>
    <p style="margin: 0">No route matched — the router emitted <code>not-found</code>.</p>
    <span class="path" @text=input.path></span>
    <button class="act" on-click(go, '/')>Back to overview</button>
  </div>
`
