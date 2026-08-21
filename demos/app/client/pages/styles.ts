/**
 * Styles page — the cases `style=` cannot reach.
 *
 * Every value below is a live expression inside a SCOPED sheet: one
 * `<style>` per component type, per-instance values carried on custom
 * properties written to each instance's own root. A unit-suffixed slot
 * compiles to `calc(var(--x) * 1unit)` and registers `--x` as a typed
 * `<number>` via `@property`.
 *
 * Registration is what a smooth transition through the variable would
 * need, but it is not sufficient on its own: a length computed from
 * `calc(var(…))` still changes discretely in Chrome. Treat the
 * `transition` declarations here as smoothing, not as interpolation.
 */
import type { Handler, Metavars } from '../../../../src/types'

export const name = 'page-styles'

type State = {
  hue: number
  size: number
  gap: number
  glow: number
  cols: number
}
type Context = {
  theme: string
}

export const state: State = {
  hue: 330,
  size: 64,
  gap: 12,
  glow: 18,
  cols: 3
}

export const context = ['theme']

export const handler: Handler<Metavars<{}, State, {}, Context>> = {
  set( key: keyof State, e: any ){
    this.state[ key ] = Number( e.target.value )
  }
}

export const stylesheet = `
  /* A bare custom property binds the AUTHOR's name — readable in devtools,
     and inherited by children (RFC-004 §7.4) */
  --accent-live: {'hsl(' + state.hue + ' 85% 60%)'};

  .controls {
    display: grid;
    gap: .7rem;
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    margin-bottom: 1.1rem;
  }
  .controls label {
    display: grid;
    gap: .2rem;
    font-size: .78rem;
    font-weight: 600;
    color: var(--text-faint);
    text-transform: uppercase;
    letter-spacing: .05em;
  }
  .controls input { accent-color: var(--accent-live); width: 100% }
  .controls .v { font-family: var(--mono); color: var(--text-dim); text-transform: none; letter-spacing: 0 }

  /* ---- reactive declarations, one per feature the sheet unlocks ---- */

  .stage {
    display: grid;
    grid-template-columns: repeat({state.cols}, 1fr);
    gap: {state.gap}px;
    padding: 1rem;
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }

  .blob {
    display: grid;
    place-items: center;
    height: {state.size}px;
    border-radius: {state.size / 4}px;
    background: var(--accent-live);
    color: #fff;
    font-family: var(--mono);
    font-size: .72rem;
    box-shadow: 0 0 {state.glow}px var(--accent-live);
    transition: height .25s ease, border-radius .25s ease, box-shadow .25s ease;
  }

  /* :hover — unreachable from style= */
  .blob:hover {
    box-shadow: 0 0 {state.glow * 2.5}px var(--accent-live);
    filter: saturate(1.4);
  }

  /* @keyframes reading a live value — also unreachable from style= */
  @keyframes breathe {
    50% { transform: scale({1 + state.glow / 200}) }
  }
  .blob:nth-child(odd) { animation: breathe 2.4s ease-in-out infinite }

  /* @media with a static condition and a live declaration inside */
  @media (max-width: 640px) {
    .stage { grid-template-columns: repeat({Math.min( 2, state.cols )}, 1fr) }
  }

  /* A ternary off context — the colon is fine because a ? precedes it */
  .theme-note {
    margin-top: .9rem;
    font-size: .85rem;
    color: {context.theme === 'dark' ? 'var(--accent-2)' : 'var(--accent)'};
  }

  .cannot {
    margin: 0;
    padding-left: 1.1rem;
    font-size: .87rem;
    color: var(--text-dim);
    li { margin: .2rem 0 }
    code { font-size: .82em }
  }
`

export default `
  <div>
    <h1>Reactive stylesheets</h1>
    <p class="lede">
      The sheet is immutable once injected; updates write custom properties on this
      component's own root. One shared rule, N per-instance values.
    </p>

    <section class="panel">
      <header>
        <h2>Live declarations</h2>
        <span class="tag">{'height: {state.size}px'} → calc(var(--page-styles-N) * 1px)</span>
      </header>

      <div class="controls">
        <label>hue <span class="v">{state.hue}</span>
          <input type="range" min="0" max="360" value=state.hue on-input(set, 'hue')></label>
        <label>size <span class="v">{state.size}px</span>
          <input type="range" min="28" max="120" value=state.size on-input(set, 'size')></label>
        <label>gap <span class="v">{state.gap}px</span>
          <input type="range" min="0" max="40" value=state.gap on-input(set, 'gap')></label>
        <label>glow <span class="v">{state.glow}px</span>
          <input type="range" min="0" max="60" value=state.glow on-input(set, 'glow')></label>
        <label>columns <span class="v">{state.cols}</span>
          <input type="range" min="1" max="6" value=state.cols on-input(set, 'cols')></label>
      </div>

      <div class="stage">
        <for [n] from="1" to={ state.cols * 2 }>
          <span class="blob">{n}</span>
        </for>
      </div>

      <p class="theme-note">
        This line's colour is a ternary over <code>context.theme</code> — currently
        <b @text=context.theme></b>. Flip the theme in the header and it re-resolves.
      </p>
    </section>

    <section class="panel">
      <header>
        <h2>Why not style=</h2>
        <span class="tag">RFC-004 §1</span>
      </header>

      <ul class="cannot">
        <li><code>:hover</code> — hover the blobs above; the glow expression doubles</li>
        <li><code>@keyframes</code> — the odd blobs breathe by a live scale factor</li>
        <li><code>@media</code> — narrow the window; the grid clamps to 2 columns</li>
        <li>one rule shared by every instance, instead of a style attribute per node</li>
      </ul>

      <p class="faint" style="margin-top: .7rem">
        An element's <code>style=</code> takes CSS <em>text</em>, and a <code>{'{…}'}</code> in it is
        an interpolation slot — so an object literal there is dead code. The compiler now says so
        with <code>LIPS-C019</code> instead of complaining about a stray colon.
      </p>
    </section>
  </div>
`
