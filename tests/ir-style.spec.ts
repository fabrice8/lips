import { describe, it, expect, beforeEach } from 'vitest'
import Lips from '../src/lips'
import { compileStyle } from '../src/ir/style'
import { compileTemplate } from '../src/ir/compiler'
import { precompile } from '../src/precompile'

// These assert the FLATTENED, prefixed output, so they opt into the
// preprocessor process-wide. The native-nesting path has its own file.
import { useStylis } from '../src/stylis'
useStylis()

/**
 * StyleIR — reactive declarations (RFC-004 Layer 1).
 *
 * jsdom does not run the CSS cascade, so the runtime specs assert the
 * WIRING that makes a reactive declaration work: the custom property
 * written on the scope roots, and its removal when nullish. That is the
 * whole mechanism — the browser does the rest.
 */

const css = ( src: string, nsp = 'demo' ) => compileStyle( src, { nsp }).ir
const codes = ( src: string, nsp = 'demo' ) =>
  compileStyle( src, { nsp }).diagnostics.map( d => d.code )

const sheetOf = ( nsp: string ) =>
  document.head.querySelector(`style[rel="${nsp}"]`)?.textContent || ''

/** Scope roots carry the variables — `component.node` also holds range markers */
const rootOf = ( sel: string ) => document.querySelector( sel ) as HTMLElement
const rootsOf = ( sel: string ) => [ ...document.querySelectorAll( sel ) ] as HTMLElement[]

beforeEach( () => {
  document.body.innerHTML = ''
  document.head.querySelectorAll('style').forEach( s => s.remove() )
})

describe('style compiler: lifting values', () => {
  it('a bare interpolation becomes a var(), a unit suffix becomes calc()', () => {
    const ir = css(`.fill { width: {state.percent}%; padding: {state.box} }`)

    expect( ir.css ).toContain('width:calc(var(--demo-0) * 1%)')
    expect( ir.css ).toContain('padding:var(--demo-1)')
    expect( ir.exprs ).toEqual([ 'state.percent', 'state.box' ])
    expect( ir.binds ).toEqual([
      { prop: '--demo-0', e: 0 },
      { prop: '--demo-1', e: 1 }
    ])
  })

  it('scopes the sheet and leaves static declarations untouched', () => {
    const ir = css(`.track { background: #1a1a1c; border-radius: 999px }`)

    expect( ir.css ).toContain('[rel="demo"] .track')
    expect( ir.css ).toContain('background:#1a1a1c')
    expect( ir.binds ).toEqual([])
    expect( ir.exprs ).toEqual([])
  })

  it('names variables per component — @property registration is document-global', () => {
    /**
     * A bare `--0` would collide across components and the last
     * registration would silently win.
     */
    expect( css(`.a { width: {state.w}px }`, 'card' ).binds[0].prop ).toBe('--card-0')
    expect( css(`.a { width: {state.w}px }`, 'panel' ).binds[0].prop ).toBe('--panel-0')
  })

  it('dedupes repeated expressions onto one variable', () => {
    const ir = css(`.a { color: {input.accent} }\n.b { border-color: {input.accent} }`)

    expect( ir.exprs ).toEqual([ 'input.accent' ])
    expect( ir.binds ).toHaveLength( 1 )
    expect( ir.css.match( /var\(--demo-0\)/g ) ).toHaveLength( 2 )
  })
})

describe('style compiler: the cases style= cannot reach', () => {
  it('lifts a value out of a pseudo-class rule', () => {
    const ir = css(`.btn:hover { background: {input.accent} }`)

    expect( ir.css ).toContain('[rel="demo"] .btn:hover{background:var(--demo-0)')
    expect( ir.binds ).toEqual([ { prop: '--demo-0', e: 0 } ])
  })

  it('lifts a value out of a media query, leaving the condition static', () => {
    const ir = css(`@media (max-width: 720px) { .grid { gap: {state.g}px } }`)

    expect( ir.css ).toContain('@media (max-width: 720px)')
    expect( ir.css ).toContain('gap:calc(var(--demo-0) * 1px)')
    expect( ir.binds ).toHaveLength( 1 )
  })

  it('lifts a value out of a keyframe', () => {
    const ir = css(`@keyframes glow { 50% { box-shadow: 0 0 {state.spread}px #fff } }`)

    expect( ir.css ).toContain('@keyframes glow')
    expect( ir.css ).toContain('box-shadow:0 0 calc(var(--demo-0) * 1px) #fff')
  })
})

describe('style compiler: disambiguation', () => {
  it('does not mistake a nested pseudo-selector for an interpolation', () => {
    /**
     * `a:hover { color: red }` enters value mode on the `:` — the block
     * content has a top-level `:` with no preceding `?`, so it is
     * rejected as an interpolation and stays a selector.
     */
    const ir = css(`.card { a:hover { color: red } }`)

    expect( ir.css ).toContain('[rel="demo"] .card a:hover{color:red')
    expect( ir.binds ).toEqual([])
  })

  it('accepts a ternary, whose colon is preceded by a question mark', () => {
    const ir = css(`.p { background: {context.theme === 'dark' ? '#111' : '#fafafa'} }`)

    expect( ir.exprs ).toEqual([ `context.theme === 'dark' ? '#111' : '#fafafa'` ])
    expect( ir.css ).toContain('background:var(--demo-0)')
  })

  it('leaves an interpolation inside a function call unitless', () => {
    const ir = css(`.g { grid-template-columns: repeat({state.cols}, 1fr) }`)

    expect( ir.css ).toContain('repeat(var(--demo-0), 1fr)')
    expect( ir.props ).toBeUndefined()
  })

  it('lifts a value from a declaration preceded by a comment', () => {
    /**
     * The comment used to be swallowed into the property name, so the
     * declaration was never scanned and the interpolation was misread
     * downstream — inside a function call it reported S002 and was
     * deleted, leaving `rotate()`. Found by bench/particles.html.
     */
    const ir = css(`.a {\n  color: red;\n  /* why */\n  transform: rotate({state.deg}deg)\n}`)

    expect( codes(`.a {\n  /* why */\n  transform: rotate({state.deg}deg)\n}`) ).toEqual([])
    expect( ir.css ).toContain('rotate(calc(var(--demo-0) * 1deg))')
    expect( ir.binds ).toEqual([ { prop: '--demo-0', e: 0 } ])
  })

  it('lifts a value nested inside a function call', () => {
    const ir = css(`.a { transform: translate3d(calc(var(--x) * 1px), 0, 0) rotate({state.d}deg) }`)

    expect( ir.css ).toContain('rotate(calc(var(--demo-0) * 1deg))')
    expect( ir.css ).toContain('translate3d(calc(var(--x) * 1px), 0, 0)')
  })

  it('keeps quoted braces literal', () => {
    const ir = css(`.a::after { content: "{}" }`)

    expect( ir.binds ).toEqual([])
    expect( ir.css ).toContain('content:"{}"')
  })
})

describe('style compiler: direct custom-property binds', () => {
  it('binds the author name and drops the declaration', () => {
    /**
     * RFC-004 §7.4 — aliasing through --demo-0 would break cross-component
     * inheritance and Tailwind interop, both of which need a stable name.
     */
    const ir = css(`--accent: {input.accent};\n.btn { border-color: var(--accent) }`)

    expect( ir.binds ).toEqual([ { prop: '--accent', e: 0 } ])
    expect( ir.css ).not.toContain('--demo-0')
    expect( ir.css ).not.toContain('--accent:')
    expect( ir.css ).toContain('border-color:var(--accent)')
  })

  it('still aliases when the value is not a lone interpolation', () => {
    const ir = css(`--pad: {state.p}px;`)

    expect( ir.binds ).toEqual([ { prop: '--demo-0', e: 0 } ])
    expect( ir.css ).toContain('--pad:calc(var(--demo-0) * 1px)')
  })
})

describe('style compiler: @property registration', () => {
  it('registers a unit-suffixed slot as <number>, matching what the bind writes', () => {
    /**
     * The unit lives in the calc(), so the variable holds a bare number.
     * Registering it as <length>/<percentage> would make every written
     * value invalid — the property falls back to initial-value and the
     * declaration computes to zero. Verified in bench/style-smoke.html.
     */
    const ir = css(`.a { width: {state.w}px; opacity: {state.o} }`)

    expect( ir.props ).toEqual([
      { name: '--demo-0', syntax: '<number>', inherits: true, initial: '0' }
    ])
    expect( ir.css ).toContain('@property --demo-0{syntax:"<number>";inherits:true;initial-value:0}')
    // no unit → used verbatim → nothing to register
    expect( ir.props ).toHaveLength( 1 )
  })
})

describe('style compiler: diagnostics', () => {
  it('S001 — rejects a dynamic selector', () => {
    expect( codes(`{state.sel} { color: blue }`) ).toEqual([ 'LIPS-S001' ])
  })

  it('S002 — rejects a dynamic at-rule condition', () => {
    expect( codes(`@media (max-width: {state.bp}px) { .g { color: red } }`) ).toEqual([ 'LIPS-S002' ])
  })

  it('S003 — rejects a name a stylesheet cannot resolve', () => {
    /**
     * A sheet has no template position, so a <for> iterator or <let>
     * name in one is always a mistake. Without this it silently
     * resolves to undefined and the declaration computes to unset.
     */
    const d = compileStyle(`.row { color: {item.tone} }`, { nsp: 'demo' }).diagnostics

    expect( d.map( x => x.code ) ).toEqual([ 'LIPS-S003' ])
    expect( d[0].message ).toContain(`'item' is not readable`)
    expect( d[0].severity ).toBe('error')
  })

  it('S003 — allows real globals through', () => {
    expect( codes(`.a { width: {Math.min( state.w, 100 )}px; content: {JSON.stringify( state.o )} }`) ).toEqual([])
  })

  it('S003 — does not flag arrow parameters', () => {
    expect( codes(`.a { width: {state.list.filter( n => n > 2 ).length}px }`) ).toEqual([])
  })

  it('S004 — rejects an interpolation with no closing brace', () => {
    expect( codes(`.a { color: {state.c`) ).toEqual([ 'LIPS-S004' ])
  })

  it('S004 — rejects a closing brace that ate the block close', () => {
    // `}` bound to the interpolation, leaving the rule unterminated
    expect( codes(`.a { color: {state.c }`) ).toEqual([ 'LIPS-S004' ])
  })

  it('a trailing declaration without a semicolon is fine', () => {
    expect( codes(`--accent: red`) ).toEqual([])
  })

  it('S004 — rejects a malformed expression', () => {
    expect( codes(`.a { color: {state.} }`) ).toEqual([ 'LIPS-S004' ])
  })

  it('S005 — warns on a unit suffix after a string literal', () => {
    const d = compileStyle(`.a { padding: {'1rem'}px }`, { nsp: 'demo' }).diagnostics

    expect( d.map( x => x.code ) ).toEqual([ 'LIPS-S005' ])
    expect( d[0].severity ).toBe('warning')
  })

  it('carries a usable location', () => {
    const d = compileStyle(`.a {\n  color: red;\n  width: {item.w}px\n}`, { nsp: 'demo' }).diagnostics

    expect( d[0].code ).toBe('LIPS-S003')
    expect( d[0].loc.line ).toBe( 3 )
    expect( d[0].loc.offset ).toBeGreaterThan( 0 )
  })

  it('a valid sheet reports nothing', () => {
    expect( codes(`.a:hover { color: {state.c}; width: {state.w}px }`) ).toEqual([])
  })
})

describe('runtime: a throwing style expression hits the error boundary', () => {
  it('routes to onError instead of escaping', () => {
    const seen: string[] = []
    const lips = new Lips()

    const c = lips.render('boom', {
      state: { n: 1 },
      default: `<div class="host"><b class="x">x</b></div>`,
      stylesheet: `.x { width: {self.blow( state.n )}px }`,
      handler: {
        blow(){ throw new Error('style expression failed') },
        onError( error: Error ){ seen.push( error.message ) }
      }
    })
    c.appendTo( document.body )

    expect( seen ).toEqual([ 'style expression failed' ])
    // the component still rendered — a bad declaration is not fatal
    expect( rootOf('.x') ).not.toBeNull()
  })

  it('keeps re-running the bind after a failure', () => {
    const seen: string[] = []
    const lips = new Lips()

    const c = lips.render('recover', {
      state: { w: null as any },
      default: `<div class="host"><b class="y">y</b></div>`,
      stylesheet: `.y { width: {state.w.deep}px }`,
      handler: { onError( error: Error ){ seen.push( error.constructor.name ) } }
    })
    c.appendTo( document.body )

    expect( seen ).toHaveLength( 1 )

    c.state.w = { deep: 12 }
    expect( rootOf('.host').style.getPropertyValue('--recover-0') ).toBe('12')
  })
})

describe('style compiler: cascade layer', () => {
  it('is absent by default and byte-identical without it', () => {
    const plain = compileStyle(`.a { color: red }`, { nsp: 'demo' }).ir

    expect( plain.css ).not.toContain('@layer')
    expect( plain.css ).toBe('[rel="demo"] .a{color:red;}')
  })

  it('wraps the sheet when requested', () => {
    const layered = compileStyle(`.a { color: red }`, { nsp: 'demo', layer: 'components' }).ir

    expect( layered.css ).toContain('@layer components')
    expect( layered.css ).toContain('[rel="demo"] .a')
  })

  it('reaches the injected sheet through Lips config', () => {
    const lips = new Lips({ styleLayer: 'components' })
    lips.render('layered', {
      state: { w: 3 },
      default: `<div class="host"><b class="a">a</b></div>`,
      stylesheet: `.a { width: {state.w}px }`
    }).appendTo( document.body )

    const sheet = sheetOf('layered')
    expect( sheet ).toContain('@layer components')
    expect( sheet ).toContain('[rel="layered"] .a')
    // reactive declarations still work inside a layer
    expect( rootOf('.host').style.getPropertyValue('--layered-0') ).toBe('3')
  })

  it('leaves the sheet unlayered by default', () => {
    const lips = new Lips()
    lips.render('plain', {
      default: `<div class="host"><b class="a">a</b></div>`,
      stylesheet: `.a { color: red }`
    }).appendTo( document.body )

    expect( sheetOf('plain') ).not.toContain('@layer')
  })

  it('keeps @property registrations outside the layer', () => {
    /**
     * @property is document-global. Nesting it inside @layer would still
     * register, but keeping it at top level matches how it is scoped.
     */
    const layered = compileStyle(`.a { width: {state.w}px }`, { nsp: 'demo', layer: 'components' }).ir

    expect( layered.css.indexOf('@property') ).toBeLessThan( layered.css.indexOf('@layer') )
  })
})

describe('runtime: reactive declarations', () => {
  it('writes the variable on the scope root and updates it in place', () => {
    const lips = new Lips()
    const c = lips.render('bar', {
      state: { percent: 20 },
      default: `<div class="track"><div class="fill"></div></div>`,
      stylesheet: `.fill { width: {state.percent}% }`
    })
    c.appendTo( document.body )

    const root = rootOf('.track')
    expect( root.getAttribute('rel') ).toBe('bar')
    expect( root.style.getPropertyValue('--bar-0') ).toBe('20')

    c.state.percent = 80
    expect( root.style.getPropertyValue('--bar-0') ).toBe('80')

    // the sheet itself is never touched — that is the whole design
    expect( sheetOf('bar') ).toContain('calc(var(--bar-0) * 1%)')
  })

  it('reads input, context and static from component scope', () => {
    const lips = new Lips({ context: { theme: 'dark' } })
    const c = lips.render('chip', {
      _static: { pad: '4px' },
      context: [ 'theme' ],
      default: `<span class="chip">x</span>`,
      stylesheet: `.chip {
        color: {input.accent};
        padding: {static.pad};
        background: {context.theme === 'dark' ? '#111' : '#eee'}
      }`
    }, { accent: '#f87171' })
    c.appendTo( document.body )

    const root = rootOf('.chip')
    expect( root.style.getPropertyValue('--chip-0') ).toBe('#f87171')
    expect( root.style.getPropertyValue('--chip-1') ).toBe('4px')
    expect( root.style.getPropertyValue('--chip-2') ).toBe('#111')

    lips.setContext('theme', 'light')
    expect( root.style.getPropertyValue('--chip-2') ).toBe('#eee')
  })

  it('gives each instance its own value from one shared sheet', () => {
    const lips = new Lips()
    const badge = {
      default: `<span class="badge">x</span>`,
      stylesheet: `.badge { color: {input.tone} }`
    }

    lips.render('badge', badge, { tone: 'red' }).appendTo( document.body )
    lips.render('badge', badge, { tone: 'blue' }).appendTo( document.body )

    const [ a, b ] = rootsOf('.badge')
    expect( a.style.getPropertyValue('--badge-0') ).toBe('red')
    expect( b.style.getPropertyValue('--badge-0') ).toBe('blue')

    // O(1) rules, not O(distinct values)
    expect( document.head.querySelectorAll('style[rel="badge"]') ).toHaveLength( 1 )
  })

  it('removes the property when nullish, so it falls through to an ancestor', () => {
    /**
     * RFC-004 §7.3/§12.2 — "use mine if given, otherwise inherit" is
     * this removal plus normal custom-property inheritance.
     */
    const lips = new Lips()
    const c = lips.render('btn', {
      state: { accent: '#f87171' },
      default: `<button class="btn">x</button>`,
      stylesheet: `--accent: {state.accent}; .btn { border-color: var(--accent) }`
    })
    c.appendTo( document.body )

    const root = rootOf('.btn')
    expect( root.style.getPropertyValue('--accent') ).toBe('#f87171')

    c.state.accent = undefined
    expect( root.style.getPropertyValue('--accent') ).toBe('')
    expect( root.getAttribute('style') || '' ).not.toContain('--accent')
  })

  it('re-binds against the fresh roots after a swap rebuild', () => {
    const lips = new Lips()
    const c = lips.render('panel', {
      state: { gap: 4 },
      default: `<div class="v1"></div>`,
      stylesheet: `.v1, .v2 { gap: {state.gap}px }`
    })
    c.appendTo( document.body )

    expect( rootOf('.v1').style.getPropertyValue('--panel-0') ).toBe('4')

    c.swap( compileTemplate(`<div class="v2"></div>`).ir )

    const root = rootOf('.v2')
    expect( root.className ).toBe('v2')
    expect( root.getAttribute('rel') ).toBe('panel')
    expect( root.style.getPropertyValue('--panel-0') ).toBe('4')

    c.state.gap = 16
    expect( root.style.getPropertyValue('--panel-0') ).toBe('16')
  })

  it('drops the sheet and the binds on destroy', () => {
    const lips = new Lips()
    const c = lips.render('gone', {
      state: { w: 1 },
      default: `<div class="g"></div>`,
      stylesheet: `.g { width: {state.w}px }`
    })
    c.appendTo( document.body )

    expect( sheetOf('gone') ).not.toBe('')
    c.destroy()
    expect( document.head.querySelector('style[rel="gone"]') ).toBeNull()
  })
})

describe('precompile', () => {
  it('emits StyleIR instead of stylesheet source', () => {
    const { template, diagnostics } = precompile({
      default: `<div class="a"></div>`,
      stylesheet: `.a { width: {state.w}px }`
    }, { name: 'card' })

    expect( diagnostics ).toEqual([])
    expect( ( template as any ).stylesheet ).toBeUndefined()
    expect( template.style!.nsp ).toBe('card')
    expect( template.style!.css ).toContain('[rel="card"] .a')
    expect( template.style!.binds ).toEqual([ { prop: '--card-0', e: 0 } ])
    expect( JSON.parse( JSON.stringify( template.style ) ) ).toEqual( template.style )
  })

  it('renders from precompiled StyleIR with no source stylesheet', () => {
    const lips = new Lips()
    const { template } = precompile({
      default: `<div class="a"></div>`,
      state: { w: 12 },
      stylesheet: `.a { width: {state.w}px }`
    }, { name: 'pre' })

    lips.render('pre', template as any ).appendTo( document.body )

    expect( rootOf('.a').style.getPropertyValue('--pre-0') ).toBe('12')
    expect( sheetOf('pre') ).toContain('[rel="pre"] .a')
  })
})
