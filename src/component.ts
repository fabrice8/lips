/**
 * `component()` — a component written apart from where it is used, its
 * types inferred.
 *
 * Written in a `register`, `render` or `root` call, a component needs
 * nothing: those calls infer it themselves. Written apart — its own `.ts`
 * file, a route table — its handlers' `this` is fixed where it is written,
 * before any of them sees it, and this is what types it there.
 *
 * Returns what it is given: the object is the component, as it always
 * was. All it adds is types: `state` and `static` read from their values,
 * the handlers from themselves, and `this` in every handler from all
 * three, its sibling handlers included.
 *
 *   const counter = component({
 *     state: { count: 0 },
 *     handler: {
 *       step( by: number ){ this.state.count += by },
 *       reset(){ this.step( -this.state.count ) }
 *     },
 *     default: `<button on-click(step, 1)>{state.count}</button>`
 *   })
 *
 * What no value shows is named, by part, in a first call: the `input` a
 * parent hands it, a `state` whose start says too little (`null`, `[]`),
 * or a `context` other than the app's `SharedContext`:
 *
 *   component<{ input: { initial?: number }, state: { picked: string | null } }>()({ … })
 */
import type { TypedComponent, Definition, Inferred, Parts } from './types'

export function component<P extends Parts>(): <State extends object = {}, Static extends object = {}, Methods = {}>(
  definition: Definition<Inferred<P, State, Static>, Methods>
) => TypedComponent<Inferred<P, State, Static>>

export function component<State extends object = {}, Static extends object = {}, Methods = {}>(
  definition: Definition<Inferred<{}, State, Static>, Methods>
): TypedComponent<Inferred<{}, State, Static>>

export function component( definition?: object ){
  return definition ? definition : ( named: object ) => named
}
