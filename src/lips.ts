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

import { IRLips, IRFacadeComponent, setCompiler } from './ir/facade'
import { compileTemplate } from './ir/compiler'

// Full build: runtime template compilation available
setCompiler( compileTemplate )

export * from './types'

export {
  parseTemplate,
  parseSFC,
  compileTemplate,
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
