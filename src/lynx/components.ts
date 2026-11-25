/**
 * Plugins on Lynx (RFC-008 §4): each component of each plugin, and of what
 * it requires, compiled for Lynx, as `renderIR`'s `components`.
 *
 *   const { components, diagnostics } = lynxComponents([ menu, dialog ])
 *   renderIR( ir, setup, { host: bg.host, components })
 *
 * On Lynx an app renders its compiled IR with `renderIR`, not through
 * `new Lips()`, so `lips.use()` has no instance to install into: this is
 * its counterpart, by the same rules. What a plugin requires comes first,
 * each plugin once; another plugin of the same name, and a component name
 * something else holds, are refused.
 *
 * A component's `lynx` source, where it has one, is compiled in place of
 * its `default`: where its markup differs by host. A plugin's `install`
 * has no Lips to run against, a component's `stylesheet` cannot be added
 * on Lynx at run time (`./plugin`), and precompiled `ir` is the DOM's:
 * each is refused, not dropped.
 */
import type { Plugin, Component } from '../types'
import type { IRComponentDef } from '../ir/runtime'
import type { TemplateDiagnostic } from '../ir/parser'
import { compileLynxTemplate } from './template'

export interface LynxComponents {
  components: Record<string, IRComponentDef>
  /** What each component's template reported, by its name */
  diagnostics: Record<string, TemplateDiagnostic[]>
}

export function lynxComponents( plugins: readonly Plugin<any>[] ): LynxComponents {
  const seen = new Map<string, Plugin<any>>(), held = new Map<string, Component<any>>()
  const out: LynxComponents = { components: {}, diagnostics: {} }

  const add = ( plugin: Plugin<any> ) => {
    const had = seen.get( plugin.name )
    if( had && had !== plugin ) throw new Error(`[lips] two plugins named <${plugin.name}>: one is compiled already`)
    if( had ) return
    // Marked before what it requires, so a cycle ends
    seen.set( plugin.name, plugin )
    plugin.requires?.forEach( add )

    if( plugin.install ) throw new Error(`[lips] plugin <${plugin.name}> sets itself up with install(), which needs a Lips: on Lynx, compile its components yourself`)

    for( const [ name, t ] of Object.entries( plugin.components || {} ) ){
      if( held.has( name ) && held.get( name ) !== t ) throw new Error(`[lips] <${name}> of plugin <${plugin.name}> is compiled already, from something else`)
      if( t.stylesheet ) throw new Error(`[lips] <${name}> of plugin <${plugin.name}> has a stylesheet: Lynx cannot add one at run time, so it goes in the app's build`)
      held.set( name, t )

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
  plugins.forEach( add )

  return out
}
