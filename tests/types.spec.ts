import { describe, it, expect, expectTypeOf, beforeEach } from 'vitest'
import Lips, { compileStyle, compileTemplate } from '../src/lips'
import type { Component, Metavars, Template, Handler, ComponentSelf, LipsConfig } from '../src/lips'
import { precompile } from '../src/precompile'

/**
 * The public TypeScript surface, pinned.
 *
 * This file is compiled by `npm run typecheck` (tsconfig.test.json
 * includes tests/), so a type regression fails the build even though
 * the runtime assertions below would still pass. Before this, tsconfig
 * only covered ./src — the exported types were never checked against
 * the API they claim to describe, and `Handler<MT>` had silently
 * drifted out of assignability with what `render()` accepts.
 */

type CounterMT = Metavars<
  { tone: string },                  // Input
  { count: number, label: string },  // State
  { max: number },                   // Static
  { theme: 'dark' | 'light' }        // Context
>

const counter: Template<CounterMT> = {
  state: { count: 0, label: 'Clicks' },
  _static: { max: 10 },
  context: [ 'theme' ],
  default: `<div class="host"><b class="n">{state.count}</b></div>`,
  stylesheet: `.n { color: {input.tone}; font-size: {state.count}px }`,
  handler: {
    increment(){
      // `this` is ComponentSelf<CounterMT> — every surface typed
      expectTypeOf( this.state.count ).toEqualTypeOf<number>()
      expectTypeOf( this.state.label ).toEqualTypeOf<string>()
      expectTypeOf( this.input.tone ).toEqualTypeOf<string>()
      expectTypeOf( this.static.max ).toEqualTypeOf<number>()
      expectTypeOf( this.context.theme ).toEqualTypeOf<'dark' | 'light'>()
      expectTypeOf( this.node ).toEqualTypeOf<Element[]>()

      this.state.count++
    },
    onMount(){ expectTypeOf( this ).toMatchTypeOf<ComponentSelf<CounterMT>>() }
  }
}

beforeEach( () => { document.body.innerHTML = '' } )

describe('typed component surface', () => {
  it('render<MT> gives a typed state handle', () => {
    const lips = new Lips<{ theme: 'dark' | 'light' }>({ context: { theme: 'dark' } })
    const c = lips.render<CounterMT>('counter', counter, { tone: 'red' })

    expectTypeOf( c ).toEqualTypeOf<Component<CounterMT>>()
    expectTypeOf( c.state.count ).toEqualTypeOf<number>()
    expectTypeOf( c.node ).toEqualTypeOf<Element[]>()

    c.appendTo( document.body )
    expect( c.state.count ).toBe( 0 )

    c.state.count = 5
    expect( document.querySelector('.n')?.textContent ).toBe('5')
  })

  it('node returns elements, not range markers', () => {
    /**
     * The docs promise "live root elements". The facade used to leak the
     * block's comment markers, so node[0] was a Comment.
     */
    const lips = new Lips()
    const c = lips.render('plain', { default: `<i class="a">x</i>` }).appendTo( document.body )

    expect( c.node ).toHaveLength( 1 )
    expect( c.node[0] ).toBeInstanceOf( Element )
    expect( c.node[0].className ).toBe('a')
  })

  it('stays permissive when metavars are not declared', () => {
    // No annotation: state reads must still compile, as they always did
    const lips = new Lips()
    const c = lips.render('loose', { state: { n: 1 }, default: `<i>{state.n}</i>` })

    expectTypeOf( c.state.n ).toBeAny()
    c.state.whatever = 2
    expect( c.state.n ).toBe( 1 )
  })

  it('types the shared context', () => {
    type Ctx = { theme: 'dark' | 'light', user: { id: number } }
    const lips = new Lips<Ctx>({ context: { theme: 'dark', user: { id: 1 } } })

    expectTypeOf( lips.getContext() ).toEqualTypeOf<Ctx>()
    expectTypeOf( lips.getContext().user.id ).toEqualTypeOf<number>()

    lips.setContext('theme', 'light')
    lips.setContext({ user: { id: 2 } })
    expect( lips.getContext().theme ).toBe('light')

    // @ts-expect-error — 'missing' is not a context field
    lips.setContext('missing', 1)
  })

  it('accepts every documented config field', () => {
    const config: LipsConfig<{ theme: string }> = {
      debug: true,
      context: { theme: 'dark' },
      styleLayer: 'components',
      engine: 'ir'
    }
    const lips = new Lips( config )
    expect( lips.debug ).toBe( true )
  })

  it('rejects a state shape that contradicts the metavars', () => {
    const bad: Template<CounterMT> = {
      // @ts-expect-error — count must be a number
      state: { count: 'zero', label: 'x' }
    }
    expect( bad ).toBeTruthy()
  })

  it('types Handler independently of the template literal', () => {
    /**
     * The regression that motivated this: Handler<MT> was not assignable
     * to what render() accepted, so the exported type was unusable.
     */
    const handler: Handler<CounterMT> = {
      bump(){ this.state.count += 1 },
      onError( error ){ expectTypeOf( error ).toEqualTypeOf<Error>() }
    }

    const tpl: Template<CounterMT> = { default: `<i>{state.count}</i>`, state: { count: 0, label: '' }, handler }
    const lips = new Lips()
    const c = lips.render<CounterMT>('h', tpl )

    expect( c.state.count ).toBe( 0 )
  })
})

describe('precompiled artifacts are typed', () => {
  it('Template accepts ir and style', () => {
    const { template } = precompile({
      default: `<i class="p">{state.n}</i>`,
      state: { n: 4 },
      stylesheet: `.p { width: {state.n}px }`
    }, { name: 'pre' })

    const tpl: Template<Metavars<{}, { n: number }>> = {
      ir: template.ir,
      style: template.style,
      state: { n: 4 }
    }

    expectTypeOf( tpl.ir! ).toEqualTypeOf( compileTemplate('<i/>').ir )
    expectTypeOf( tpl.style! ).toEqualTypeOf( compileStyle('.a{}', { nsp: 'a' }).ir )

    const lips = new Lips()
    lips.render('pre', tpl ).appendTo( document.body )
    expect( document.querySelector('.p')?.textContent ).toBe('4')
  })
})
