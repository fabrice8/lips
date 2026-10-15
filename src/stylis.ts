/**
 * Opt-in CSS preprocessor.
 *
 *   import Lips from '@lipsjs/lips'
 *   import { stylisPreprocessor } from '@lipsjs/lips/stylis'
 *
 *   const lips = new Lips({ stylePreprocessor: stylisPreprocessor })
 *
 * and for build-time precompilation:
 *
 *   precompile( template, { name, preprocess: stylisPreprocessor })
 *   lipsPlugin({ preprocess: stylisPreprocessor })
 *
 * WITHOUT it Lips still compiles, scopes and injects stylesheets: the
 * scope wrap `[rel="card"] { … }` is ordinary CSS nesting, which every
 * engine with CSS nesting resolves natively (Chrome/Edge 112+, Safari
 * 16.5+, Firefox 117+), and the compiler itself hoists the at-rules that
 * cannot legally nest (`@keyframes`, `@font-face`, …) and compacts the
 * text.
 *
 * What Stylis adds is FLATTENING: `[rel="card"] .a { … }` instead of a
 * nested block, for engines older than native nesting — where a nested
 * sheet is dropped whole. It also accepts Stylis-only syntax such as
 * `&-suffix` concatenation. It costs ~1.9 KB gzipped, which is why it is
 * a choice rather than a default.
 *
 * It does NOT vendor-prefix — the full build never did. Stylis's
 * `prefixer` emits mostly obsolete prefixes (`-webkit-box`,
 * `-ms-flexbox`, …) and nearly doubles the cost; if you need it anyway:
 *
 *   import { compile, serialize, middleware, prefixer, stringify } from 'stylis'
 *   new Lips({ stylePreprocessor: css => serialize( compile( css ), middleware([ prefixer, stringify ]) ) })
 *
 * NB: it is handed over as a VALUE, never wired by importing this module
 * for its side effect. Each published entry (`@lipsjs/lips`,
 * `@lipsjs/lips/precompile`, this one) is a separate bundle with its own
 * copy of the style compiler, so a global set from one is invisible to
 * the others — passing the function is the only wiring that crosses that
 * boundary.
 */
import { compile, serialize, stringify, middleware } from 'stylis'

/** Hand this to `new Lips({ stylePreprocessor })` or `precompile(…, { preprocess })` */
export const stylisPreprocessor = ( css: string ) =>
                                    serialize( compile( css ), middleware([ stringify ]) )
