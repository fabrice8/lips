/**
 * RFC-006 L3 — templates on Lynx, test tier A: the vocabulary pass of
 * `compileLynxTemplate`. Text is wrapped where one text element can hold
 * it, and everything Lynx would silently not render is a diagnostic on
 * the source. That the wrapped text renders is proven at tier B.
 */
import { describe, it, expect } from 'vitest'
import { compileTemplate } from '../src/ir/compiler'
import { compileLynxTemplate } from '../src/lynx/template'
import { TEMPLATE } from '../demos/lynx/src/app'

const nodes = ( src: string ) => {
  const { ir, diagnostics } = compileLynxTemplate( src )
  expect( diagnostics ).toEqual( [] )
  return ir.root.nodes
}

/** code → [ code, severity, line, col ] */
const found = ( src: string ) =>
  compileLynxTemplate( src ).diagnostics.map( d => [ d.code, d.severity, d.loc.line, d.loc.col ] )

describe('Lynx templates: text goes in a text element', () => {
  it('wraps the inline content of an element that is not text in ONE text', () => {
    // `Save {state.n}` is one bind: the 0 is its anchor
    expect( nodes(`<button>Save {state.n}</button>`) ).toEqual([ [ 'button', {}, [ [ 'text', {}, [ 0 ] ] ] ] ])
  })

  it('inline means text, binds, text-like tags and control flow around them', () => {
    expect( nodes(`<li><b>{state.n}</b> items<if( state.more )>, more</if></li>`) ).toEqual([
      [ 'li', {}, [ [ 'text', {}, [ [ 'b', {}, [ 0 ] ], ' items', 0 ] ] ] ]
    ])
  })

  it("Lynx's own containers get the same rule", () => {
    // Not HTML tags, so they compile as unresolved components: an anchor, and their content as a block
    const { ir } = compileLynxTemplate(`<list-item>Row</list-item><scroll-view>Hi</scroll-view>`)
    expect( ir.root.nodes ).toEqual([ 0, 0 ])
    expect( ir.root.blocks.map( b => ( b as any ).contents.block.nodes ) ).toEqual([
      [ [ 'text', {}, [ 'Row' ] ] ],
      [ [ 'text', {}, [ 'Hi' ] ] ]
    ])
  })

  it('leaves text that is already in a text element, and elements with no text', () => {
    expect( nodes(`<div><p>Hi <b>there</b></p><span>x</span></div>`) ).toEqual([
      [ 'div', {}, [ [ 'p', {}, [ 'Hi ', [ 'b', {}, [ 'there' ] ] ] ], [ 'span', {}, [ 'x' ] ] ] ]
    ])
  })

  it('an i18n marker goes with the text it translates', () => {
    const { ir } = compileLynxTemplate(`<button i18n title="Save">Save</button>`)
    const wrapper = ( ir.root.nodes![ 0 ] as any )[ 2 ][ 0 ]
    expect( wrapper[ 0 ] ).toBe('text')
    expect( ir.root.binds.filter( b => b.t === 'text' ).every( b => ( b as any ).i18n ) ).toBe( true )
    expect( ir.root.binds.some( b => b.t === 'text' ) ).toBe( true )
  })

  it('does not touch what a component does with its content', () => {
    expect( nodes(`<my-card>Text</my-card>`) ).toEqual([ 0 ])
  })

  it('the DOM target is left alone', () => {
    const { ir } = compileTemplate( `<button>Save</button>`, { target: 'tree' })
    expect( ir.root.nodes ).toEqual([ [ 'button', {}, [ 'Save' ] ] ])
  })
})

describe('Lynx templates: what would not render is a diagnostic', () => {
  it('text beside block content is ambiguous: an error at the text', () => {
    expect( found(`<div>\n  Total: <div>{state.n}</div>\n</div>`) ).toEqual([ [ 'LIPS-L102', 'error', 1, 6 ] ])
    expect( found(`<div><if( state.a )>yes</if><div>x</div></div>`) ).toEqual([ [ 'LIPS-L102', 'error', 1, 21 ] ])
    expect( found(`<div>a <my-card/></div>`) ).toEqual([ [ 'LIPS-L102', 'error', 1, 6 ] ])
  })

  it('an HTML tag with no Lynx element, with what to use instead', () => {
    const { diagnostics } = compileLynxTemplate(`<table><tr><td><p>x</p></td></tr></table>\n<p>a<br>b</p>`)
    expect( diagnostics.map( d => [ d.code, d.loc.line, d.loc.col ] ) ).toEqual([
      [ 'LIPS-L101', 1, 1 ], [ 'LIPS-L101', 1, 8 ], [ 'LIPS-L101', 1, 12 ], [ 'LIPS-L101', 2, 5 ]
    ])
    expect( diagnostics[ 0 ].hint ).toMatch( /flex or grid/ )
    expect( diagnostics[ 3 ].message ).toBe('<br> has no Lynx element: it would render nothing')
  })

  it('a list holds list-items only', () => {
    expect( found(`<list><for [r] in=state.rows><div>{r}</div></for></list>`) ).toEqual([ [ 'LIPS-L104', 'error', 1, 30 ] ])
    expect( found(`<list><for [r] in=state.rows><list-item>{r}</list-item></for></list>`) ).toEqual( [] )
  })

  it('text at the top level is a warning: it renders only inside a text element', () => {
    expect( found(`Hello <p>x</p>`) ).toEqual([ [ 'LIPS-L103', 'warning', 1, 1 ] ])
  })

  it('what Lynx renders is quiet: mapped tags, its own elements, inputs and images', () => {
    expect( found(`<section><h1>T</h1><img src="a.png"><input value=state.v><textarea></textarea>
      <scroll-view scroll-y><view><text>t</text></view></scroll-view><blockquote>q</blockquote></section>`) ).toEqual( [] )
  })

  it("the demo's template compiles clean", () => {
    expect( compileLynxTemplate( TEMPLATE ).diagnostics ).toEqual( [] )
  })
})
