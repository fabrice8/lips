/**
 * Route page — path params. `<router>` places the matched template through
 * a dynamic tag and hands the match down as inputs.
 */
import type { Handler, Metavars } from '../../../../src/types'

export const name = 'page-product'

export type Input = {
  params: { id: string }
  query: Record<string, string>
}
type Context = {
  navigate: ( path: string ) => void
}

export const context = ['navigate']

export const handler: Handler<Metavars<Input, {}, {}, Context>> = {
  go( path: string ){ this.context.navigate?.( path ) }
}

export const stylesheet = `
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: .35rem .9rem;
    margin: 0;
    align-items: baseline;
  }
  dt { font-size: .78rem; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--text-faint) }
  dd { margin: 0; font-family: var(--mono) }
  dd.empty { color: var(--text-faint); font-family: var(--sans); font-style: italic }
`

export default `
  <div>
    <h1>Product</h1>
    <p class="lede">The URL is the state — reload this page and the same values come back.</p>

    <section class="panel">
      <header>
        <h2>Match</h2>
        <span class="tag">path: '/product/:id'</span>
      </header>

      <dl>
        <dt>params.id</dt>
        <dd @text=input.params.id></dd>

        <dt>query.category</dt>
        <if( input.query.category )>
          <dd @text=input.query.category></dd>
        </if>
        <else>
          <dd class="empty">not set</dd>
        </else>
      </dl>
    </section>

    <div class="row">
      <button class="ghost" on-click(go, '/product/42?category=laptop')>Another product</button>
      <button class="act" on-click(go, '/')>Back to overview</button>
    </div>
  </div>
`
