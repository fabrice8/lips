/**
 * Build-time precompilation (RFC-001 §5, §9 — Phase 3).
 *
 * Turns `{ default: '<template…>' }` into `{ ir: {…} }` ahead of time.
 * Two payoffs:
 *
 *  1. **CSP**: with `mode: 'interpreted'`, a precompiled app never
 *     calls `Function`/`eval`, so it runs under `script-src` without
 *     `unsafe-eval`.
 *  2. **Startup**: no parse/compile at runtime — the app boots
 *     straight into cloning skeletons.
 *
 * The IR is plain JSON, so it can be emitted into a bundle, shipped
 * from a server, or stored as a Modela artifact.
 */

import { compileTemplate } from './ir/compiler'
import { compileStyle } from './ir/style'
import type { TemplateIR, CompileOptions } from './ir/compiler'
import type { StyleIR } from './ir/style'
import type { TemplateDiagnostic } from './ir/parser'

export interface PrecompiledTemplate {
  ir: TemplateIR
  /** Compiled stylesheet — replaces `stylesheet` source (RFC-004) */
  style?: StyleIR
  state?: Record<string, any>
  _static?: Record<string, any>
  context?: string[]
  handler?: Record<string, ( ...args: any[] ) => any>
}

export interface PrecompileOptions {
  /**
   * Scope name for the stylesheet — baked into the StyleIR, so it must
   * match how the component is registered. Defaults to `'lips'`.
   */
  name?: string
}

export interface PrecompileResult {
  template: PrecompiledTemplate
  diagnostics: TemplateDiagnostic[]
}

/**
 * Precompile one authoring template. Macros are inlined at this point,
 * so the `macros` source does not ship to the client — and the stylesheet
 * is compiled to StyleIR, so the `./runtime` build needs no CSS
 * preprocessor either (RFC-004 §1).
 */
export function precompile( template: Record<string, any>, options: PrecompileOptions = {} ): PrecompileResult {
  const
  copts: CompileOptions = { macros: template.macros },
  { ir, diagnostics } = compileTemplate( template.default || '', copts ),
  { default: _src, macros: _macros, stylesheet, ...rest } = template

  if( !stylesheet ) return { template: { ...rest, ir }, diagnostics }

  const style = compileStyle( stylesheet, { nsp: options.name || 'lips' })

  return {
    template: { ...rest, ir, style: style.ir },
    diagnostics: [ ...diagnostics, ...style.diagnostics ]
  }
}

/** Serialize an IR for embedding in generated source */
export const serializeIR = ( ir: TemplateIR ) => JSON.stringify( ir )
export const serializeStyleIR = ( ir: StyleIR ) => JSON.stringify( ir )

// ------------------------------------------------------------ bundler glue
export interface PluginOptions {
  /** Files to transform (default: `.lips` single-file components) */
  include?: RegExp
  /** Emit diagnostics as build warnings (default true) */
  reportDiagnostics?: boolean
}

/**
 * Vite/Rollup plugin: compiles `.lips` single-file components into a
 * module exporting a precompiled template.
 *
 *   import Card from './card.lips'
 *   lips.register('card', Card)   // no runtime parsing
 *
 * Kept dependency-free (duck-typed plugin object) so importing this
 * module never pulls a bundler into the runtime graph.
 */
export function lipsPlugin( options: PluginOptions = {} ){
  const
  include = options.include || /\.lips$/,
  report = options.reportDiagnostics !== false

  return {
    name: 'lips:precompile',
    enforce: 'pre' as const,

    async transform( code: string, id: string ){
      if( !include.test( id ) ) return null

      // Lazy import: parseSFC is only needed at build time
      const { parseSFC } = await import('./ir/parser')
      const { script } = parseSFC( code )

      /**
       * The frontscript declares state/handler/etc.; the template
       * body is compiled to IR and merged into the default export.
       */
      const templateSrc = code.slice( script.length )
      const { ir, diagnostics } = compileTemplate( templateSrc )

      if( report )
        for( const d of diagnostics )
          ( this as any )?.warn?.(
            `[lips] ${d.code} ${d.message} (${id}:${d.loc.line}:${d.loc.col})` )

      const errors = diagnostics.filter( d => d.severity === 'error' )
      if( errors.length )
        throw new Error(
          `[lips] ${id}: ${errors[0].message} at line ${errors[0].loc.line}:${errors[0].loc.col}` )

      /**
       * Compile the stylesheet too, so the emitted module needs no CSS
       * preprocessor at runtime. Only a plain template literal can be
       * lifted statically — one containing `${…}` depends on runtime
       * values, so it ships as source and needs the full build.
       */
      const
      name = ( id.split(/[\\/]/).pop() || 'lips' ).replace( /\.lips$/, '' ),
      literal = /\bconst\s+stylesheet\s*=\s*`([^`]*)`/.exec( script ),
      hasStyle = /\bconst\s+stylesheet\b/.test( script ),
      liftable = literal && !literal[ 1 ].includes('${')

      let styleOut = ''
      if( liftable ){
        const style = compileStyle( literal![ 1 ], { nsp: name })

        if( report )
          for( const d of style.diagnostics )
            ( this as any )?.warn?.(
              `[lips] ${d.code} ${d.message} (${id}:${d.loc.line}:${d.loc.col})` )

        const styleErrors = style.diagnostics.filter( d => d.severity === 'error' )
        if( styleErrors.length )
          throw new Error(
            `[lips] ${id}: ${styleErrors[0].message} at line ${styleErrors[0].loc.line}:${styleErrors[0].loc.col}` )

        styleOut = `  style: ${serializeStyleIR( style.ir )},\n`
      }
      else if( hasStyle && report )
        ( this as any )?.warn?.(
          `[lips] ${id}: stylesheet could not be precompiled (interpolated template literal) — `
          + 'it ships as source and needs "@lipsjs/lips", not "@lipsjs/lips/runtime".' )

      return {
        code: `${script}
const __lips_ir__ = ${serializeIR( ir )};
export default {
  ir: __lips_ir__,
${styleOut}  ${/\bconst\s+state\b/.test( script ) ? 'state,' : ''}
  ${/\bconst\s+handler\b/.test( script ) ? 'handler,' : ''}
  ${/\bconst\s+_static\b/.test( script ) ? '_static,' : ''}
  ${/\bconst\s+context\b/.test( script ) ? 'context,' : ''}
  ${hasStyle && !liftable ? 'stylesheet,' : ''}
};
`,
        map: null
      }
    }
  }
}
