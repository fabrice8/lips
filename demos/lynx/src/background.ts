/**
 * Background thread: the Lips runtime. The template is compiled HERE, at
 * runtime, from its source string — templates are data — and evaluated
 * in interpreted mode, so nothing depends on `eval` (RFC-006 §4.6).
 * `compileLynxTemplate` adapts the HTML-shaped vocabulary (RFC-006 §4.3).
 */
import { compileLynxTemplate } from '../../../src/lynx/template'
import { renderIR } from '../../../src/ir/runtime'
import { connectBackground } from '../../../src/lynx/background'
import { TEMPLATE, state, handlers } from './app'
// The sheet's binds; its CSS is already in the bundle (../lips-styles.ts)
import sheet from './app.lips.css?raw'

const { ir, diagnostics } = compileLynxTemplate( TEMPLATE )
diagnostics.length && console.warn( '[lips] template diagnostics', diagnostics )

const bg = connectBackground()
renderIR( ir, { state, handlers, stylesheet: JSON.parse( sheet ) }, { host: bg.host, mode: 'interpreted' }).mount( bg.root )
