import { describe, it, expect } from 'vitest'
import {
  parseTemplate,
  parseSFC,
  type ElementNode,
  type TemplateNode
} from '../src/ir/parser'

const parse = ( src: string ) => parseTemplate( src )
const clean = ( src: string ) => {
  const r = parse( src )
  expect( r.diagnostics, `diagnostics for: ${src}` ).toEqual( [] )
  return r.root
}
const el = ( node: TemplateNode ) => node as ElementNode
const attr = ( node: TemplateNode, name: string ) =>
  el( node ).attrs.find( a => 'name' in a && a.name === name ) as any
const attrOf = ( node: TemplateNode, kind: string ) =>
  el( node ).attrs.find( a => a.k === kind ) as any

describe('elements & structure', () => {
  it('parses nested elements', () => {
    const root = clean(`<div><span>hi</span></div>`)
    const div = el( root.children[0] )

    expect( div.tag ).toBe('div')
    const span = el( div.children[0] )
    expect( span.tag ).toBe('span')
    expect( span.children[0] ).toMatchObject({ t: 'text', value: 'hi' })
  })

  it('parses self-closing and void elements', () => {
    const root = clean(`<div><br><img src="x.png"/><input value=state.v></div>`)
    const div = el( root.children[0] )

    expect( div.children.map( c => el( c ).tag ) ).toEqual([ 'br', 'img', 'input' ])
    expect( div.children.every( c => el( c ).selfClosed ) ).toBe( true )
  })

  it('parses fragments', () => {
    const root = clean(`<><span>a</span><span>b</span></>`)
    const frag = root.children[0] as any

    expect( frag.t ).toBe('fragment')
    expect( frag.children ).toHaveLength( 2 )
  })

  it('parses <for> inside <table> — the innerHTML killer', () => {
    const root = clean(`
      <table><tbody>
        <for [row] in=state.rows by="id">
          <tr><td>{row.id}</td></tr>
        </for>
      </tbody></table>`)

    const table = el( root.children[0] )
    const tbody = el( table.children[0] )
    const forEl = el( tbody.children[0] )

    expect( forEl.tag ).toBe('for')
    expect( attrOf( forEl, 'args' ).names ).toEqual([ 'row' ])
    expect( attr( forEl, 'in' ) ).toMatchObject({ k: 'expr', source: 'state.rows' })
    expect( attr( forEl, 'by' ) ).toMatchObject({ k: 'literal', value: 'id' })

    const tr = el( forEl.children[0] )
    expect( tr.tag ).toBe('tr')
    expect( el( tr.children[0] ).tag ).toBe('td')
  })

  it('drops whitespace-only text between elements but keeps it in <pre>', () => {
    const spaced = clean(`<div>  <span>x</span>  </div>`)
    expect( el( spaced.children[0] ).children ).toHaveLength( 1 )

    const pre = clean(`<pre>  keep\n  this  </pre>`)
    expect( el( pre.children[0] ).children[0] ).toMatchObject({ t: 'text', value: '  keep\n  this  ' })
  })

  it('decodes common entities in text and literal attrs', () => {
    const root = clean(`<span title="A &amp; B">x &lt; y</span>`)
    expect( attr( root.children[0], 'title' ).value ).toBe('A & B')
    expect( el( root.children[0] ).children[0] ).toMatchObject({ t: 'text', value: 'x < y' })
  })

  it('parses comments', () => {
    const root = clean(`<div><!-- note --></div>`)
    expect( el( root.children[0] ).children[0] ).toMatchObject({ t: 'comment', value: ' note ' })
  })
})

describe('interpolation', () => {
  it('splits text into parts', () => {
    const root = clean(`<p>Hi {state.name}, you have {state.count} items</p>`)
    const interp = el( root.children[0] ).children[0] as any

    expect( interp.t ).toBe('interp')
    expect( interp.parts ).toMatchObject([
      'Hi ', { expr: 'state.name' }, ', you have ', { expr: 'state.count' }, ' items'
    ])
  })

  it('handles nested braces (object literals) inside interpolations', () => {
    const root = clean(`<p>{ { a: state.count }.a }</p>`)
    const interp = el( root.children[0] ).children[0] as any

    expect( interp.parts[0].expr ).toBe('{ a: state.count }.a')
  })

  it('handles braces inside strings within interpolations', () => {
    const root = clean(`<p>{ '}' + state.x }</p>`)
    const interp = el( root.children[0] ).children[0] as any

    expect( interp.parts[0].expr ).toBe(`'}' + state.x`)
  })
})

describe('attribute classification', () => {
  const node = () => el( clean(`
    <widget
      title="Hello"
      class="btn {state.cls}"
      count=state.count
      handler={ ( e ) => self.onChange( e ) }
      checked
      !disabled
      on-click( select, row.id )
      ...state.extra
    ></widget>`).children[0] )

  it('literal', () => expect( attr( node(), 'title' ) ).toMatchObject({ k: 'literal', value: 'Hello' }) )
  it('interpolated', () => {
    const a = attr( node(), 'class' )
    expect( a.k ).toBe('interp')
    expect( a.parts ).toMatchObject([ 'btn ', { expr: 'state.cls' } ])
  })
  it('unquoted expression', () => expect( attr( node(), 'count' ) ).toMatchObject({ k: 'expr', source: 'state.count' }) )
  it('braced expression allows spaces', () =>
    expect( attr( node(), 'handler' ) ).toMatchObject({ k: 'expr', source: '( e ) => self.onChange( e )' }) )
  it('boolean true / negated false', () => {
    expect( attr( node(), 'checked' ) ).toMatchObject({ k: 'bool', value: true })
    expect( attr( node(), 'disabled' ) ).toMatchObject({ k: 'bool', value: false })
  })
  it('event instruction', () =>
    expect( attr( node(), 'click' ) ).toMatchObject({ k: 'event', source: 'select, row.id' }) )
  it('spread', () => expect( attrOf( node(), 'spread' ).source ).toBe('state.extra') )
})

describe('sugar heads & special forms', () => {
  it('parses <if>/<else-if>/<else> heads', () => {
    const root = clean(`
      <if( state.on )><b>yes</b></if>
      <else-if( state.count > 2 )><b>maybe</b></else-if>
      <else><b>no</b></else>`)

    const [ ifEl, elifEl, elseEl ] = root.children.map( el )
    expect( ifEl.head?.expr ).toBe('state.on')
    expect( elifEl.head?.expr ).toBe('state.count > 2')
    expect( elseEl.head ).toBeUndefined()
  })

  it('parses <switch> head and <log>', () => {
    const root = clean(`<switch( state.mode )><case is="a">A</case><default>D</default></switch><log( state.x, 'dbg' )></log>`)

    expect( el( root.children[0] ).head?.expr ).toBe('state.mode')
    expect( el( root.children[1] ).head?.expr ).toBe(`state.x, 'dbg'`)
  })

  it('parses <async await(…)> as fn attribute', () => {
    const root = clean(`<async await( context.getUser( state.id ) )><then [user]><p>{user.name}</p></then></async>`)
    const asyncEl = el( root.children[0] )

    expect( attrOf( asyncEl, 'fn' ) ).toMatchObject({ name: 'await', source: 'context.getUser( state.id )' })
    expect( attrOf( el( asyncEl.children[0] ), 'args' ).names ).toEqual([ 'user' ])
  })

  it('rejects heads on non-sugar tags', () => {
    const { diagnostics } = parse(`<div( state.x )>x</div>`)
    expect( diagnostics.some( d => d.code === 'LIPS-P011' ) ).toBe( true )
  })

  it('parses dynamic tags with attrs and content', () => {
    const selfClosed = clean(`<{state.page} params=state.params/>`)
    const dyn = el( selfClosed.children[0] )

    expect( dyn.tag ).toBe('#dynamic')
    expect( dyn.dynamicTag?.expr ).toBe('state.page')
    expect( attr( dyn, 'params' ) ).toMatchObject({ k: 'expr', source: 'state.params' })

    const withContent = clean(`<{state.wrap}><span>inside</span></>`)
    expect( el( withContent.children[0] ).children ).toHaveLength( 1 )
  })
})

describe('diagnostics & recovery', () => {
  it('never throws on garbage', () => {
    for( const src of [ `<`, `<<>>`, `<div`, `<div ...`, `{`, `<div a=">`, `</nope>`, `<p>{ unclosed`, `<!-- open` ])
      expect( () => parse( src ), src ).not.toThrow()
  })

  it('reports unterminated comment with position', () => {
    const { diagnostics } = parse(`<div></div><!-- oops`)
    const d = diagnostics.find( d => d.code === 'LIPS-P003' )!
    expect( d.loc.offset ).toBe( 11 )
  })

  it('reports line/col on later lines', () => {
    const { diagnostics } = parse(`<div>\n  <span>ok</span>\n  </p>\n</div>`)
    const d = diagnostics.find( d => d.code === 'LIPS-P005' )!
    expect( d.loc.line ).toBe( 3 )
    expect( d.loc.col ).toBe( 3 )
  })

  it('recovers from a stray close inside an element — children resume', () => {
    const { root, diagnostics } = parse(`<div><i>a</i></p><i>b</i></div>`)
    const div = el( root.children[0] )

    expect( diagnostics.some( d => d.code === 'LIPS-P005' ) ).toBe( true )
    expect( div.children.map( c => el( c ).tag ) ).toEqual([ 'i', 'i' ])
  })

  it('auto-closes via ancestor match with a hint', () => {
    const { root, diagnostics } = parse(`<div><span>x</div>`)
    const d = diagnostics.find( d => d.code === 'LIPS-P004' )!

    expect( d.severity ).toBe('warning')
    expect( d.hint ).toContain('</span>')
    // structure recovered: span auto-closed inside div
    expect( el( el( root.children[0] ).children[0] ).tag ).toBe('span')
  })

  it('reports unclosed element at EOF', () => {
    const { diagnostics } = parse(`<div><span>x</span>`)
    expect( diagnostics.some( d => d.code === 'LIPS-P006' ) ).toBe( true )
  })

  it('reports unterminated interpolation', () => {
    const { diagnostics } = parse(`<p>{ state.x</p>`)
    expect( diagnostics.some( d => d.code === 'LIPS-P007' ) ).toBe( true )
  })
})

describe('.lips SFC parsing', () => {
  const sfc = `import type { Handler } from '@lipsjs/lips'

const state = {
  time: 'morning',
  users: { a: 1 }
}

const handler: Handler<any> = {
  handleConnect( online: boolean ){
    this.state.online = online
  }
}

<div component="Greet">
  <span @text=input.person>me</span>
  <for [x] from="0" to="2">
    <if( state.time == 'morning' )><span on-click( handleConnect, !state.online )>Hi {x}</span></if>
    <else><span>Bye</span></else>
  </for>
</div>`

  it('splits frontscript from template', () => {
    const { script, root, diagnostics } = parseSFC( sfc )

    expect( diagnostics ).toEqual( [] )
    expect( script ).toContain(`import type { Handler }`)
    expect( script ).toContain(`handleConnect`)
    expect( script ).not.toContain(`<div component`)

    const div = el( root.children[0] )
    expect( div.tag ).toBe('div')
    expect( attr( div, 'component' ).value ).toBe('Greet')

    const forEl = el( div.children.map( el ).find( e => e.tag === 'for' )! )
    expect( attr( forEl, 'from' ) ).toMatchObject({ k: 'literal', value: '0' })
  })

  it('is not fooled by braces/strings in the script section', () => {
    const tricky = `const x = { a: '<div>not a template</div>' }\nconst y = 1 < 2\n\n<p>{ state.ok }</p>`
    const { script, root } = parseSFC( tricky )

    expect( script ).toContain(`not a template`)
    expect( el( root.children[0] ).tag ).toBe('p')
  })

  it('treats template-only sources as pure template', () => {
    const { script, root } = parseSFC(`<div>plain</div>`)
    expect( script ).toBe('')
    expect( el( root.children[0] ).tag ).toBe('div')
  })
})
