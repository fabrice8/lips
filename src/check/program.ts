/**
 * `lips-check`: a project's templates type-checked against their
 * components, by TypeScript's own checker.
 *
 * For each component, the template's shadow (`./shadow`) is written in as
 * a handler method, so its `this` is the component's, however that is
 * typed. TypeScript checks the file as it would be with that method in it,
 * and what it says inside the method is mapped back to the template:
 *
 *   LIPS-T001  error    an expression does not type-check (TypeScript's message)
 *   LIPS-T002  error    an event names a handler the component does not have
 *   LIPS-T003  warning  a template that cannot be checked, and why
 *
 * with the compiler's own errors (`LIPS-P…`, `LIPS-E…`, `LIPS-C…`) where a
 * template does not compile.
 *
 * Where a component is written, and where its check goes:
 *
 * - an object literal with a `default` template (in a `component()`,
 *   `register`, `render` or `root` call, a route table, …): in its
 *   `handler`, or a `handler` of its own, so `this` is what that call
 *   infers;
 * - a module whose default export is its template, and a `.lips` file:
 *   beside its `handler`, typed as it is (`Handlers<Shape<…>>`). An event
 *   calls `handler.pick` itself, so each handler's own parameters check
 *   its arguments: the copy the program reads says `satisfies` where the
 *   file says `:`, which keeps them.
 *
 * Uses the project's own `typescript`, 5.4 or later.
 */
import ts from 'typescript'
import { compileTemplate } from '../ir/compiler'
import { parseSFC } from '../ir/parser'
import type { TemplateDiagnostic } from '../ir/parser'
import { shadowTemplate, SHADOW_DECLARATIONS } from './shadow'
import type { Shadow, Source } from './shadow'

export interface CheckOptions {
  /** The project's `tsconfig.json` */
  project: string
  /**
   * Where Lips's types are, for a component module with no typed
   * `handler`: a package name (default `@lipsjs/lips`) or a path.
   */
  lips?: string
  /** `.lips` files to check; by default every one under the project's folder */
  sfc?: string[]
}

export interface CheckDiagnostic extends TemplateDiagnostic {
  file: string
}

/** What `this` has beside the handlers: a name an event may call */
const MEMBERS = new Set([ 'state', 'input', 'context', 'static', 'node', 'refs', 'lang', 'setLanguage', 'emit', 'on', 'once', 'off', 'setContext' ])
/** The keys that make an object literal with a `default` string a component */
const COMPONENT_KEYS = new Set([ 'state', 'handler', 'static', '_static', 'macros', 'stylesheet', 'name', 'watchContext' ])

/** A component found in a file */
interface Site {
  /** The template's text, and where it starts in the file */
  template: { text: string, at: number }
  macros?: { text: string, at: number }
  /** Its handler object literal, where it is written in place */
  handler?: ts.ObjectLiteralExpression
  /** Object form: the component's own object literal */
  owner?: ts.ObjectLiteralExpression
  /** Module form (or `.lips`): the module's top-level declarations */
  module?: Map<string, ts.VariableDeclaration>
  /** Why it cannot be checked */
  skip?: string
  at: number
}

const literalText = ( n: ts.Node | undefined ) =>
  n && ( ts.isNoSubstitutionTemplateLiteral( n ) || ts.isStringLiteral( n ) ) ? n : undefined

/** `{ … }`, `{ … } as X`, `{ … } satisfies X` */
const objectOf = ( n: ts.Expression | undefined ): ts.ObjectLiteralExpression | undefined => {
  while( n && ( ts.isAsExpression( n ) || ts.isSatisfiesExpression( n ) || ts.isParenthesizedExpression( n ) ) ) n = n.expression
  return n && ts.isObjectLiteralExpression( n ) ? n : undefined
}

const propName = ( p: ts.ObjectLiteralElementLike ) =>
  p.name && ( ts.isIdentifier( p.name ) || ts.isStringLiteral( p.name ) ) ? p.name.text : undefined

const prop = ( obj: ts.ObjectLiteralExpression, name: string ) =>
  obj.properties.find( p => propName( p ) === name )

/** Top-level `const`s, exported (a module) or not (a `.lips` script) */
function declarations( sf: ts.SourceFile, exported: boolean ){
  const out = new Map<string, ts.VariableDeclaration>()
  for( const st of sf.statements )
    if( ts.isVariableStatement( st ) && ( !exported || st.modifiers?.some( m => m.kind === ts.SyntaxKind.ExportKeyword ) ) )
      for( const d of st.declarationList.declarations ) ts.isIdentifier( d.name ) && out.set( d.name.text, d )
  return out
}

/** A module's or a `.lips` script's component, its template given */
function moduleSite( decls: Map<string, ts.VariableDeclaration>, template: Site['template'], at: number ): Site {
  const macros = literalText( decls.get('macros')?.initializer )
  const handler = decls.get('handler')
  return {
    template, at, module: decls,
    macros: macros && { text: macros.text, at: macros.getStart() + 1 },
    handler: objectOf( handler?.initializer ),
    skip: handler && !objectOf( handler.initializer ) ? 'its handler is not written in place'
      : decls.has('macros') && !macros ? 'its macros are not a plain string' : undefined
  }
}

/** The components a TypeScript file writes */
function sitesOf( sf: ts.SourceFile ): Site[] {
  const sites: Site[] = []
  const exported = declarations( sf, true )
  const component = [ ...exported.keys() ].some( k => COMPONENT_KEYS.has( k ) )

  // Module form: the default export is the template
  for( const st of sf.statements ){
    if( !ts.isExportAssignment( st ) || st.isExportEquals ) continue
    const tpl = literalText( st.expression )
    if( tpl && ( tpl.text.includes('<') || component ) )
      sites.push( moduleSite( exported, { text: tpl.text, at: tpl.getStart() + 1 }, tpl.getStart() ) )
    else if( ts.isTemplateExpression( st.expression ) && component )
      sites.push({ template: { text: '', at: 0 }, skip: 'its template is built with ${…}', at: st.expression.getStart() })
  }

  // Object form: `{ default: \`…\`, … }`
  const visit = ( n: ts.Node ) => {
    if( ts.isObjectLiteralExpression( n ) ){
      const def = prop( n, 'default' )
      const init = def && ts.isPropertyAssignment( def ) ? def.initializer : undefined
      const tpl = literalText( init )
      const isComponent = n.properties.some( p => COMPONENT_KEYS.has( propName( p ) || '' ) )
      if( tpl && ( tpl.text.includes('<') || isComponent ) ){
        const handler = prop( n, 'handler' ), macros = prop( n, 'macros' )
        const handlerObj = handler && ts.isPropertyAssignment( handler ) ? objectOf( handler.initializer ) : undefined
        const macroLit = macros && ts.isPropertyAssignment( macros ) ? literalText( macros.initializer ) : undefined
        sites.push({
          template: { text: tpl.text, at: tpl.getStart() + 1 },
          macros: macroLit && { text: macroLit.text, at: macroLit.getStart() + 1 },
          handler: handlerObj,
          owner: n,
          skip: handler && !handlerObj ? 'its handler is not written in place'
            : macros && !macroLit ? 'its macros are not a plain string' : undefined,
          at: tpl.getStart()
        })
      }
      else if( init && ts.isTemplateExpression( init ) && isComponent )
        sites.push({ template: { text: '', at: 0 }, skip: 'its template is built with ${…}', at: init.getStart() })
    }
    ts.forEachChild( n, visit )
  }
  visit( sf )
  return sites
}

/** A change to the file the program reads: text put in at `at`, `remove` characters taken out */
interface Edit {
  at: number
  remove: number
  text: string
  /** A component's check: where its body starts in `text`, and how to read it back */
  check?: { body: number, site: Site, shadow: Shadow }
  /** Where it landed in the new text */
  vat?: number
}

/** A file as the program reads it, and how to read a position in it back */
interface Virtual {
  file: string
  /** The name the program knows it by */
  name: string
  /** The file as it is, for placing what is reported */
  whole: string
  text: string
  edits: Edit[]
  /** `.lips`: what TypeScript says of the script is reported too */
  sfc: boolean
}

/**
 * The file with each component's check written in. `original` is what the
 * program reads of it (a `.lips` file's script); `whole` is the file.
 */
function build( file: string, original: string, whole: string, sites: Site[], lips: string, sfc: boolean, out: CheckDiagnostic[] ): Virtual | null {
  const edits: Edit[] = []
  const lineStarts = starts( whole )
  const report = ( d: Omit<TemplateDiagnostic, 'loc'> & { at: number, length: number } ) =>
    out.push({ file, code: d.code, severity: d.severity, message: d.message, hint: d.hint, loc: locate( lineStarts, d.at, d.length ) })
  const L = JSON.stringify( lips )
  let retyped = false

  sites.forEach( ( site, k ) => {
    if( site.skip ){
      report({ code: 'LIPS-T003', severity: 'warning', message: `This template is not type-checked: ${ site.skip }`, at: site.at, length: 1 })
      return
    }

    // The compiler's own errors: what does not compile is not checked further
    for( const d of compileTemplate( site.template.text, { macros: site.macros?.text }).diagnostics )
      d.severity === 'error' && report({ ...d, at: site.template.at + d.loc.offset, length: d.loc.length })

    const method = `async __lips_check${ k }(): Promise<void> {\n`
    const names = site.handler?.properties.map( propName ).filter( ( n ): n is string => !!n ) || []

    if( site.module ){
      // Beside the handler, typed as it is: an event calls `handler.name` itself
      const decl = site.module.get('handler')
      let type = decl?.type && original.slice( decl.type.getStart(), decl.type.getEnd() )
      if( decl?.type && decl.initializer && !retyped ){
        retyped = true
        edits.push({ at: decl.name.getEnd(), remove: decl.type.getEnd() - decl.name.getEnd(), text: '' })
        edits.push({ at: decl.initializer.getEnd(), remove: 0, text: ` satisfies ${ type }` })
      }
      if( !type ){
        const parts = [ 'state', '_static' ].filter( n => site.module!.has( n ) )
          .map( n => `${ n === '_static' ? 'static' : n }: typeof ${ n }` ).join(', ')
        type = `import(${ L }).Handlers<import(${ L }).Shape<{ ${ parts } }>>`
      }
      const shadow = shadowTemplate( site.template.text, site.macros?.text, decl && site.handler ? { ref: 'handler', names } : undefined )
      const text = `\nconst __lips_handler${ k }: ${ type } = { ${ method }`
      edits.push({ at: original.length, remove: 0, text: `${ text }${ shadow.body }} }\n`, check: { body: text.length, site, shadow } })
      return
    }

    // Object form: in its handler, where `this` is what the call infers
    const shadow = shadowTemplate( site.template.text, site.macros?.text )
    const obj = site.handler || site.owner!
    const comma = obj.properties.length && !obj.properties.hasTrailingComma ? ',' : ''
    const text = site.handler ? `${ comma }\n${ method }` : `${ comma }\nhandler: { ${ method }`
    edits.push({
      at: obj.getEnd() - 1, remove: 0,
      text: `${ text }${ shadow.body }}${ site.handler ? '' : ' }' },\n`,
      check: { body: text.length, site, shadow }
    })
  })

  if( !edits.some( e => e.check ) ) return null

  edits.sort( ( a, b ) => a.at - b.at )
  let text = '', from = 0
  for( const e of edits ){
    text += original.slice( from, e.at )
    from = e.at + e.remove
    e.vat = text.length
    text += e.text
  }
  text += original.slice( from ) + '\n' + SHADOW_DECLARATIONS

  return { file, name: sfc ? file + '.check.ts' : file, whole, text, edits, sfc }
}

function starts( text: string ){
  const out = [ 0 ]
  for( let i = 0; i < text.length; i++ ) text[ i ] === '\n' && out.push( i + 1 )
  return out
}
function locate( lineStarts: number[], offset: number, length: number ){
  let lo = 0, hi = lineStarts.length - 1
  while( lo < hi ){
    const mid = ( lo + hi + 1 ) >> 1
    lineStarts[ mid ] <= offset ? lo = mid : hi = mid - 1
  }
  return { line: lo + 1, col: offset - lineStarts[ lo ] + 1, offset, length }
}

/** TypeScript's names for the renamed roots, put back */
const unrename = ( s: string ) => s.replace( /\$tatic/g, 'static' ).replace( /\$rguments/g, 'arguments' )

// Files and paths through TypeScript's own `sys`, as it reads the project
const resolve = ( path: string ) => ts.sys.resolvePath( path ).replace( /\\/g, '/' )
const dirname = ( path: string ) => resolve( path ).replace( /\/[^/]*$/, '' )
const relative = ( from: string, to: string ) => {
  const a = resolve( from ).split('/'), b = resolve( to ).split('/')
  let i = 0
  while( i < a.length && i < b.length && a[ i ] === b[ i ] ) i++
  return [ ...a.slice( i ).map( () => '..' ), ...b.slice( i ) ].join('/')
}
const read = ( file: string ) => {
  const text = ts.sys.readFile( file )
  if( text === undefined ) throw new Error(`lips-check: cannot read ${ file }`)
  return text
}

/** Where a diagnostic at `pos` in a check's body is in the file */
function place( check: NonNullable<Edit['check']>, pos: number, length: number ){
  const spans = check.shadow.spans
  const span = spans
    .filter( s => pos >= s.at && pos < s.at + Math.max( s.length, 1 ) )
    .sort( ( a, b ) => Number( b.exact ) - Number( a.exact ) || a.length - b.length )[ 0 ]
    // TypeScript may point at the `( ` an expression is wrapped in
    || spans.find( s => s.exact && s.at > pos && s.at - pos <= 2 )
  const base = ( source: Source ) => source === 'macros' && check.site.macros ? check.site.macros.at : check.site.template.at
  if( !span ) return { at: check.site.template.at, length: 1 }
  return span.exact
    ? { at: base( span.source ) + span.from + Math.max( 0, Math.min( pos - span.at, span.size - 1 ) ), length: Math.min( length, span.size ) }
    : { at: base( span.source ) + span.from, length: span.size }
}

/** The project's templates, type-checked: what is wrong in them, by file and place */
export function checkTemplates( options: CheckOptions ): CheckDiagnostic[] {
  const [ major, minor ] = ts.versionMajorMinor.split('.').map( Number )
  if( major < 5 || major === 5 && minor < 4 )
    throw new Error(`lips-check needs TypeScript 5.4 or later; this project has ${ ts.version }`)

  const project = resolve( options.project )
  const config = ts.getParsedCommandLineOfConfigFile( project, {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: d => { throw new Error( ts.flattenDiagnosticMessageText( d.messageText, '\n' ) ) }
  })
  if( !config ) throw new Error(`lips-check: cannot read ${ project }`)

  const lipsFor = ( file: string ) => {
    const spec = options.lips || '@lipsjs/lips'
    if( !/^(\.|\/|[A-Za-z]:[\\/])/.test( spec ) ) return spec
    const rel = relative( dirname( file ), spec )
    return rel.startsWith('.') ? rel : './' + rel
  }

  const out: CheckDiagnostic[] = []
  const virtuals = new Map<string, Virtual>()
  const key = resolve

  for( const file of config.fileNames ){
    if( file.endsWith('.d.ts') || !/\.[cm]?tsx?$/.test( file ) ) continue
    const original = read( file )
    if( !original.includes('default') ) continue
    const sf = ts.createSourceFile( file, original, ts.ScriptTarget.Latest, true )
    const v = build( file, original, original, sitesOf( sf ), lipsFor( file ), false, out )
    v && virtuals.set( key( v.name ), v )
  }

  // Every `.lips` file under the project's folder, but dependencies and builds
  const sfcs = options.sfc || ts.sys.readDirectory( dirname( project ), [ '.lips' ], [ '**/node_modules', '**/dist' ], [ '**/*.lips' ] )
  for( const file of sfcs ){
    const whole = read( file )
    const { script } = parseSFC( whole )
    const sf = ts.createSourceFile( file + '.ts', script, ts.ScriptTarget.Latest, true )
    const site = moduleSite( declarations( sf, false ), { text: whole.slice( script.length ), at: script.length }, script.length )
    // The script, as the plugin ships it, with the check beside it
    const v = build( file, script, whole, [ site ], lipsFor( file ), true, out )
    v && virtuals.set( key( v.name ), v )
  }

  if( !virtuals.size ) return out

  const host = ts.createCompilerHost( config.options )
  const getSourceFile = host.getSourceFile.bind( host ), fileExists = host.fileExists.bind( host ), readFile = host.readFile.bind( host )
  host.getSourceFile = ( name, lang, onError, create ) => {
    const v = virtuals.get( key( name ) )
    return v ? ts.createSourceFile( name, v.text, lang, true ) : getSourceFile( name, lang, onError, create )
  }
  host.fileExists = name => virtuals.has( key( name ) ) || fileExists( name )
  host.readFile = name => virtuals.get( key( name ) )?.text ?? readFile( name )

  const program = ts.createProgram({
    rootNames: [ ...config.fileNames, ...[ ...virtuals.values() ].filter( v => v.sfc ).map( v => v.name ) ],
    options: { ...config.options, noEmit: true },
    host
  })

  for( const v of virtuals.values() ){
    const sf = program.getSourceFile( v.name )
    if( !sf ) continue
    const lineStarts = starts( v.whole )
    const found: CheckDiagnostic[] = []
    const scriptEnd = v.text.length - SHADOW_DECLARATIONS.length - 1

    for( const d of [ ...program.getSyntacticDiagnostics( sf ), ...program.getSemanticDiagnostics( sf ) ] ){
      if( d.start === undefined ) continue
      const message = unrename( ts.flattenDiagnosticMessageText( d.messageText, '\n' ) )
      const edit = v.edits.find( e => d.start! >= e.vat! && d.start! < e.vat! + e.text.length )

      if( edit?.check ){
        const { at, length } = place( edit.check, d.start - edit.vat! - edit.check.body, d.length ?? 1 )
        found.push({ file: v.file, code: 'LIPS-T001', severity: 'error', message, hint: `TS${ d.code }`, loc: locate( lineStarts, at, length ) })
      }
      // A `.lips` script is no one else's to check; a `.ts` file is tsc's
      else if( v.sfc && !edit && d.start < scriptEnd ){
        const shift = v.edits.filter( e => e.vat! + e.text.length <= d.start! ).reduce( ( n, e ) => n + e.text.length - e.remove, 0 )
        found.push({ file: v.file, code: `TS${ d.code }`, severity: 'error', message, loc: locate( lineStarts, d.start - shift, d.length ?? 1 ) })
      }
    }

    // An event names a handler the component does not have: typed by hand, each name reads as `any`
    for( const { check } of v.edits ){
      if( !check ) continue
      const obj = check.site.handler
      if( obj?.properties.some( p => ts.isSpreadAssignment( p ) || !propName( p ) ) ) continue
      const names = new Set([ ...MEMBERS, ...( obj?.properties.map( propName ) || [] ) ])
      for( const h of check.shadow.handlers ){
        if( names.has( h.name ) ) continue
        const at = ( h.source === 'macros' && check.site.macros ? check.site.macros.at : check.site.template.at ) + h.from
        // TypeScript's word on it names the check's own types: this one is plainer
        const ts1 = found.findIndex( f => f.loc.offset === at )
        ts1 >= 0 && found.splice( ts1, 1 )
        found.push({
          file: v.file, code: 'LIPS-T002', severity: 'error',
          message: `The component has no handler named '${ h.name }'`,
          hint: obj ? 'Add it to handler, or fix the name' : 'This component declares no handler',
          loc: locate( lineStarts, at, h.name.length )
        })
      }
    }
    out.push( ...found )
  }

  return out.sort( ( a, b ) => a.file.localeCompare( b.file ) || a.loc.offset - b.loc.offset )
}

/** `file:line:col - error LIPS-T001: message (TS2339)`, as `tsc` writes them */
export function formatDiagnostic( d: CheckDiagnostic, cwd = ts.sys.getCurrentDirectory() ){
  return `${ relative( cwd, d.file ) }:${ d.loc.line }:${ d.loc.col } - ${ d.severity } ${ d.code }: ${ d.message }${ d.hint ? ` (${ d.hint })` : '' }`
}
