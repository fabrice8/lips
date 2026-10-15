/**
 * The style compiler with NO preprocessor — the default since Stylis
 * became opt-in (`@lipsjs/lips/stylis`).
 *
 * Deliberately imports nothing that wires one. The scope wrap is
 * ordinary CSS nesting, so the sheet ships as written and the browser
 * resolves it; the compiler's only extra job is lifting out at-rules
 * that cannot legally sit inside a style rule.
 */
import { describe, it, expect } from 'vitest'
import { compileStyle, hasStylePreprocessor } from '../src/ir/style'
import { precompile } from '../src/precompile'
import { stylisPreprocessor } from '../src/stylis'

const css = ( src: string, nsp = 'demo' ) => compileStyle( src, { nsp }).ir.css

describe('style compiler without a preprocessor', () => {
  it('really has none wired', () => {
    expect( hasStylePreprocessor() ).toBe( false )
  })

  it('emits a scoped sheet instead of dropping it', () => {
    const out = css(`.track { background: #1a1a1c }`)

    // The bug this replaced: an empty string and a console warning
    expect( out ).not.toBe('')
    expect( out ).toBe('[rel="demo"]{.track{background:#1a1a1c}}')
  })

  it('still lifts reactive values into custom properties', () => {
    const ir = compileStyle(`.fill { width: {state.percent}%; padding: {state.box} }`, { nsp: 'demo' }).ir

    expect( ir.css ).toContain('calc(var(--demo-0) * 1%)')
    expect( ir.css ).toContain('var(--demo-1)')
    expect( ir.binds.map( b => b.prop ) ).toEqual([ '--demo-0', '--demo-1' ])
  })

  it('leaves the wrap nested — that IS the scoping', () => {
    const out = css(`.a { color: red }`)
    // `[rel="demo"]{.a{…}}`, resolved by native CSS nesting
    expect( out ).toBe('[rel="demo"]{.a{color:red}}')
  })

  it('keeps nestable at-rules INSIDE the wrap', () => {
    // @media nests natively and must stay scoped
    const out = css(`@media (max-width: 720px) { .grid { gap: 1px } }`)
    expect( out ).toBe('[rel="demo"]{@media (max-width: 720px){.grid{gap:1px}}}')
  })

  it('hoists @keyframes out — it cannot nest', () => {
    /**
     * CSS nesting only admits at-rules whose body is a rule list, so a
     * @keyframes left inside `[rel="x"] { … }` is dropped by the parser
     * and the animation silently does nothing.
     */
    const out = css(`.a { color: red }\n@keyframes glow { 50% { opacity: 0 } }`)

    expect( out ).toBe('@keyframes glow{50%{opacity:0}}[rel="demo"]{.a{color:red}}')
  })

  it('hoists @font-face and @property too', () => {
    const out = css(`@font-face { font-family: X; src: url(x.woff2) }\n.a { color: red }`)
    expect( out ).toBe('@font-face{font-family:X;src:url(x.woff2)}[rel="demo"]{.a{color:red}}')
  })

  it('hoists a statement at-rule that ends in a semicolon', () => {
    const out = css(`@import url("x.css");\n.a { color: red }`)
    expect( out ).toBe('@import url("x.css");[rel="demo"]{.a{color:red}}')
  })

  it('does not mistake a brace inside a string for a block', () => {
    const out = css(`.a { content: "@keyframes {" }`)
    expect( out ).toBe('[rel="demo"]{.a{content:"@keyframes {"}}')
  })

  it('still registers @property for unit-suffixed slots', () => {
    const ir = compileStyle(`.a { width: {state.w}px }`, { nsp: 'demo' }).ir
    expect( ir.css ).toContain('@property --demo-0')
    expect( ir.css ).toContain('syntax:"<number>"')
  })

  it('puts the cascade layer around everything, hoisted rules included', () => {
    const out = compileStyle(
      `.a { color: red }\n@keyframes glow { 50% { opacity: 0 } }`,
      { nsp: 'demo', layer: 'components' }
    ).ir.css

    expect( out ).toBe('@layer components{@keyframes glow{50%{opacity:0}}[rel="demo"]{.a{color:red}}}')
  })
})

describe('LipsConfig.stylePreprocessor', () => {
  /**
   * The preprocessor is handed over as a VALUE, not wired by a
   * side-effect import. `@lipsjs/lips` and `@lipsjs/lips/stylis` are
   * separate bundles with separate copies of the style module, so a
   * module-global set from one is invisible to the other — a browser
   * caught that; an in-process test never could, since the whole suite
   * shares one module graph.
   */
  it('is used for that instance and does not leak to the compiler default', async () => {
    const seen: string[] = []
    const { default: Lips } = await import('../src/lips')

    const lips: any = new Lips({ stylePreprocessor: ( css: string ) => { seen.push( css ); return 'FLAT{}' } })
    lips.render('sp', { default: `<b class="s">x</b>`, stylesheet: `.s { color: red }` })
    lips.styleFor('sp', { stylesheet: `.s { color: red }` })

    expect( seen.length ).toBeGreaterThan( 0 )
    expect( seen[0] ).toContain('[rel="sp"]')
    // the module-global default is untouched
    expect( hasStylePreprocessor() ).toBe( false )
  })

  it('the option beats the process-wide default', () => {
    const out = compileStyle(`.a { color: red }`, { nsp: 'x', preprocess: () => 'REPLACED' }).ir.css
    expect( out ).toContain('REPLACED')
  })

  it('hoists before ANY preprocessor runs — a minifier does not hoist', () => {
    const seen: string[] = []
    compileStyle(
      `.a { color: red }\n@keyframes k { 50% { opacity: 0 } }`,
      { nsp: 'x', preprocess: css => ( seen.push( css ), css ) }
    )
    // the preprocessor is never handed a @keyframes stuck inside a style rule
    expect( seen[0] ).toBe('@keyframes k{50%{opacity:0}}[rel="x"]{.a{color:red}}')
  })

  it('Stylis flattens the same hoisted, &-prefixed sheet to plain descendant selectors', () => {
    const out = compileStyle(
      `button, .b { color: red }\n@keyframes k { to { opacity: 1 } }`,
      { nsp: 'x', preprocess: stylisPreprocessor }
    ).ir.css
    expect( out ).toBe('@keyframes k{to{opacity:1;}}[rel="x"] button,[rel="x"] .b{color:red;}')
  })

  it('a Stylis-only selector is accepted without a warning', () => {
    const { ir, diagnostics } = compileStyle(`.btn { &-active { color: red } }`,
      { nsp: 'x', preprocess: stylisPreprocessor })
    expect( diagnostics ).toEqual([])
    expect( ir.css ).toBe('[rel="x"] .btn-active{color:red;}')
  })
})

describe('precompile without a preprocessor', () => {
  it('bakes a real sheet — a build script importing only ./precompile used to get nothing', () => {
    /**
     * `precompile` never wired Stylis, so `compileStyle` hit the
     * no-preprocessor branch, warned, and returned an EMPTY StyleIR.
     * Every stylesheet vanished from a real build pipeline; the existing
     * spec only passed because a sibling import of src/lips had set the
     * module-global preprocessor.
     */
    const { template } = precompile({
      default: `<b class="s">x</b>`,
      state: { w: 9 },
      stylesheet: `.s { width: {state.w}px }`
    }, { name: 'pre' })

    expect( template.style ).toBeDefined()
    expect( template.style!.css ).not.toBe('')
    expect( template.style!.css ).toContain('calc(var(--pre-0) * 1px)')
    expect( template.style!.binds ).toHaveLength( 1 )
  })

  it('takes a preprocessor per call — the only wiring that crosses bundles', () => {
    const { template } = precompile({
      default: `<b class="s">x</b>`,
      stylesheet: `.s { b { color: red } }`
    }, { name: 'pre', preprocess: stylisPreprocessor })

    expect( template.style!.css ).toBe('[rel="pre"] .s b{color:red;}')
    expect( hasStylePreprocessor() ).toBe( false )
  })
})

describe('hoisting edge cases', () => {
  it('keeps the condition around an at-rule hoisted from inside @media', () => {
    // The reduced-motion override must NOT become unconditional
    const out = css(`@keyframes p { to { opacity: 1 } }
      @media (prefers-reduced-motion: reduce) { @keyframes p { to { opacity: .5 } } }`)

    expect( out ).toBe(
      '@keyframes p{to{opacity:1}}'
      + '@media (prefers-reduced-motion: reduce){@keyframes p{to{opacity:.5}}}'
      + '[rel="demo"]{@media (prefers-reduced-motion: reduce){}}' )
  })

  it('carries nested conditions, in order', () => {
    const out = css(`@supports (display: grid) { @media print { @font-face { font-family: P } } }`)
    expect( out.startsWith('@supports (display: grid){@media print{@font-face{font-family:P}}}') ).toBe( true )
  })

  it('lifts one out of a style rule — it was never valid there', () => {
    expect( css(`.a { @keyframes k { to { opacity: 1 } } color: red }`) )
      .toBe('@keyframes k{to{opacity:1}}[rel="demo"]{.a{color:red}}')
  })

  it('does not see an at-rule inside url() or an escaped class name', () => {
    expect( css(`.a { background: url(img@page.png) } .b { color: blue }`) )
      .toBe('[rel="demo"]{.a{background:url(img@page.png)}.b{color:blue}}')
    expect( css(`.sm\\@property { color: red }`) )
      .toBe('[rel="demo"]{.sm\\@property{color:red}}')
  })

  it('hoists the at-rules nesting cannot hold', () => {
    for( const rule of [
      '@font-palette-values --p{font-family:X}',
      '@view-transition{navigation:auto}',
      '@position-try --t{top:anchor(bottom)}',
      '@counter-style thumbs{system:cyclic}',
      '@page :first{margin:1in}'
    ] )
      expect( css(`${rule} .a { color: red }`) ).toBe(`${rule}[rel="demo"]{.a{color:red}}`)
  })

  it('opens the sheet with statement at-rules — ahead of @property and outside @layer', () => {
    const out = compileStyle(
      `@charset "utf-8"; @import url("x.css"); .a { width: {state.w}px }`,
      { nsp: 'demo', layer: 'c' }
    ).ir.css

    expect( out.startsWith('@charset "utf-8";@import url("x.css");@property --demo-0{') ).toBe( true )
    expect( out ).toContain('@layer c{[rel="demo"]{.a{width:calc(var(--demo-0) * 1px)}}}')
  })

  it('leaves a nestable at-rule inside a hoisted one alone', () => {
    expect( css(`@font-feature-values Font One { @styleset { nice: 12 } }`) )
      .toBe('@font-feature-values Font One{@styleset{nice:12}}[rel="demo"]{}')
  })
})

describe('strict-nesting engines (Chrome 112–119, Safari 16.5–17.1)', () => {
  /**
   * Those parse a nested line that starts with an identifier as a
   * declaration and drop it. `& button` is the same selector — a nested
   * relative selector gets an implicit `& ` anyway.
   */
  it('prefixes identifier-led nested selectors with `&`', () => {
    expect( css(`button { color: red }`) ).toBe('[rel="demo"]{& button{color:red}}')
  })

  it('does so per selector in a list, at every depth, and inside @media', () => {
    expect( css(`h1, .x, *, span:hover { a { color: red } }
      @media (max-width: 1px) { li { color: blue } }`) )
      .toBe('[rel="demo"]{& h1,.x,& *,& span:hover{& a{color:red}}@media (max-width: 1px){& li{color:blue}}}')
  })

  it('does not split on commas inside :is() or attribute strings', () => {
    expect( css(`a:is(.b, .c), [d="e,f"] { color: red }`) )
      .toBe('[rel="demo"]{& a:is(.b, .c),[d="e,f"]{color:red}}')
  })

  it('leaves a selector that places `&` itself, and keyframe selectors, alone', () => {
    expect( css(`div & { color: red }`) ).toBe('[rel="demo"]{div &{color:red}}')
    expect( css(`@keyframes k { from { opacity: 0 } to { opacity: 1 } }`) )
      .toBe('@keyframes k{from{opacity:0}to{opacity:1}}[rel="demo"]{}')
  })

  it('does not prefix the top level of a global (meta) sheet — it is not nested', () => {
    expect( compileStyle(`body { margin: 0 } .a { span { color: red } }`, { nsp: 'g', meta: true }).ir.css )
      .toBe('body{margin:0}.a{& span{color:red}}')
  })
})

describe('Stylis-only syntax on the native path', () => {
  it('strips `//` line comments instead of gluing them onto the next selector', () => {
    expect( css(`// header\n.a { color: red } // trailing\n.b { background: url(//cdn/x.png) }`) )
      .toBe('[rel="demo"]{.a{color:red}.b{background:url(//cdn/x.png)}}')
  })

  it('warns on `&-suffix` concatenation, which native nesting cannot express', () => {
    const { diagnostics } = compileStyle(`.btn { &-active { color: red } &.on { color: blue } }`, { nsp: 'demo' })
    expect( diagnostics.map( d => [ d.code, d.severity ] ) ).toEqual([[ 'LIPS-S008', 'warning' ]])
  })
})

describe('malformed braces', () => {
  it('drops a stray `}` instead of closing the scope wrap early', () => {
    const { ir, diagnostics } = compileStyle(`.a { color: red } }\n.b { color: blue }`, { nsp: 'demo' })

    // `.b` stays scoped
    expect( ir.css ).toBe('[rel="demo"]{.a{color:red}.b{color:blue}}')
    expect( diagnostics.map( d => d.code ) ).toEqual([ 'LIPS-S007' ])
  })

  it('closes an unclosed block at the end of the sheet', () => {
    const { ir, diagnostics } = compileStyle(`.a { color: red; .b { color: blue }`, { nsp: 'demo' })

    expect( ir.css ).toBe('[rel="demo"]{.a{color:red;.b{color:blue}}}')
    expect( diagnostics.map( d => d.code ) ).toEqual([ 'LIPS-S007' ])
  })
})

describe('compact output', () => {
  it('drops comments and folds whitespace, but never inside a string', () => {
    expect( css(`
      /* banner */
      .a  .b   {
        margin :  0   auto ;  /* trailing */
        content: "a   b";
      }
    `) ).toBe('[rel="demo"]{.a .b{margin:0 auto;content:"a   b";}}')
  })

  it('keeps the whitespace that is a combinator, and a selector glued by a comment', () => {
    expect( css(`.a :hover { color: red } .b/**/.c { color: blue }`) )
      .toBe('[rel="demo"]{.a :hover{color:red}.b.c{color:blue}}')
  })

  it('keeps an empty custom property a value', () => {
    expect( css(`.a { --x: ; }`) ).toBe('[rel="demo"]{.a{--x: ;}}')
  })
})
