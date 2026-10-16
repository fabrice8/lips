/**
 * Lips stylesheets in a Lynx build (RFC-006 §4.4, §4.7) — a sketch of the
 * CSS route of the eventual `@lipsjs/lips/lynx-plugin`, kept with the demo
 * until packaging is decided (§9.3).
 *
 * A component sheet is a `*.lips.css` file; its name is the scope.
 *
 *   style.css        @import './app.lips.css';      → flat, class-scoped CSS in the bundle
 *   background.ts    import ir from './app.lips.css?raw'
 *                    renderIR( …, { stylesheet: JSON.parse( ir ) } )   → its binds
 *
 * Lynx cannot add a stylesheet at runtime (§3.7), so the CSS must be in the
 * bundle; the background only needs to know which variables to write. A
 * `?raw` import is Rsbuild's way to get a file as a string, and this plugin
 * makes that string the sheet's IR instead of its source.
 *
 * Any error diagnostic fails the build: a rule that cannot work on Lynx is
 * a bug to fix, not a silent no-op.
 */
import { basename } from 'node:path'
import type { RsbuildPlugin } from '@rsbuild/core'
import { LynxTemplatePlugin } from '@lynx-js/template-webpack-plugin'
import { compile, serialize, stringify, middleware } from 'stylis'
import { createJiti } from 'jiti'

/**
 * Lips's sources, as TypeScript. Rspeedy loads its config with Node's own
 * loader, which needs file extensions; Lips imports without them.
 */
const { compileLynxStyle, LYNX_PAGE_CONFIG } =
  await createJiti( import.meta.url ).import<typeof import('../../src/lynx/style')>('../../src/lynx/style')

const flatten = ( css: string ) => serialize( compile( css ), middleware([ stringify ]) )

const SHEET = /\.lips\.css$/

function build( source: string, path: string ){
  const { ir, diagnostics } = compileLynxStyle( source, { nsp: basename( path ).replace( SHEET, '' ), preprocess: flatten })

  const lines = diagnostics.map( d =>
    `${path}:${d.loc.line}:${d.loc.col} ${d.severity} ${d.code} ${d.message}${d.hint ? `\n  ${d.hint}` : ''}` )
  if( diagnostics.some( d => d.severity === 'error' ) ) throw new Error(`Lips stylesheet:\n${lines.join('\n')}`)
  lines.length && console.warn( lines.join('\n') )

  return ir
}

/** Sets the page config the pipeline relies on, on every bundle */
class PageConfig {
  apply( compiler: any ){
    compiler.hooks.thisCompilation.tap( 'lips:page-config', ( compilation: any ) => {
      LynxTemplatePlugin.getLynxTemplatePluginHooks( compilation ).beforeEncode.tap( 'lips:page-config', ( args: any ) => {
        Object.assign( args.encodeData.sourceContent.config, LYNX_PAGE_CONFIG )
        return args
      })
    })
  }
}

export const pluginLipsStyles = (): RsbuildPlugin => ({
  name: 'lips:styles',
  setup( api ){
    // Ahead of Lynx's own CSS pipeline, which then sees plain CSS
    api.transform({ test: SHEET, resourceQuery: { not: /raw/ }, order: 'pre' },
      ({ code, resourcePath }) => build( code, resourcePath ).css )

    api.transform({ test: SHEET, resourceQuery: /raw/, order: 'pre' },
      ({ code, resourcePath }) => JSON.stringify({ ...build( code, resourcePath ), css: '' }) )

    api.modifyBundlerChain( chain => { chain.plugin('lips:page-config').use( PageConfig ) })
  }
})
