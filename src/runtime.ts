/**
 * Precompiled-only entry: the runtime WITHOUT the template parser
 * and compiler.
 *
 *   import Lips from '@lipsjs/lips/runtime'
 *
 * Templates must carry precompiled `ir` (see `precompile()` or the
 * bundler plugin). Combined with `mode: 'interpreted'` this build
 * never constructs a Function, so it runs under a strict CSP.
 */
import { IRLips } from './ir/facade'

export * from './types'
export { renderIR } from './ir/runtime'
export { signal, effect, untrack, reactive } from './ir/signal'
export type { TemplateIR, IRInstance, RuntimeOptions, RenderSetup, SwapReport } from './ir'

export default IRLips
