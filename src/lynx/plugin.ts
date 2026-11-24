/**
 * The Rspeedy plugin (RFC-006 §4.7): Lips stylesheets in a Lynx build.
 *
 *   // lynx.config.ts
 *   import { pluginVanillaLynx } from '@lynx-js/vanilla-rsbuild-plugin'
 *   import { pluginLips } from '@lipsjs/lips/lynx-plugin'
 *
 *   export default defineConfig({ plugins: [ pluginVanillaLynx(), pluginLips() ] })
 *
 * A component sheet is a `*.lips.css` file; its name is the scope.
 *
 *   main-thread.ts   import './app.lips.css'           → flat, class-scoped CSS in the bundle
 *   background.ts    import ir from './app.lips.css?raw'
 *                    renderIR( …, { stylesheet: JSON.parse( ir ) } )   → its binds
 *
 * Lynx cannot add a stylesheet at runtime (§3.7), so the CSS must be in the
 * bundle; the background only needs to know which variables to write. A
 * `?raw` import is Rsbuild's way to get a file as a string, and this plugin
 * makes that string the sheet's IR instead of its source.
 *
 * Import a sheet from a script, not with `@import` from a `.css` file:
 * css-loader requests an `@import` past every configured loader, so it
 * would reach Lynx uncompiled (§4.4, "Found on the way").
 *
 * Any error diagnostic fails the build: a rule that cannot work on Lynx is
 * a bug to fix, not a silent no-op. The plugin also sets the page config
 * the pipeline relies on (`LYNX_PAGE_CONFIG`) on every bundle.
 *
 * Build-time only: it runs in Node, in the build, and ships to no device.
 */
import { compile, serialize, stringify, middleware } from 'stylis'
import { compileLynxStyle, LYNX_PAGE_CONFIG } from './style'

/** What this plugin uses of Rsbuild's plugin API: kept local, so Lips takes no build tool as a dependency */
export interface LipsRsbuildPlugin {
  name: string
  setup( api: any ): void
}

const SHEET = /\.lips\.css$/

/**
 * Lips as installed. Its entries are built for current engines, and
 * Lynx's parse less: the background engine refuses `||=` (tier B). An
 * app's build lowers its own code to its target but leaves
 * `node_modules` as it is, so Lips is added to what it compiles.
 */
const LIPS = /[\\/]@lipsjs[\\/]lips[\\/]dist[\\/]/

/** Lynx flattens nothing itself and drops every `&` rule (§3.1): Stylis flattens first */
const flatten = ( css: string ) => serialize( compile( css ), middleware([ stringify ]) )

/** A sheet's scope: its file name, less `.lips.css` */
const scopeOf = ( path: string ) => path.replace( /^.*[\\/]/, '' ).replace( SHEET, '' )

/** Compile one sheet; any error fails the build, warnings are printed */
export function buildSheet( source: string, path: string ){
  const { ir, diagnostics } = compileLynxStyle( source, { nsp: scopeOf( path ), preprocess: flatten })

  const lines = diagnostics.map( d =>
    `${path}:${d.loc.line}:${d.loc.col} ${d.severity} ${d.code} ${d.message}${d.hint ? `\n  ${d.hint}` : ''}` )
  if( diagnostics.some( d => d.severity === 'error' ) ) throw new Error(`Lips stylesheet:\n${lines.join('\n')}`)
  lines.length && console.warn( lines.join('\n') )

  return ir
}

/**
 * Sets the page config on every bundle, at the template plugin's
 * `beforeEncode`. The template plugin is the one the Lynx build plugin
 * registered, found on the compiler: its hooks are per copy of the
 * package, so importing one here could bind a copy the build never runs.
 */
class PageConfig {
  apply( compiler: any ){
    const Template = compiler.options.plugins.find( ( p: any ) => p?.constructor?.getLynxTemplatePluginHooks )?.constructor
    if( !Template )
      throw new Error('[lips] pluginLips needs a Lynx build plugin before it (pluginVanillaLynx or pluginReactLynx): no Lynx template plugin is registered')

    compiler.hooks.thisCompilation.tap( 'lips:page-config', ( compilation: any ) => {
      Template.getLynxTemplatePluginHooks( compilation ).beforeEncode.tap( 'lips:page-config', ( args: any ) => {
        Object.assign( args.encodeData.sourceContent.config, LYNX_PAGE_CONFIG )
        return args
      })
    })
  }
}

export const pluginLips = (): LipsRsbuildPlugin => ({
  name: 'lips:lynx',
  setup( api ){
    api.modifyRsbuildConfig( ( config: any, { mergeRsbuildConfig }: any ) => mergeRsbuildConfig( config, { source: { include: [ LIPS ] } }) )

    // Ahead of Lynx's own CSS pipeline, which then sees plain CSS
    api.transform({ test: SHEET, resourceQuery: { not: /raw/ }, order: 'pre' },
      ({ code, resourcePath }: { code: string, resourcePath: string }) => buildSheet( code, resourcePath ).css )

    api.transform({ test: SHEET, resourceQuery: /raw/, order: 'pre' },
      ({ code, resourcePath }: { code: string, resourcePath: string }) => JSON.stringify({ ...buildSheet( code, resourcePath ), css: '' }) )

    api.modifyBundlerChain( ( chain: any ) => { chain.plugin('lips:page-config').use( PageConfig ) })
  }
})
