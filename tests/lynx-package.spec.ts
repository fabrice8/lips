/**
 * RFC-006 §4.7, §9.3 — the Lynx binding as published (lips#38), test tier A.
 *
 * An app reaches Lips's Lynx pieces through four subpath entries of
 * `@lipsjs/lips`: `./lynx` (the build-time pass), `./lynx/main` (the
 * applier), `./lynx/background` (the background host) and
 * `./lynx-plugin` (the Rspeedy plugin). These specs hold:
 *
 *  - the demo to them: it imports Lips by its published names and
 *    nothing from `src/`, so every tier builds what an app would install
 *    (`demos/lynx/pack.sh` installs the packed tarball);
 *  - the export map to the build: each entry is a file the build writes,
 *    with declarations from a source that exists;
 *  - the plugin to its three jobs: sheets compiled (errors fail the
 *    build), Lips's own files lowered with the app's code, and the page
 *    config set through the template plugin the build registered.
 */
import { describe, it, expect, vi } from 'vitest'
import { pluginLips, buildSheet } from '../src/lynx/plugin'
import { LYNX_PAGE_CONFIG } from '../src/lynx/style'

const pkg = JSON.parse( Object.values( import.meta.glob( '../package.json', { query: '?raw', import: 'default', eager: true }) )[ 0 ] as string )
/** The sources there are, by path from here */
const SOURCES = new Set( Object.keys( import.meta.glob( '../src/**/*.ts', { query: '?raw', import: 'default', eager: true }) ) )

/** The demo's own code: its sources and its build config */
const DEMO = {
  ...import.meta.glob( '../demos/lynx/src/*.ts', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob( '../demos/lynx/lynx.config.ts', { query: '?raw', import: 'default', eager: true })
} as Record<string, string>

/** Every module specifier a source names: `import … from 'x'`, `import 'x'`, `import( 'x' )` */
const specifiers = ( src: string ) =>
  [ ...src.matchAll( /\bimport\s*(?:[^'"()]*?\bfrom\s*)?\(?\s*['"]([^'"]+)['"]/g ) ].map( m => m[ 1 ] )

describe('the demo builds from the published entries only', () => {
  it('imports Lips by its published names, and nothing outside the demo', () => {
    expect( Object.keys( DEMO ).length ).toBe( 4 )

    const named = Object.entries( DEMO ).flatMap( ( [ file, src ] ) => specifiers( src ).map( s => [ file, s ] ) )
    // Relative imports stay in the demo's own folder
    expect( named.filter( ( [ , s ] ) => s.startsWith('.') && !s.startsWith('./') ) ).toEqual([])
    expect( named.filter( ( [ , s ] ) => /(^|\/)src\// .test( s ) && !s.startsWith('./') ) ).toEqual([])

    // Every Lips import is an entry the package publishes
    const lips = named.filter( ( [ , s ] ) => s.startsWith('@lipsjs/lips') ).map( ( [ , s ] ) => s.replace( '@lipsjs/lips', '.' ) )
    expect( lips.length ).toBeGreaterThanOrEqual( 5 )
    expect( lips.filter( s => !( s in pkg.exports ) ) ).toEqual([])
    expect( new Set( lips ) ).toEqual( new Set([ './lynx', './runtime', './lynx/main', './lynx/background', './lynx-plugin' ]) )
  })

  it('every entry is a file the build writes, declared from a source that exists', () => {
    const built = [ ...pkg.scripts.build.matchAll( /--entry-naming (\S+)/g ) ].map( m => m[ 1 ].replace( '[ext]', 'js' ) )
    for( const [ name, entry ] of Object.entries<any>( pkg.exports ) ){
      expect( built, name ).toContain( entry.import.replace( './dist/', '' ) )
      expect( entry.default, name ).toBe( entry.import )
      expect( SOURCES.has( entry.types.replace( './dist/types/', '../src/' ).replace( /\.d\.ts$/, '.ts' ) ), name ).toBe( true )
    }
    // The two runtime entries, one per thread, and the plugin, for Node
    expect( pkg.exports['./lynx/main'].import ).toBe('./dist/lynx-main.min.js')
    expect( pkg.exports['./lynx/background'].import ).toBe('./dist/lynx-background.min.js')
    expect( pkg.exports['./lynx-plugin'].import ).toBe('./dist/lynx-plugin.mjs')
    expect( pkg.scripts.build ).toMatch( /src\/lynx\/plugin\.ts --entry-naming lynx-plugin\.mjs [^&]*--target node/ )
  })
})

// ------------------------------------------------------------------ plugin
/** Rsbuild's plugin API, as far as the plugin uses it */
function setup(){
  const transforms: [ any, ( a: { code: string, resourcePath: string } ) => string ][] = []
  let configure: any, chained: any
  const api = {
    transform: ( rule: any, fn: any ) => transforms.push([ rule, fn ]),
    modifyRsbuildConfig: ( fn: any ) => { configure = fn },
    modifyBundlerChain: ( fn: any ) => fn({ plugin: ( name: string ) => ({ use: ( P: any ) => { chained = [ name, P ] } }) })
  }
  pluginLips().setup( api )
  /** A transform, picked as Rsbuild would: by file name and query */
  const run = ( query: string, code: string, resourcePath = '/app/src/card.lips.css' ) => {
    const q = ( c: any ) => c instanceof RegExp ? c.test( query ) : !c.not.test( query )
    const hit = transforms.find( ( [ r ] ) => r.test.test( resourcePath ) && q( r.resourceQuery ) )
    if( !hit ) throw new Error(`no transform for ${resourcePath}${query}`)
    return hit[ 1 ]({ code, resourcePath })
  }
  return { transforms, run, configure: () => configure, chained: () => chained }
}

/** A compiler with the plugins a Lynx build registers, and the hooks the page config goes through */
function compilerWith( ...plugins: any[] ){
  const encode = vi.fn(), compilation = {}
  class Template {
    static getLynxTemplatePluginHooks( c: any ){
      expect( c ).toBe( compilation )
      return { beforeEncode: { tap: ( _: string, fn: any ) => encode.mockImplementation( fn ) } }
    }
  }
  const compiler = {
    options: { plugins: plugins.map( p => p === 'template' ? new Template() : p ) },
    hooks: { thisCompilation: { tap: ( _: string, fn: any ) => fn( compilation ) } }
  }
  return { compiler, encode }
}

describe('pluginLips (@lipsjs/lips/lynx-plugin)', () => {
  it('a sheet becomes flat CSS scoped by its file name; ?raw becomes its IR without the CSS', () => {
    const { run } = setup()
    const css = run( '', '--accent: {state.accent};\n.a { .b { color: var(--accent); } }' )
    expect( css ).toContain('.lips-card .a .b{color:var(--accent);}')
    expect( css ).not.toContain('&')

    const ir = JSON.parse( run( '?raw', '--accent: {state.accent};\n.a { color: red; }' ) )
    expect( ir.css ).toBe('')
    expect( ir.binds ).toHaveLength( 1 )
    // Only Lips sheets: a plain stylesheet is Lynx's own
    expect( () => run( '', '.a {}', '/app/src/style.css' ) ).toThrow()
  })

  it('an error fails the build, with where it is; a warning does not', () => {
    const warn = vi.spyOn( console, 'warn' ).mockImplementation( () => {} )
    expect( () => buildSheet( '.a[data-x] { color: red; }', '/app/card.lips.css' ) ).toThrow( /card\.lips\.css:1:\d+ error LIPS-L001/ )
    expect( buildSheet( '.a:hover { color: red; }', '/app/card.lips.css' ).css ).toContain(':hover')
    expect( warn.mock.calls[ 0 ][ 0 ] ).toMatch( /card\.lips\.css:1:\d+ warning LIPS-L004/ )
    warn.mockRestore()
  })

  it("Lips's own files are compiled with the app's: Lynx's background engine does not parse `||=`", () => {
    const { configure } = setup()
    const merge = ( a: any, b: any ) => ({ ...a, source: { ...a.source, include: [ ...( a.source?.include || [] ), ...b.source.include ] } })
    const out = configure()({ source: { include: [ 'mine' ] } }, { mergeRsbuildConfig: merge })
    expect( out.source.include[ 0 ] ).toBe('mine')

    const [ , lips ] = out.source.include
    expect( lips.test('/app/node_modules/@lipsjs/lips/dist/runtime.min.js') ).toBe( true )
    expect( lips.test('C:\\app\\node_modules\\@lipsjs\\lips\\dist\\lynx-background.min.js') ).toBe( true )
    expect( lips.test('/app/node_modules/other/dist/x.js') ).toBe( false )
  })

  it("sets the page config through the template plugin the build registered", () => {
    const { chained } = setup()
    const [ name, PageConfig ] = chained()
    expect( name ).toBe('lips:page-config')

    const { compiler, encode } = compilerWith( {}, 'template' )
    new PageConfig().apply( compiler )
    const args = { encodeData: { sourceContent: { config: { mine: 1 } } } }
    expect( encode( args ) ).toBe( args )
    expect( args.encodeData.sourceContent.config ).toEqual({ mine: 1, ...LYNX_PAGE_CONFIG })

    // Without a Lynx build plugin there is nothing to encode: said, not skipped
    expect( () => new PageConfig().apply( compilerWith( {} ).compiler ) ).toThrow( /pluginVanillaLynx or pluginReactLynx/ )
  })
})
