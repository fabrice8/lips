/**
 * Phase 2 IR engine — public surface
 *
 * template string ──parse──▶ AST ──compile──▶ TemplateIR ──render──▶ live DOM
 */
export { parseTemplate, parseSFC } from './parser'
export type { TemplateNode, ElementNode, AttrNode, TemplateDiagnostic, ParseResult, SFCResult } from './parser'

export { parseExpression, extractDeps, compileExpression, interpretExpression } from './expression'
export type { Expr, ExprEnv, ExprDiagnostic, CompiledExpr } from './expression'

export { compileTemplate } from './compiler'
export type { TemplateIR, BlockIR, BindIR, ChildIR, CompInput, CompileResult } from './compiler'

export { compileStyle, setStylePreprocessor, hasStylePreprocessor } from './style'
export type { StyleIR, StyleBindIR, PropertyIR, StyleCompileOptions, StyleCompileResult } from './style'

export { renderIR } from './runtime'
export type { IRInstance, IRComponentDef, RuntimeOptions, RenderSetup } from './runtime'
export type { SwapReport, SwapChange } from './swap'

export { signal, effect, untrack, reactive } from './signal'
