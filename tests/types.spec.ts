import { describe, it, expect, expectTypeOf, beforeEach } from 'vitest'
import Lips, { component, compileStyle, compileTemplate } from '../src/lips'
import type * as Public from '../src/lips'
import type { Component, Rendered, Shape, Self, Handlers, Hooks, LipsConfig, Plugin } from '../src/lips'
import { precompile } from '../src/precompile'

/**
 * The public TypeScript surface, pinned.
 *
 * This file is compiled by `npm run typecheck` (tsconfig.test.json
 * includes tests/), so a type regression fails the build even though
 * the runtime assertions below would still pass. Each `@ts-expect-error`
 * is a check too: a line that stops being an error fails the typecheck.
 *
 * `SharedContext` is augmented in `tests/types/shared-context.ts`, its own
 * project: an augmentation here would type the context of every spec.
 */

beforeEach( () => { document.body.innerHTML = '' } )

// ---------------------------------------------------------------- inferred
const counter = component({
  state: { count: 0, label: 'Clicks' },
  static: { max: 10 },
  watchContext: [ 'theme' ],
  default: `<div class="host"><b class="n">{state.count}</b></div>`,
  stylesheet: `.n { font-size: {state.count}px }`,
  handler: {
    increment(){
      // `this` is the component, each part read from its value
      expectTypeOf( this.state.count ).toEqualTypeOf<number>()
      expectTypeOf( this.state.label ).toEqualTypeOf<string>()
      expectTypeOf( this.static.max ).toEqualTypeOf<number>()
      expectTypeOf( this.input ).toEqualTypeOf<{}>()
      expectTypeOf( this.node ).toEqualTypeOf<Element[]>()

      // A sibling handler, with its own signature
      expectTypeOf( this.add ).toEqualTypeOf<( by: number ) => void>()
      this.add( 1 )
      // @ts-expect-error — a sibling the component does not have
      this.ad( 1 )
      // @ts-expect-error — a state key it does not have
      this.state.cont
      // @ts-expect-error — no input is named, so none is read
      this.input.tone
    },
    add( by: number ){ this.state.count += by },
    onMount(){
      // A hook's `this` is the same
      expectTypeOf( this.state.count ).toEqualTypeOf<number>()
      expectTypeOf( this.increment ).toEqualTypeOf<() => void>()
      expectTypeOf( this ).toMatchTypeOf<Self<Shape<{ state: { count: number, label: string }, static: { max: number } }>>>()
    },
    onError( error ){ expectTypeOf( error ).toEqualTypeOf<Error>() }
  }
})

type Pick = { picked: string | null, items: string[] }

/** What no value shows is named, by part */
const picker = component<{ input: { tone: string }, state: Pick }>()({
  state: { picked: null, items: [] },
  static: { api: '/x' },
  default: `<i class="p">{input.tone}</i>`,
  handler: {
    onInput(){
      expectTypeOf( this.input.tone ).toEqualTypeOf<string>()
      expectTypeOf( this.state.picked ).toEqualTypeOf<string | null>()
      // An unnamed part is still inferred beside the named ones
      expectTypeOf( this.static.api ).toEqualTypeOf<string>()
    },
    pick( item: string ){ this.state.picked = item; this.state.items.push( item ) }
  }
})

describe('component() infers a component', () => {
  it('returns the object it is given, in both forms', () => {
    const plain = { default: `<i/>`, state: { n: 1 } }
    expect( component( plain ) ).toBe( plain )
    expect( component<{ input: { a: number } }>()( plain ) ).toBe( plain )
  })

  it('render() reads the shape back: state and input typed, no annotation', () => {
    const lips = new Lips()
    const c = lips.render('counter', counter )

    expectTypeOf( c ).toEqualTypeOf<Rendered<Shape<{ state: { count: number, label: string }, static: { max: number } }>>>()
    expectTypeOf( c.state.count ).toEqualTypeOf<number>()
    // @ts-expect-error — count is a number, not any
    const text: string = c.state.count

    c.appendTo( document.body )
    c.state.count = 5
    expect( document.querySelector('.n')?.textContent ).toBe('5')
    expect( text ).toBe( 0 )
  })

  it('a component with no handler is read back too', () => {
    // Inferred from the shape the component carries, not from a handler's `this`
    const plain = component({ state: { n: 1 }, default: `<i class="q">{state.n}</i>` })
    const c = new Lips().render('plain', plain ).appendTo( document.body )

    expectTypeOf( c.state.n ).toEqualTypeOf<number>()
    expect( document.querySelector('.q')?.textContent ).toBe('1')

    // A copy under another scope is no `Component<…>` by name any more: the shape it carries is what is read
    const copy = new Lips().render('copy', { ...plain, name: 'copy' })
    expectTypeOf( copy.state.n ).toEqualTypeOf<number>()
  })

  it('types the input render() is handed', () => {
    const lips = new Lips()
    const c = lips.render('picker', picker, { tone: 'red' }).appendTo( document.body )

    expectTypeOf( c.state.picked ).toEqualTypeOf<string | null>()
    expect( document.querySelector('.p')?.textContent ).toBe('red')

    // @ts-expect-error — tone is a string
    lips.render('picker', picker, { tone: 1 })
    // @ts-expect-error — a state that contradicts what is named
    component<{ state: Pick }>()({ state: { picked: 1, items: [] } })
  })

  it('refuses a handler named after a member, as register() does at runtime', () => {
    // @ts-expect-error — `emit` is the component's own
    const typed = component({ handler: { emit(){} } })
    expect( () => new Lips().register( 'bad', typed ) ).toThrow( /reserved/ )
  })

  it('root() and precompile() keep the shape', () => {
    document.body.innerHTML = '<div id="app"></div>'
    const lips = new Lips()
    const { template } = precompile( counter, { name: 'counter' })

    expectTypeOf( lips.render('pre', template ).state.count ).toEqualTypeOf<number>()
    expectTypeOf( lips.root( counter, '#app' ).state.label ).toEqualTypeOf<string>()
    expect( document.querySelector('#app .n')?.textContent ).toBe('0')
  })

  it('a typed component goes wherever a component does', () => {
    const bare: Component = counter
    const plugin: Plugin = { name: 'p', components: { counter, picker } }
    const lips = new Lips().register('the-counter', counter ).register('the-picker', picker )

    expect( lips.use( plugin ) ).toBe( lips )
    expect( bare ).toBe( counter )
  })
})

// -------------------------------------------------------------- by hand
describe('typed by hand', () => {
  it('Shape names its parts: what it names is exact, what it leaves out empty', () => {
    type S = Shape<{ input: { tone: string } }>

    expectTypeOf<S['input']>().toEqualTypeOf<{ tone: string }>()
    expectTypeOf<S['state']>().toEqualTypeOf<{}>()
    expectTypeOf<S['context']>().toEqualTypeOf<Record<string, any>>()
    // Bare, nothing is typed
    expectTypeOf<Shape['state']>().toBeAny()
  })

  it('Handlers types a handler written apart, for module exports', () => {
    type S = Shape<{ state: { count: number } }>
    const handler: Handlers<S> = {
      bump(){ this.state.count += 1 },
      onError( error ){ expectTypeOf( error ).toEqualTypeOf<Error>() },
      // @ts-expect-error — a hook takes what Hooks says
      onMount( extra: string ){}
    }
    const c = new Lips().render('h', { state: { count: 0 }, handler } as Component<S> )

    expectTypeOf( c.state.count ).toEqualTypeOf<number>()
    expect( c.state.count ).toBe( 0 )
  })

  it('Hooks lists the lifecycle', () => {
    expectTypeOf<keyof Hooks>().toEqualTypeOf<'onCreate' | 'onInput' | 'onMount' | 'onRender' | 'onUpdate' | 'onAttach' | 'onDetach' | 'onContext' | 'onError' | 'onDestroy'>()
  })

  it('an untyped component stays permissive', () => {
    const lips = new Lips()
    const c = lips.render('loose', {
      state: { n: 1 },
      default: `<i>{state.n}</i>`,
      handler: { a(){ this.state.anything; this.anyHandler() } }
    })

    expectTypeOf( c.state.n ).toBeAny()
    c.state.whatever = 2
    expect( c.state.n ).toBe( 1 )
  })

  it('the old names and the old `context` field are gone', () => {
    // @ts-expect-error — `Shape`, named
    type A = Public.Metavars
    // @ts-expect-error — `Component`
    type B = Public.Template
    // @ts-expect-error — `Handlers`
    type C = Public.Handler
    // @ts-expect-error — `Self`
    type D = Public.ComponentSelf
    // @ts-expect-error — `Hooks`
    type E = Public.LifecycleEvents

    // @ts-expect-error — `watchContext`
    const old: Component = { context: [ 'theme' ] }
    expect( old ).toBeTruthy()
  })
})

// ---------------------------------------------------------- the instance
describe('the Lips instance', () => {
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
})

describe('precompiled artifacts are typed', () => {
  it('Component accepts ir and style', () => {
    const { template } = precompile({
      default: `<i class="p">{state.n}</i>`,
      state: { n: 4 },
      stylesheet: `.p { width: {state.n}px }`
    }, { name: 'pre' })

    const tpl: Component<Shape<{ state: { n: number } }>> = {
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

describe('every documented field is in the types', () => {
  it('name, static and watchContext, and precompile() keeps them typed', () => {
    const page: Component = { name: 'page-home', static: { api: '/x' }, watchContext: [ 'theme' ], default: '<p/>' }
    const { template } = precompile( page )

    expectTypeOf( template.name ).toEqualTypeOf<string | undefined>()
    expectTypeOf( template.watchContext ).toEqualTypeOf<string[] | undefined>()
    expect( template ).toMatchObject({ name: 'page-home', static: { api: '/x' }, watchContext: [ 'theme' ] })
  })
})

describe('static constants', () => {
  it('accepts `static` in an object literal, and `_static` from module exports', () => {
    /**
     * `static` is reserved in strict mode, so `export const static = …`
     * is a SyntaxError and the named-export form must use `_static`.
     * An object literal has no such problem — both are the same field.
     */
    const lips = new Lips()

    const plain = lips.render('plain', {
      static: { max: 10 },
      default: `<i class="a">{static.max}</i>`
    }).appendTo( document.body )

    expect( document.querySelector('.a')?.textContent ).toBe('10')
    expect( plain ).toBeTruthy()

    document.body.innerHTML = ''

    // the module-export spelling still works
    lips.render('underscored', {
      _static: { max: 20 },
      default: `<i class="b">{static.max}</i>`
    }).appendTo( document.body )

    expect( document.querySelector('.b')?.textContent ).toBe('20')
  })

  it('reads the same value as this.static in a handler', () => {
    const seen: any[] = []
    const lips = new Lips()

    lips.render('h', {
      static: { api: 'https://x' },
      default: `<i/>`,
      handler: { onMount(){ seen.push( this.static.api ) } }
    }).appendTo( document.body )

    expect( seen ).toEqual([ 'https://x' ])
  })

  it('prefers `static` when both are present', () => {
    const lips = new Lips()
    lips.render('both', {
      static: { v: 'new' },
      _static: { v: 'old' },
      default: `<i class="c">{static.v}</i>`
    }).appendTo( document.body )

    expect( document.querySelector('.c')?.textContent ).toBe('new')
  })
})
