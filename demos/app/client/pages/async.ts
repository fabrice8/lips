/**
 * Async page — `<async>` with all three arms, and the router's own
 * params/query pages linked from here.
 */
import type { Handler, Metavars } from '../../../../src/types'

export const name = 'page-async'

type State = {
  who: string
  nonce: number
}
type Context = {
  navigate: ( path: string ) => void
}

export const state: State = {
  who: 'Ada Lovelace',
  nonce: 0
}

export const context = ['navigate']

export const handler: Handler<Metavars<{}, State, {}, Context>> = {
  onWho( e: any ){ this.state.who = e.target.value },
  refetch(){ this.state.nonce++ },
  go( path: string ){ this.context.navigate?.( path ) }
}

export const stylesheet = `
  .side-by-side { display: grid; gap: .9rem; grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr)) }
  .note {
    font-size: .86rem;
    color: var(--text-dim);
    border-left: 2px solid var(--border-2);
    padding-left: .7rem;
    margin: .6rem 0 0;
  }
`

export default `
  <div>
    <h1>Async</h1>
    <p class="lede">
      One block holds the pending, resolved and failed states. The await expression runs
      inside an <em>effect</em>, so anything reactive it reads becomes a retry trigger.
    </p>

    <section class="panel">
      <header>
        <h2>Loading → resolved → failed</h2>
        <span class="tag">&lt;async await( … )&gt;&lt;loading&gt;&lt;then [v]&gt;&lt;catch [e]&gt;</span>
      </header>

      <div class="row" style="margin-bottom: .9rem">
        <input type="text" value=state.who on-input(onWho) placeholder="Name to look up…">
        <button class="ghost" on-click(refetch)>Refetch outer</button>
      </div>

      <div class="side-by-side">
        <profile name=state.who></profile>
        <profile name="Grace Hopper"></profile>
      </div>

      <p class="note">
        Each card owns its own <code>nonce</code>, so “Reload” re-runs only that card's await.
        “Force error” makes the same provider reject, which is what routes rendering into
        <code>&lt;catch&gt;</code>.
      </p>
    </section>

    <section class="panel">
      <header>
        <h2>Router: params and query</h2>
        <span class="tag">path: '/product/:id'</span>
      </header>

      <p class="dim">
        A page receives the match as inputs — <code>input.params</code> and
        <code>input.query</code> — because <code>&lt;router&gt;</code> is an ordinary component
        that places the matched template through a dynamic tag.
      </p>

      <div class="row">
        <button class="act" on-click(go, '/product/00009?category=phone')>/product/00009?category=phone</button>
        <button class="ghost" on-click(go, '/account?userid=1001')>/account?userid=1001</button>
        <button class="ghost" on-click(go, '/nowhere')>/nowhere (not-found)</button>
      </div>
    </section>
  </div>
`
