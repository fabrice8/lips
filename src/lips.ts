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

import { compile, serialize, stringify, middleware } from 'stylis'
import { IRLips, IRFacadeComponent, setCompiler, setStyleCompiler, registerBuiltin } from './ir/facade'
import { compileStyle, setStylePreprocessor } from './ir/style'
import { compileTemplate } from './ir/compiler'
import { routerTemplate } from './ir/router'

/**
 * Full build capabilities. The `./runtime` entry wires none of these,
 * so its bundle tree-shakes the template compiler, Stylis, and the
 * built-in components out entirely.
 */
setCompiler( compileTemplate )
setStyleCompiler( compileStyle )
setStylePreprocessor( css => serialize( compile( css ), middleware([ stringify ]) ) )
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
  reactive
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

export type Component = IRFacadeComponent

export default IRLips
