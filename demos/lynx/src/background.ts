/**
 * Background thread: the Lips runtime. The template is compiled HERE, at
 * runtime, from its source string — templates are data — and evaluated
 * in interpreted mode, so nothing depends on `eval` (RFC-006 §4.6).
 */
import { compileTemplate } from '../../../src/ir/compiler'
import { renderIR } from '../../../src/ir/runtime'
import { connectBackground } from '../../../src/lynx/background'
import { TEMPLATE, state, handlers } from './app'

const { ir, diagnostics } = compileTemplate( TEMPLATE, { target: 'tree' })
diagnostics.length && console.warn( '[lips] template diagnostics', diagnostics )

const bg = connectBackground()
renderIR( ir, { state, handlers }, { host: bg.host, mode: 'interpreted' }).mount( bg.root )
