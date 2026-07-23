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
import type { TemplateIR, CompileOptions } from './ir/compiler'
import type { TemplateDiagnostic } from './ir/parser'

export interface PrecompiledTemplate {
  ir: TemplateIR
  state?: Record<string, any>
  _static?: Record<string, any>
  context?: string[]
  handler?: Record<string, ( ...args: any[] ) => any>
  stylesheet?: string
}

export interface PrecompileResult {
  template: PrecompiledTemplate
  diagnostics: TemplateDiagnostic[]
}

/**
 * Precompile one authoring template. Macros are inlined at this
 * point, so the `macros` source does not ship to the client.
 */
export function precompile( template: Record<string, any> ): PrecompileResult {
  const options: CompileOptions = { macros: template.macros }
  const { ir, diagnostics } = compileTemplate( template.default || '', options )

  const { default: _src, macros: _macros, ...rest } = template

  return { template: { ...rest, ir }, diagnostics }
}

/** Serialize an IR for embedding in generated source */
export const serializeIR = ( ir: TemplateIR ) => JSON.stringify( ir )

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

      return {
        code: `${script}
const __lips_ir__ = ${serializeIR( ir )};
export default {
  ir: __lips_ir__,
  ${/\bconst\s+state\b/.test( script ) ? 'state,' : ''}
  ${/\bconst\s+handler\b/.test( script ) ? 'handler,' : ''}
  ${/\bconst\s+_static\b/.test( script ) ? '_static,' : ''}
  ${/\bconst\s+context\b/.test( script ) ? 'context,' : ''}
  ${/\bconst\s+stylesheet\b/.test( script ) ? 'stylesheet,' : ''}
};
`,
        map: null
      }
    }
  }
}
