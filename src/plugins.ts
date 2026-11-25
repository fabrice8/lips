/**
 * Plugins compiled ahead of `use()` (RFC-008 §4): each plugin and what it
 * requires, in the order `lips.use()` installs them — what a plugin
 * requires first, each plugin once, a cycle ended — with the components
 * each brings. `lynxComponents()` (`./lynx`) and `precompilePlugins()`
 * (`./precompile`) both walk them so, by the same rules `use()` holds to:
 * another plugin of the same name, and a component name something else
 * holds, are refused.
 */
import type { Plugin, Component } from './types'

export interface Installed {
  plugin: Plugin<any>
  components: [ string, Component<any> ][]
}

export function installed( plugins: readonly Plugin<any>[] ): Installed[] {
  const seen = new Map<string, Plugin<any>>(), held = new Map<string, Component<any>>()
  const out: Installed[] = []

  const add = ( plugin: Plugin<any> ) => {
    const had = seen.get( plugin.name )
    if( had && had !== plugin ) throw new Error(`[lips] two plugins named <${plugin.name}>: one is compiled already`)
    if( had ) return
    // Marked before what it requires, so a cycle ends
    seen.set( plugin.name, plugin )
    plugin.requires?.forEach( add )

    const components = Object.entries( plugin.components || {} )
    for( const [ name, t ] of components ){
      if( held.has( name ) && held.get( name ) !== t ) throw new Error(`[lips] <${name}> of plugin <${plugin.name}> is compiled already, from something else`)
      held.set( name, t )
    }
    out.push({ plugin, components })
  }
  plugins.forEach( add )

  return out
}
