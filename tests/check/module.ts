/**
 * A component written as module exports, its handler typed by hand:
 * `lips-check` holds each handler's own parameters (tests/check.spec.ts).
 */
import type { Handlers, Shape } from '../../src/types'

type State = { count: number, history: number[] }
type Input = { step?: number }

export const state: State = { count: 0, history: [] }
export const _static = { max: 10 }

export const handler: Handlers<Shape<{ input: Input, state: State, static: { max: number } }>> = {
  add( by: number ){ this.state.count += by },
  reset(){ this.state.count = 0 }
}

export default `
  <div>
    <button on-click(add, input.step ?? 1)>+</button>
    <button on-click(reset)>{state.count} / {static.max}</button>
    <for [n, at] in=state.history>{n.toFixed( at )}</for>
    <button on-click(add, 'two')>wrong argument</button>
    <button on-click(rest)>no such handler</button>
    <p>{input.stpe}</p>
  </div>
`
