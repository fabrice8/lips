/**
 * RFC-006 L2 — the style pipeline for Lynx, test tier A.
 *
 * What the compiled sheet looks like, and what the lint reports. Whether
 * Lynx's own CSS engine then matches it — scoped rules, `@media`,
 * inheritance, inline variables — is proven at tier B
 * (`demos/lynx/native/run.sh`), on the demo's sheet.
 */
import { describe, it, expect } from 'vitest'
import { compileStyle } from '../src/ir/style'
import { compileLynxStyle, LYNX_PAGE_CONFIG } from '../src/lynx/style'
import { scopeClass } from '../src/lynx/protocol'
import { stylisPreprocessor } from '../src/stylis'
import demoSheet from '../demos/lynx/src/app.lips.css?raw'

const lynx = ( src: string, nsp = 'card' ) => compileLynxStyle( src, { nsp, preprocess: stylisPreprocessor })

/** The sheet compiled, expecting no diagnostics */
const css = ( src: string, nsp?: string ) => {
  const { ir, diagnostics } = lynx( src, nsp )
  expect( diagnostics ).toEqual( [] )
  return ir.css
}

/** code → [ line, col ] of each diagnostic */
const found = ( src: string ) =>
  lynx( src ).diagnostics.map( d => [ d.code, d.severity, d.loc.line, d.loc.col ] )

describe('Lynx sheets: flat, scoped by class', () => {
  it('scopes by class and flattens: Lynx has no nesting, and attribute selectors never match', () => {
    expect( css(`color: red; .a { color: blue; .b { color: green } }`) )
      .toBe('.lips-card{color:red;}.lips-card .a{color:blue;}.lips-card .a .b{color:green;}')
  })

  it('leaves `div &` to the preprocessor instead of rewriting it to :is(), which Lynx never matches', () => {
    const { ir } = lynx(`view & { color: red }`)
    expect( ir.css ).toBe('view .lips-card{color:red;}')
    expect( ir.css ).not.toContain(':is(')
  })

  it('hoists @keyframes out of the scope, keeps @media around scoped rules', () => {
    expect( css(`@keyframes spin { from { opacity: 0 } to { opacity: 1 } } @media (max-width: 500px) { .a { width: 1px } }`) )
      .toBe('@keyframes spin{from{opacity:0;}to{opacity:1;}}@media (max-width: 500px){.lips-card .a{width:1px;}}')
  })

  it('cleans the scope name the same way the runtime does', () => {
    expect( scopeClass('ui/card.v2') ).toBe('lips-ui-card-v2')
    expect( css( `.a { color: red }`, 'ui/card.v2' ) ).toBe('.lips-ui-card-v2 .a{color:red;}')
  })

  it('a global sheet is not scoped', () => {
    const { ir } = compileLynxStyle(`.a { color: red }`, { nsp: 'g', meta: true, preprocess: stylisPreprocessor })
    expect( ir.css ).toBe('.a{color:red;}')
  })

  it('leaves the DOM output alone', () => {
    const { ir } = compileStyle(`.a { width: {state.w}px }`, { nsp: 'card' })
    expect( ir.css ).toContain('[rel="card"]')
    expect( ir.css ).toContain('calc(var(--card-0) * 1px)')
    expect( ir.binds ).toEqual([{ prop: '--card-0', e: 0 }])
  })
})

describe('Lynx binds: full values', () => {
  it('a unit-suffixed bind carries its unit instead of calc(): Lynx calc() covers lengths only', () => {
    const { ir } = lynx(`.a { border-radius: {state.r}px; width: {state.w}% }`)
    expect( ir.css ).toBe('.lips-card .a{border-radius:var(--card-0-px);width:var(--card-1-pct);}')
    expect( ir.binds ).toEqual([
      { prop: '--card-0-px', e: 0, u: 'px' },
      { prop: '--card-1-pct', e: 1, u: '%' }
    ])
  })

  it('one expression with two units is two variables; a plain bind stays a plain variable', () => {
    const { ir } = lynx(`.a { width: {state.s}px; height: {state.s}%; opacity: {state.o} }`)
    expect( ir.css ).toBe('.lips-card .a{width:var(--card-0-px);height:var(--card-0-pct);opacity:var(--card-1);}')
    expect( ir.binds ).toEqual([
      { prop: '--card-1', e: 1 },
      { prop: '--card-0-px', e: 0, u: 'px' },
      { prop: '--card-0-pct', e: 0, u: '%' }
    ])
  })

  it('an author variable keeps its name, and an author calc() is not touched', () => {
    const { ir } = lynx(`--gap: {state.gap}; .a { width: calc(var(--n) * 1px); margin: var(--gap) }`)
    expect( ir.css ).toBe('.lips-card .a{width:calc(var(--n) * 1px);margin:var(--gap);}')
    expect( ir.binds ).toEqual([{ prop: '--gap', e: 0 }])
  })

  it('registers no @property: Lynx has none', () => {
    const { ir } = lynx(`.a { width: {state.w}px }`)
    expect( ir.css ).not.toContain('@property')
    expect( ir.props ).toBeUndefined()
  })
})

describe('Lynx lint: what parses but does nothing on Lynx', () => {
  it('selectors: attributes, pseudo-elements, pseudo-classes that never match, HTML type names', () => {
    expect( found(`
[data-x] { color: red }
.a::before { color: red }
.a:after { color: red }
li:first-child { color: red }
.a:nth-child(2) { color: red }
.a:hover { color: red }
div .a, p { color: red }`) ).toEqual([
      [ 'LIPS-L001', 'error', 2, 1 ],
      [ 'LIPS-L002', 'error', 3, 1 ],
      [ 'LIPS-L002', 'error', 4, 1 ],
      [ 'LIPS-L003', 'error', 5, 1 ],
      [ 'LIPS-L005', 'error', 5, 1 ],
      [ 'LIPS-L003', 'error', 6, 1 ],
      [ 'LIPS-L004', 'warning', 7, 1 ],
      [ 'LIPS-L005', 'error', 8, 1 ],
      [ 'LIPS-L005', 'error', 8, 1 ]
    ])
  })

  it('what matches on Lynx is quiet', () => {
    expect( found(`
.a:not(.b) > .c + .d ~ .e { color: red }
.a:active, .a:focus, :root { color: red }
view .a, text, image, scroll-view { color: red }
#id.cls { color: red }
& .a { color: red }`) ).toEqual( [] )
  })

  it('at-rules: unsupported is an error, untested a warning; keyframe selectors are not style selectors', () => {
    expect( found(`
@container (min-width: 1px) { .a { color: red } }
@supports (display: grid) { .a { color: red } }
@layer base { .a { color: red } }
@media (max-width: 1px) { .a { color: red } }
@keyframes k { from { opacity: 0 } 50% { opacity: 1 } }
@font-face { font-family: x; src: url(x.ttf) }`) ).toEqual([
      [ 'LIPS-L006', 'error', 2, 1 ],
      [ 'LIPS-L007', 'warning', 3, 1 ],
      [ 'LIPS-L007', 'warning', 4, 1 ]
    ])
  })

  it('declarations: unknown properties, min()/max()/clamp(), calc() off lengths, !important', () => {
    expect( found(`.a {
  float: left;
  width: min(10px, 2px);
  height: clamp(1px, 2px, 3px);
  opacity: calc(1 - 0.5);
  transform: calc(1px);
  color: red !important;
}`) ).toEqual([
      [ 'LIPS-L008', 'warning', 2, 3 ],
      [ 'LIPS-L009', 'error', 3, 3 ],
      [ 'LIPS-L009', 'error', 4, 3 ],
      [ 'LIPS-L010', 'error', 5, 3 ],
      [ 'LIPS-L010', 'error', 6, 3 ],
      [ 'LIPS-L011', 'warning', 7, 3 ]
    ])
  })

  it('no false alarms: calc() on lengths, minmax(), custom properties, the binds the compiler wrote', () => {
    expect( found(`.a {
  width: calc(100% - 10px);
  margin-top: calc(var(--x) * 2);
  grid-template-columns: minmax(10px, 1fr);
  --anything-goes: clamp(1px, 2px, 3px);
  padding: {state.p}px;
  border-radius: {state.r}px;
  -x-auto-font-size: true;
}`) ).toEqual( [] )
  })

  it("the demo's sheet compiles clean", () => {
    const { ir, diagnostics } = lynx( demoSheet, 'app' )
    expect( diagnostics ).toEqual( [] )
    // …and it is the sheet tier B checks: four binds, one with a percentage
    expect( ir.binds.map( b => b.prop ) ).toEqual([ '--accent', '--app-1-px', '--app-2-px', '--app-3-pct' ])
    expect( ir.css ).toContain('.lips-app .title{')
  })

  it('a diagnostic carries a hint and points at the statement, not the space before it', () => {
    const [ d ] = lynx(`.a { color: red }\n\n   .b::before { color: red }`).diagnostics
    expect( d ).toMatchObject({ code: 'LIPS-L002', loc: { line: 3, col: 4 } })
    expect( d.hint ).toBeTruthy()
  })
})

describe('Lynx page config', () => {
  it('turns on what the pipeline relies on', () => {
    expect( LYNX_PAGE_CONFIG ).toEqual({
      enableCSSInlineVariables: true,
      enableCSSRule: true,
      enableCSSInheritance: true
    })
  })
})
