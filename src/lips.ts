/**
 * Lips — fast, lightweight, runtime reactive UI framework.
 *
 * Pipeline (no build step required):
 *
 *   template string ──parse──▶ AST ──compile──▶ TemplateIR ──render──▶ DOM
 *
 * Updates are fine-grained: a state write notifies only the bindings
 * that read that key. Templates can also be precompiled to IR at build
 * time (see `compileTemplate`) for CSP-safe, parse-free startup.
 */

import { IRLips, IRFacadeComponent, setCompiler, setStyleCompiler, registerBuiltin } from './ir/facade'
import { compileStyle } from './ir/style'
import { compileTemplate } from './ir/compiler'
import type { Metavars } from './types'
import { routerTemplate } from './ir/router'

/**
 * Full build capabilities. The `./runtime` entry wires none of these, so
 * its bundle tree-shakes the template compiler and the built-in
 * components out entirely.
 *
 * Stylis is deliberately NOT wired here. The scope wrap is ordinary CSS
 * nesting and browsers resolve it natively, so the preprocessor buys
 * vendor prefixing and pre-2023 engine support — worth ~1.9 KB gzipped
 * to those who need it, and nothing to everyone else. Opt in with
 * `import '@lipsjs/lips/stylis'`.
 */
setCompiler( compileTemplate )
setStyleCompiler( compileStyle )
registerBuiltin( 'router', routerTemplate )

export * from './types'

export {
  parseTemplate,
  parseSFC,
  compileTemplate,
  compileStyle,
  renderIR,
  signal,
  effect,
  untrack,
  reactive,
  batch
} from './ir'

export type {
  TemplateIR,
  BlockIR,
  BindIR,
  ChildIR,
  CompileResult,
  StyleIR,
  StyleBindIR,
  StyleCompileResult,
  TemplateDiagnostic,
  IRInstance,
  IRComponentDef,
  RuntimeOptions,
  RenderSetup,
  SwapReport,
  SwapChange
} from './ir'

/**
 * A rendered component handle. Generic over the same `Metavars` the
 * template declares, so `component.state` is typed, not `any`:
 *
 *   type MT = Metavars<{ tone: string }, { count: number }>
 *   const c: Component<MT> = lips.render<MT>('counter', counter)
 *   c.state.count++            // number
 *
 * Its event bus runs both ways — `c.on('saved', …)` receives what the
 * component emits, and `c.emit('reset')` reaches listeners the component
 * registered with `this.on(…)`. Inbound events do NOT invoke handler
 * methods by name, so what a component accepts stays explicit.
 */
export type Component<MT extends Metavars = Metavars> = IRFacadeComponent<MT>

/** The Lips instance, generic over the shared context shape */
export type Lips<Context extends Object = Record<string, any>> = IRLips<Context>

export default IRLips
