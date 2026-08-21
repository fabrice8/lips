/**
 * Opt-in CSS preprocessor.
 *
 *   import Lips from '@lipsjs/lips'
 *   import { stylisPreprocessor } from '@lipsjs/lips/stylis'
 *
 *   const lips = new Lips({ stylePreprocessor: stylisPreprocessor })
 *
 * WITHOUT it Lips still compiles, scopes and injects stylesheets: the
 * scope wrap `[rel="card"] { … }` is ordinary CSS nesting, which every
 * engine since 2023 resolves natively, and the compiler hoists the
 * at-rules that cannot legally nest (`@keyframes`, `@font-face`, …) out
 * of the wrap itself.
 *
 * What Stylis adds on top:
 *
 *  - vendor prefixing (`-webkit-`, `-moz-`, `-ms-`)
 *  - flattening, for engines older than native nesting
 *  - minification of the emitted sheet
 *
 * It costs ~1.9 KB gzipped, which is why it is a choice rather than a
 * default.
 *
 * NB: it is handed to Lips as a VALUE, not wired by importing this
 * module for its side effect. `@lipsjs/lips` and `@lipsjs/lips/stylis`
 * are separate bundles with separate module state, so a global set from
 * one is invisible to the other — passing the function is the only
 * wiring that crosses that boundary. `setStylePreprocessor` is still
 * exported for build scripts that bundle Lips from source, where there
 * is a single module graph.
 */
import { compile, serialize, stringify, middleware } from 'stylis'
import { setStylePreprocessor } from './ir/style'

/** Hand this to `new Lips({ stylePreprocessor })` */
export const stylisPreprocessor = ( css: string ) =>
                                    serialize( compile( css ), middleware([ stringify ]) )

/**
 * Process-wide default, for a single-module-graph setup — notably a
 * build script calling `precompile()`, which takes no Lips config.
 */
export function useStylis(){ setStylePreprocessor( stylisPreprocessor ) }

export { setStylePreprocessor } from './ir/style'
