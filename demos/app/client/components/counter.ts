/**
 * Counter — the smallest component that still touches most of Lips.
 *
 * Shows: typed `Input`/`State`/`Static`, `onInput` re-seeding from a
 * changed input, handler methods with arguments, `this.emit()` out to the
 * parent, a slot (`<{input.renderer}/>`), i18n by stable key, `@format`
 * pluralisation, `self.lang`, and a stylesheet whose progress bar width
 * is a REACTIVE declaration — no `style=` anywhere.
 *
 * Demo type imports come from `src/` because the demo lives in the repo;
 * a published consumer writes `from '@lipsjs/lips'`.
 */
import type { Handler, Metavars } from '../../../../src/types'

export type Input = {
  initial?: number
  limit?: number
  /** Slot body, handed over by the parent — placed with <{input.renderer}/> */
  renderer?: any
}
type State = {
  count: number
  /** Set for one tick when a click is refused, to fire the shake keyframe */
  refused: boolean
}
type Static = {
  fallbackLimit: number
}

export const _static: Static = {
  fallbackLimit: 12
}

export const state: State = {
  count: 0,
  refused: false
}

type MT = Metavars<Input, State, Static>

export const handler: Handler<MT> = {
  /**
   * `onInput` runs on mount AND on every input change, so the counter
   * re-seeds when the parent hands it a new `initial`. `onCreate` would
   * only ever see the first value.
   */
  onInput(){
    this.state.count = Number( this.input.initial ?? 0 )
  },

  limit(){
    return Number( this.input.limit ?? this.static.fallbackLimit )
  },

  /** `on-click(step, 1)` / `on-click(step, -1)` — one handler, an argument */
  step( by: number ){
    const next = this.state.count + by

    if( next < 0 || next > this.limit() ){
      this.state.refused = true
      setTimeout( () => this.state.refused = false, 320 )
      return
    }

    this.state.count = next
    this.emit('update', this.state.count )
  },

  reset(){
    this.state.count = Number( this.input.initial ?? 0 )
    this.emit('update', this.state.count )
  }
}

/**
 * RFC-004 in one sheet: nesting, a pseudo-class, a keyframe, and three
 * reactive declarations. `{…}%` is unit-suffixed, so it compiles to
 * `calc(var(--counter-N) * 1%)` and `--counter-N` is registered as
 * `<number>` — a TYPED custom property rather than an opaque token.
 *
 * NB the `transition` below smooths the bar, but a length driven through
 * `calc(var(…))` does not interpolate continuously in Chrome today — the
 * change lands at the midpoint of the duration. Transitioning the
 * variable itself is the shape that would interpolate, and that needs an
 * author-NAMED property, which only the bare `--x: {expr}` form produces
 * (and that form is not registered). Worth knowing before promising
 * animation to a designer.
 */
export const stylesheet = `
  /**
   * ROOT-LEVEL declarations, deliberately unselected.
   *
   * A sheet is wrapped as \`[rel="counter"] { … }\`, so every SELECTOR in it
   * becomes a descendant selector — and this component's root element is
   * the thing carrying \`rel\`, not a descendant of it. A \`.counter { … }\`
   * rule here would compile to \`[rel="counter"] .counter\` and match
   * nothing. Declarations written at the top level land on the wrap
   * itself, which is how you style your own root.
   */
  display: grid;
  gap: .75rem;
  padding: 1rem 1.1rem;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
  }
  .label { font-weight: 600 }
  .value {
    font-family: var(--mono);
    font-size: 1.6rem;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    color: {state.count >= ( input.limit || static.fallbackLimit ) ? 'var(--ok)' : 'var(--accent)'};
  }

  .track {
    height: 6px;
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 999px;
    overflow: hidden;
  }
  .bar {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--accent), var(--accent-2));
    transition: width .28s cubic-bezier(.2, .8, .2, 1);
    width: {static.fallbackLimit ? ( state.count / ( input.limit || static.fallbackLimit ) ) * 100 : 0}%;
  }

  .row { display: flex; align-items: center; gap: .4rem; flex-wrap: wrap }

  button {
    font: inherit;
    font-weight: 600;
    color: var(--text);
    background: var(--panel-2);
    border: 1px solid var(--border-2);
    border-radius: var(--radius-sm);
    padding: .35rem .7rem;
    cursor: pointer;
    transition: background .15s, border-color .15s, transform .1s;

    &:hover { background: var(--panel); border-color: var(--accent) }
    &:active { transform: translateY(1px) }
  }
  button.step {
    font-family: var(--mono);
    min-width: 2.2rem;
  }

  .hint {
    color: var(--text-dim);
    font-size: .82rem;
  }
  .lang {
    font-family: var(--mono);
    font-size: .7rem;
    color: var(--text-faint);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: .05rem .4rem;
  }

  @keyframes refuse {
    25% { transform: translateX(-4px) }
    75% { transform: translateX(4px) }
  }
  .refused { animation: refuse .3s ease }
`

export default `
  <div class="counter">
    <div class="head">
      <span class="label">
        <!-- Slot: the parent's body renders here, in the PARENT's scope -->
        <if( input.renderer )><{input.renderer}/></if>
        <else>Counter</else>
      </span>
      <span class="value" @text=state.count></span>
    </div>

    <div class="track">
      <div class="{state.refused ? 'bar refused' : 'bar'}"></div>
    </div>

    <div class="row">
      <button class="step" on-click(step, -1)>−</button>
      <button class="step" on-click(step, 1)>+</button>

      <button on-click(reset)>
        <!-- Stable key: reword this label and the translation still holds -->
        <span i18n="counter.reset">Reset</span>
      </button>

      <span class="lang" @text=self.lang></span>
    </div>

    <!-- Parameterised text goes through @format, not through a key alone -->
    <small class="hint" @format="counter.hint, { count: state.count, limit: input.limit || static.fallbackLimit }"></small>
  </div>
`
