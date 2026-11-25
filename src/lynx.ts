/**
 * The Lynx pass (RFC-006), an entry of its own for a build step: what
 * holds a template and a stylesheet to what Lynx can draw, the same pass
 * Lips's own Lynx build runs.
 *
 *   import { compileLynxTemplate, compileLynxStyle } from '@lipsjs/lips/lynx'
 *   import { stylisPreprocessor } from '@lipsjs/lips/stylis'
 *
 *   const { diagnostics } = compileLynxTemplate( source )
 *   const sheet = compileLynxStyle( css, { nsp: 'app', preprocess: stylisPreprocessor })
 *
 * `compileLynxTemplate` compiles a template for the `'tree'` target with
 * the HTML-shaped vocabulary mapped onto Lynx's elements, and reports what
 * Lynx cannot draw (`LIPS-L1xx`) and the ARIA it cannot read; `lynxVocabulary`
 * is that vocabulary pass on its own. `compileLynxStyle` compiles a sheet
 * for Lynx and lints it against what Lynx's CSS admits (`LIPS-L0xx`).
 *
 * Build-time only, like `./precompile`: the Lynx hosts that run on the
 * main thread and the background thread are not part of it.
 */

export { compileLynxTemplate, lynxVocabulary } from './lynx/template'
export { compileLynxStyle, LYNX_PAGE_CONFIG, type LynxStyleOptions } from './lynx/style'
export { lynxComponents, type LynxComponents } from './lynx/components'
