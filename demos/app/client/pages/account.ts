/**
 * Route page — query string only, no path params.
 */
import type { Handler, Metavars } from '../../../../src/types'

export const name = 'page-account'

export type Input = {
  params: Record<string, string>
  query: { userid?: string }
}
type Context = {
  navigate: ( path: string ) => void
}

export const context = ['navigate']

export const handler: Handler<Metavars<Input, {}, {}, Context>> = {
  go( path: string ){ this.context.navigate?.( path ) }
}

export const stylesheet = `
  .id {
    font-family: var(--mono);
    font-size: 1.6rem;
    color: var(--accent);
  }
  .missing { color: var(--warn) }
`

export default `
  <div>
    <h1>Account</h1>
    <p class="lede">Query parameters are decoded by <code>URLSearchParams</code>, so <code>+</code>,
      percent-escapes and values containing <code>=</code> all survive.</p>

    <section class="panel">
      <header>
        <h2>query.userid</h2>
        <span class="tag">path: '/account'</span>
      </header>

      <if( input.query.userid )>
        <p class="id" @text=input.query.userid></p>
      </if>
      <else>
        <p class="missing">No <code>userid</code> in the query string.</p>
      </else>

      <div class="row">
        <button class="ghost" on-click(go, '/account?userid=1001')>userid=1001</button>
        <button class="ghost" on-click(go, '/account?userid=Ada%20L')>userid=Ada%20L</button>
        <button class="ghost" on-click(go, '/account')>no query</button>
      </div>
    </section>

    <button class="act" on-click(go, '/')>Back to overview</button>
  </div>
`
