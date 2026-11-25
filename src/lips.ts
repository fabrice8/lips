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

import { IRLips, IRFacadeComponent, setCompiler, setStyleCompiler, setMessageFormat, registerBuiltin, setNameCheck } from './ir/facade'
import { taken } from './ir/tags'
import { messageFormat } from './i18n/engine'
import { compileStyle } from './ir/style'
import { compileTemplate } from './ir/compiler'
import type { Shape } from './types'
import { routerTemplate } from './ir/router'

/**
 * Full build capabilities. The `./runtime` entry wires none of these, so
 * its bundle tree-shakes the template compiler, the built-in components
 * and the MessageFormat 2 engine out entirely (an app there that
 * translates passes `messageFormat` from `@lipsjs/lips/i18n`).
 *
 * Stylis is deliberately NOT wired here. The scope wrap is ordinary CSS
 * nesting and browsers resolve it natively, so the preprocessor only buys
 * support for engines that predate nesting — worth ~1.9 KB gzipped to
 * those who need it, and nothing to everyone else. Opt in by VALUE:
 * `new Lips({ stylePreprocessor })` with `stylisPreprocessor` from
 * `@lipsjs/lips/stylis` (a side-effect import cannot reach this bundle).
 */
setCompiler( compileTemplate )
setStyleCompiler( compileStyle )
setMessageFormat( messageFormat )
setNameCheck( taken )
registerBuiltin( 'router', routerTemplate )

export * from './types'
export { component } from './component'
export type { TemplatePolicy, Refusal, Verdict, Untrusted } from './ir/policy'

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
  NodeIR,
  CompileOptions,
  Host,
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
 * A rendered component: what `render()` and `root()` return, typed by the
 * component it rendered, so `c.state` is not `any`:
 *
 *   const c = lips.render('counter', counter)
 *   c.state.count++            // number
 *
 * Its event bus runs both ways — `c.on('saved', …)` receives what the
 * component emits, and `c.emit('reset')` reaches listeners the component
 * registered with `this.on(…)`. Inbound events do NOT invoke handler
 * methods by name, so what a component accepts stays explicit.
 */
export type Rendered<S extends Shape = Shape> = IRFacadeComponent<S>

/** The Lips instance, generic over the shared context shape */
export type Lips<Context extends Object = Shape<{}>['context']> = IRLips<Context>

export default IRLips
