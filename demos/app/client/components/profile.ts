/**
 * Profile card — `<async>` with all three arms.
 *
 * The await expression is re-run by an EFFECT, so anything reactive it
 * reads is a retry trigger: bumping `state.nonce` puts the block back
 * through `<loading>` and into `<then>`/`<catch>` again. That is the whole
 * retry mechanism — no imperative refetch call anywhere.
 */
import type { Handler, Metavars } from '../../../../src/types'

export type Input = {
  name?: string
}
type State = {
  nonce: number
  fail: boolean
}
type Context = {
  getUser: ( name: string, fail?: boolean ) => Promise<{ name: string, email: string, role: string }>
}

export const context = ['getUser']

export const state: State = {
  nonce: 0,
  fail: false
}

export const handler: Handler<Metavars<Input, State, {}, Context>> = {
  reload(){
    this.state.fail = false
    this.state.nonce++
  },
  breakIt(){
    this.state.fail = true
    this.state.nonce++
  }
}

export const stylesheet = `
  /* Root-level: the element carrying rel= is not a descendant of itself */
  display: grid;
  gap: .8rem;
  align-content: start;
  padding: 1rem 1.1rem;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);

  .who { display: flex; align-items: center; gap: .75rem }
  .avatar {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    flex: none;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--accent), var(--accent-2));
    color: var(--accent-ink);
    font-weight: 700;
  }
  .name { font-weight: 600 }
  .meta { color: var(--text-dim); font-size: .85rem }

  .role {
    justify-self: start;
    font-family: var(--mono);
    font-size: .7rem;
    text-transform: uppercase;
    letter-spacing: .05em;
    color: var(--ok);
    background: color-mix(in srgb, var(--ok) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--ok) 35%, transparent);
    border-radius: 999px;
    padding: .1rem .5rem;
  }

  .error {
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent);
    border-radius: var(--radius-sm);
    padding: .6rem .75rem;
    font-size: .88rem;
  }

  .row { display: flex; gap: .4rem; flex-wrap: wrap }
  button {
    font: inherit;
    font-size: .85rem;
    font-weight: 550;
    color: var(--text);
    background: var(--panel-2);
    border: 1px solid var(--border-2);
    border-radius: var(--radius-sm);
    padding: .3rem .65rem;
    cursor: pointer;
    &:hover { border-color: var(--accent) }
  }

  /* Skeleton shimmer — a keyframe is unreachable from style=, RFC-004 §1 */
  .skeleton { display: grid; gap: .55rem }
  .skeleton i {
    display: block;
    height: 12px;
    border-radius: 6px;
    background: linear-gradient(90deg, var(--panel-2), var(--border), var(--panel-2));
    background-size: 200% 100%;
    animation: shimmer 1.1s linear infinite;
  }
  .skeleton i:first-child { width: 55%; height: 16px }
  .skeleton i:last-child { width: 75% }

  @keyframes shimmer {
    from { background-position: 200% 0 }
    to { background-position: -200% 0 }
  }
`

export default `
  <div class="card">
    <async await( context.getUser( input.name || 'Ada Lovelace', state.fail, state.nonce ) )>
      <loading>
        <div class="skeleton"><i></i><i></i></div>
      </loading>

      <then [user]>
        <div class="who">
          <span class="avatar" @text=user.name.slice( 0, 1 )></span>
          <span>
            <span class="name" @text=user.name></span><br>
            <small class="meta" @text=user.email></small>
          </span>
        </div>
        <span class="role" @text=user.role></span>
      </then>

      <catch [error]>
        <p class="error">⚠ <span @text=error></span></p>
      </catch>
    </async>

    <div class="row">
      <button on-click(reload)>Reload</button>
      <button on-click(breakIt)>Force error</button>
    </div>
  </div>
`
