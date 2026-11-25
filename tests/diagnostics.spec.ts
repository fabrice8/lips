/**
 * Every diagnostic Lips can report, each by the smallest source that makes
 * it, and the check that keeps the list whole: a code that appears in
 * `src/` and in no test is a promise nobody holds Lips to.
 *
 * Template codes (parser `P`, compiler `C`, expression `E`) are all in the
 * table below. Style (`S`), untrusted (`U`) and Lynx (`L`) codes are
 * triggered where their feature is tested; the ones no other spec reached
 * are triggered here.
 */
import { describe, it, expect } from 'vitest'
import Lips from '../src/lips'
import { compileTemplate } from '../src/ir/compiler'
import { parseExpression } from '../src/ir/expression'
import { compileStyle } from '../src/ir/style'
import { untrusted, untrustedPolicy } from '../src/untrusted'

type Case = { code: string, severity: 'error' | 'warning', src: string, macros?: string, target?: 'tree' }

/** The source that makes each code, compiled as a template */
const TEMPLATE: Case[] = [
  // ---- parser
  { code: 'LIPS-P001', severity: 'error',   src: '<div' },
  { code: 'LIPS-P002', severity: 'error',   src: '<1x>' },
  { code: 'LIPS-P003', severity: 'error',   src: '<!-- open' },
  { code: 'LIPS-P004', severity: 'warning', src: '<div><span></div>' },
  { code: 'LIPS-P005', severity: 'error',   src: '<div></span></div>' },
  { code: 'LIPS-P006', severity: 'error',   src: '<div>' },
  { code: 'LIPS-P007', severity: 'error',   src: '<p>{state.a</p>' },
  { code: 'LIPS-P008', severity: 'error',   src: '<{state.tag' },
  { code: 'LIPS-P009', severity: 'error',   src: '<div =x></div>' },
  { code: 'LIPS-P010', severity: 'error',   src: '<div a=></div>' },
  { code: 'LIPS-P011', severity: 'error',   src: '<div(x)></div>' },
  { code: 'LIPS-P012', severity: 'error',   src: '<if(state.a' },
  { code: 'LIPS-P013', severity: 'warning', src: '<p>&hearts;</p>' },
  // ---- compiler
  { code: 'LIPS-C001', severity: 'error',   src: '<else>x</else>' },
  { code: 'LIPS-C002', severity: 'error',   src: '<case is="a">x</case>' },
  { code: 'LIPS-C003', severity: 'error',   src: '<switch( state.a )><p>x</p></switch>' },
  { code: 'LIPS-C004', severity: 'error',   src: '<for [x]>x</for>' },
  { code: 'LIPS-C007', severity: 'warning', src: '<div await( state.p )></div>' },
  { code: 'LIPS-C008', severity: 'warning', src: '<div [a]></div>' },
  { code: 'LIPS-C009', severity: 'error',   src: '<loop/>', macros: '<macro name="loop"><loop/></macro>' },
  { code: 'LIPS-C010', severity: 'warning', src: '<p/>', macros: '<div>not a macro</div>' },
  { code: 'LIPS-C011', severity: 'error',   src: '<p/>', macros: '<macro>no name</macro>' },
  { code: 'LIPS-C012', severity: 'error',   src: '<p @format="greeting"></p>' },
  { code: 'LIPS-C013', severity: 'error',   src: '<let ...state.o/>' },
  { code: 'LIPS-C014', severity: 'warning', src: '<input i18n-placeholder="k" placeholder="x">' },
  { code: 'LIPS-C015', severity: 'error',   src: '<h1 i18n="k">Hi {state.name}</h1>' },
  { code: 'LIPS-C016', severity: 'error',   src: '<context ...state.o>x</context>' },
  { code: 'LIPS-C017', severity: 'warning', src: '<context>x</context>' },
  { code: 'LIPS-C018', severity: 'error',   src: '<i18n>x</i18n>' },
  { code: 'LIPS-C019', severity: 'error',   src: `<div style="{ margin: '3rem' }"></div>` },
  { code: 'LIPS-C020', severity: 'error',   src: '<button on-click="go">x</button>' },
  { code: 'LIPS-C021', severity: 'error',   src: '<div @html=state.h></div>', target: 'tree' },
  { code: 'LIPS-C022', severity: 'error',   src: '<button on-click.later(go)>x</button>' },
  { code: 'LIPS-C023', severity: 'error',   src: '<tool on-click(go)/>', macros: '<macro name="tool"><b>x</b></macro>' },
  { code: 'LIPS-C024', severity: 'error',   src: '<tool>inside</tool>', macros: '<macro name="tool"><b>x</b></macro>' },
  // ---- expressions, as a template reaches them
  { code: 'LIPS-E002', severity: 'error',   src: '<p>{ state.a # 1 }</p>' },
  { code: 'LIPS-E003', severity: 'error',   src: '<p>{ state.a state.b }</p>' },
  { code: 'LIPS-E004', severity: 'error',   src: '<p>{ ( a b ) => 1 }</p>' },
  { code: 'LIPS-E005', severity: 'error',   src: '<p>{ ( 1 ) => 2 }</p>' },
  { code: 'LIPS-E006', severity: 'error',   src: '<p>{ 1 = 2 }</p>' },
  { code: 'LIPS-E007', severity: 'error',   src: '<p>{ state.a ? 1 }</p>' },
  { code: 'LIPS-E008', severity: 'error',   src: '<p>{ state. }</p>' },
  { code: 'LIPS-E009', severity: 'error',   src: '<p>{ state.list[ 0 ) }</p>' },
  { code: 'LIPS-E010', severity: 'error',   src: '<p>{ state.f( 1 ] }</p>' },
  { code: 'LIPS-E011', severity: 'error',   src: '<p>{ ({ [ k ]: 1 }) }</p>' },
  { code: 'LIPS-E012', severity: 'error',   src: '<p>{ * }</p>' }
]

describe('every template diagnostic, by the smallest source that makes it', () => {
  for( const c of TEMPLATE )
    it(`${c.code} (${c.severity}): ${c.src}`, () => {
      const { diagnostics } = compileTemplate( c.src, { macros: c.macros, target: c.target })
      const hit = diagnostics.find( d => d.code === c.code )

      expect( hit, diagnostics.map( d => `${d.code} ${d.message}` ).join('\n') ).toBeTruthy()
      expect( hit!.severity ).toBe( c.severity )
      expect( hit!.loc.line ).toBeGreaterThan( 0 )
      expect( hit!.loc.col ).toBeGreaterThan( 0 )
    })

  it('a diagnostic is located where it is written', () => {
    const { diagnostics } = compileTemplate('<div>\n  <p>{ state.a ? 1 }</p>\n</div>')
    const d = diagnostics.find( d => d.code === 'LIPS-E007' )!
    expect( d.loc.line ).toBe( 2 )
  })

  it('a compile never throws: broken source still yields IR', () => {
    for( const c of TEMPLATE )
      expect( () => compileTemplate( c.src, { macros: c.macros, target: c.target }), c.src ).not.toThrow()
  })

  it('an expression code is the same from parseExpression', () => {
    expect( parseExpression('state.a ?').diagnostics.map( d => d.code ) ).toContain('LIPS-E012')
  })

  /**
   * The template scanner reads a quote as the start of a string to its
   * end, so an unterminated string never reaches the expression parser
   * from a template: it is LIPS-P007 there. A style `{expr}` or a direct
   * parse reaches it.
   */
  it('LIPS-E001: an unterminated string, where an expression is parsed directly', () => {
    expect( parseExpression(`'open`).diagnostics.map( d => d.code ) ).toContain('LIPS-E001')
  })
})

describe('the codes no other spec reached', () => {
  it('LIPS-S006: a preprocessor that throws', () => {
    const { diagnostics } = compileStyle('.a { color: red }', { nsp: 'x', preprocess: () => { throw new Error('boom') } })
    expect( diagnostics.map( d => d.code ) ).toContain('LIPS-S006')
  })

  it('LIPS-U042: a stylesheet Lips did not compile, under an untrusted policy', () => {
    document.body.innerHTML = '<div id="app"></div>'
    const seen: string[] = []
    const lips = new Lips({ untrusted: untrusted({ ...untrustedPolicy, report: ( r: any ) => seen.push( r.code ) }) })
    const precompiled = { ...compileStyle('.a { color: red }', { nsp: 'pre' }).ir }

    lips.render('pre', { default: '<p class="a">x</p>', style: precompiled }).appendTo('#app')
    expect( seen ).toContain('LIPS-U042')
  })
})

describe('the list is whole', () => {
  const SOURCES = import.meta.glob( '../src/**/*.ts', { query: '?raw', import: 'default', eager: true })
  const SPECS = import.meta.glob( './**/*.ts', { query: '?raw', import: 'default', eager: true })
  const codesIn = ( texts: string[] ) => new Set( texts.flatMap( t => t.match( /LIPS-[A-Z]\d{3}/g ) || [] ) )

  const inSource = codesIn( Object.values( SOURCES ) )
  const tested = codesIn( Object.entries( SPECS ).filter( ( [ p ] ) => !p.endsWith('diagnostics.spec.ts') ).map( ( [ , t ] ) => t ) )
  TEMPLATE.forEach( c => tested.add( c.code ) )
  ;[ 'LIPS-E001', 'LIPS-S006', 'LIPS-U042' ].forEach( c => tested.add( c ) )

  it('every template code in src/ is in the table', () => {
    const template = [ ...inSource ].filter( c => /^LIPS-[PCE]/.test( c ) )
    expect( template.filter( c => c !== 'LIPS-E001' && !TEMPLATE.some( t => t.code === c ) ) ).toEqual( [] )
  })

  it('every code in src/ is triggered by a test', () => {
    expect( [ ...inSource ].filter( c => !tested.has( c ) ).sort() ).toEqual( [] )
  })
})
