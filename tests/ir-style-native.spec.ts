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

const css = ( src: string, nsp = 'demo' ) => compileStyle( src, { nsp }).ir.css

describe('style compiler without a preprocessor', () => {
  it('really has none wired', () => {
    expect( hasStylePreprocessor() ).toBe( false )
  })

  it('emits a scoped sheet instead of dropping it', () => {
    const out = css(`.track { background: #1a1a1c }`)

    // The bug this replaced: an empty string and a console warning
    expect( out ).not.toBe('')
    expect( out ).toContain('[rel="demo"]')
    expect( out ).toContain('.track')
    expect( out ).toContain('background: #1a1a1c')
  })

  it('still lifts reactive values into custom properties', () => {
    const ir = compileStyle(`.fill { width: {state.percent}%; padding: {state.box} }`, { nsp: 'demo' }).ir

    expect( ir.css ).toContain('calc(var(--demo-0) * 1%)')
    expect( ir.css ).toContain('var(--demo-1)')
    expect( ir.binds.map( b => b.prop ) ).toEqual([ '--demo-0', '--demo-1' ])
  })

  it('leaves the wrap nested — that IS the scoping', () => {
    const out = css(`.a { color: red }`)
    // `[rel="demo"] { .a { … } }`, resolved by native CSS nesting
    expect( out.indexOf('[rel="demo"] {') ).toBeLessThan( out.indexOf('.a') )
  })

  it('keeps nestable at-rules INSIDE the wrap', () => {
    // @media nests natively and must stay scoped
    const out = css(`@media (max-width: 720px) { .grid { gap: 1px } }`)
    expect( out.indexOf('[rel="demo"] {') ).toBeLessThan( out.indexOf('@media') )
  })

  it('hoists @keyframes out — it cannot nest', () => {
    /**
     * CSS nesting only admits at-rules whose body is a rule list, so a
     * @keyframes left inside `[rel="x"] { … }` is dropped by the parser
     * and the animation silently does nothing.
     */
    const out = css(`.a { color: red }\n@keyframes glow { 50% { opacity: 0 } }`)

    expect( out.indexOf('@keyframes glow') ).toBeLessThan( out.indexOf('[rel="demo"] {') )
    expect( out ).toContain('50%')
  })

  it('hoists @font-face and @property too', () => {
    const out = css(`@font-face { font-family: X; src: url(x.woff2) }\n.a { color: red }`)
    expect( out.indexOf('@font-face') ).toBeLessThan( out.indexOf('[rel="demo"] {') )
  })

  it('hoists a statement at-rule that ends in a semicolon', () => {
    const out = css(`@import url("x.css");\n.a { color: red }`)
    expect( out.indexOf('@import') ).toBeLessThan( out.indexOf('[rel="demo"] {') )
    expect( out ).toContain('@import url("x.css");')
  })

  it('does not mistake a brace inside a string for a block', () => {
    const out = css(`.a { content: "@keyframes {" }`)
    expect( out ).toContain('content: "@keyframes {"')
    expect( out ).toContain('[rel="demo"]')
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

    expect( out ).toContain('@layer components {')
    expect( out.indexOf('@layer components {') ).toBeLessThan( out.indexOf('@keyframes') )
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

  it('leaves at-rules unhoisted when a preprocessor is given — it hoists them itself', () => {
    const out = compileStyle(
      `.a { color: red }\n@keyframes k { 50% { opacity: 0 } }`,
      { nsp: 'x', preprocess: css => css }
    ).ir.css
    // handed through untouched: @keyframes still inside the wrap
    expect( out.indexOf('[rel="x"] {') ).toBeLessThan( out.indexOf('@keyframes') )
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
})
