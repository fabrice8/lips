/**
 * Plugins on Lynx (RFC-008 §4): each component of each plugin, and of what
 * it requires, compiled for Lynx, as `renderIR`'s `components`.
 *
 *   const { components, diagnostics } = lynxComponents([ menu, dialog ])
 *   renderIR( ir, setup, { host: bg.host, components })
 *
 * On Lynx an app renders its compiled IR with `renderIR`, not through
 * `new Lips()`, so `lips.use()` has no instance to install into: this is
 * its counterpart, by the same rules (`../plugins`). What a plugin
 * requires comes first, each plugin once; another plugin of the same
 * name, and a component name something else holds, are refused.
 *
 * A component's `lynx` source, where it has one, is compiled in place of
 * its `default`: where its markup differs by host. A plugin's `install`
 * has no Lips to run against, a component's `stylesheet` cannot be added
 * on Lynx at run time (`./plugin`), and precompiled `ir` is the DOM's:
 * each is refused, not dropped.
 */
import type { Plugin } from '../types'
import { installed } from '../plugins'
import type { IRComponentDef } from '../ir/runtime'
import type { TemplateDiagnostic } from '../ir/parser'
import { compileLynxTemplate } from './template'

export interface LynxComponents {
  components: Record<string, IRComponentDef>
  /** What each component's template reported, by its name */
  diagnostics: Record<string, TemplateDiagnostic[]>
}

export function lynxComponents( plugins: readonly Plugin<any>[] ): LynxComponents {
  const out: LynxComponents = { components: {}, diagnostics: {} }

  for( const { plugin, components } of installed( plugins ) ){
    if( plugin.install ) throw new Error(`[lips] plugin <${plugin.name}> sets itself up with install(), which needs a Lips: on Lynx, compile its components yourself`)

    for( const [ name, t ] of components ){
      if( t.stylesheet ) throw new Error(`[lips] <${name}> of plugin <${plugin.name}> has a stylesheet: Lynx cannot add one at run time, so it goes in the app's build`)

      const src = t.lynx ?? t.default
      if( src === undefined ) throw new Error(`[lips] <${name}> of plugin <${plugin.name}> has no source: precompiled \`ir\` is the DOM's, and Lynx compiles its own`)
      const { ir, diagnostics } = compileLynxTemplate( src, { macros: t.macros })
      out.diagnostics[ name ] = diagnostics
      out.components[ name ] = {
        ir,
        state: t.state,
        statics: t.static ?? t._static,
        context: t.watchContext,
        nsp: name,
        handlers: t.handler as IRComponentDef['handlers'],
        deep: true
      }
    }
  }

  return out
}
