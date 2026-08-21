/**
 * Guard for `demos/app` — the demo is documentation, so a template that
 * silently does nothing is a wrong claim, not a cosmetic slip.
 *
 * Every bug this file was written for had already shipped in the demo and
 * was invisible without running it:
 *
 *   style="{ margin: '3rem' }"   an object literal where CSS text goes
 *   register('footer', …)        a component name shadowed by an HTML tag
 *   two pages with no `name`     the second page's stylesheet never injects
 *   @text=i + 1                  an unquoted value ends at the first space
 *
 * Importing `../src/lips` is what wires Stylis, so `compileStyle` here
 * behaves exactly as it does in the browser build.
 */
import { describe, it, expect } from 'vitest'
import '../src/lips'
import { compileTemplate } from '../src/ir/compiler'
import { compileStyle } from '../src/ir/style'
import type { TemplateDiagnostic } from '../src/ir/parser'

import { COMPONENTS } from '../demos/app/client/registry'
import * as App from '../demos/app/client/app'

import * as Home from '../demos/app/client/pages/home'
import * as Reactivity from '../demos/app/client/pages/reactivity'
import * as ControlFlow from '../demos/app/client/pages/control-flow'
import * as AsyncPage from '../demos/app/client/pages/async'
import * as I18nPage from '../demos/app/client/pages/i18n'
import * as StylesPage from '../demos/app/client/pages/styles'
import * as Compose from '../demos/app/client/pages/compose'
import * as Account from '../demos/app/client/pages/account'
import * as Product from '../demos/app/client/pages/product'

type Source = {
  default?: string
  stylesheet?: string
  macros?: string
  name?: string
}

const PAGES: Record<string, Source> = {
  home: Home,
  reactivity: Reactivity,
  'control-flow': ControlFlow,
  async: AsyncPage,
  i18n: I18nPage,
  styles: StylesPage,
  compose: Compose,
  account: Account,
  product: Product
}

const ALL: Record<string, Source> = { app: App, ...PAGES, ...COMPONENTS }

const show = ( ds: TemplateDiagnostic[] ) =>
  ds.map( d => `${d.code} ${d.severity} @${d.loc.line}:${d.loc.col} — ${d.message}` ).join('\n')

describe('demos/app templates compile clean', () => {
  for( const [ id, mod ] of Object.entries( ALL ) )
    it(`${id}`, () => {
      expect( typeof mod.default, `${id} exports no template` ).toBe('string')

      const { diagnostics } = compileTemplate( mod.default!, { macros: mod.macros })
      expect( show( diagnostics ), `template diagnostics in ${id}` ).toBe('')
    })
})

describe('demos/app stylesheets compile clean', () => {
  const styled = Object.entries( ALL ).filter( ( [ , m ] ) => typeof m.stylesheet === 'string' )

  it('there are stylesheets to check', () => expect( styled.length ).toBeGreaterThan( 5 ) )

  for( const [ id, mod ] of styled )
    it(`${id}`, () => {
      const { diagnostics } = compileStyle( mod.stylesheet!, { nsp: mod.name || id })
      expect( show( diagnostics ), `style diagnostics in ${id}` ).toBe('')
    })
})

describe('demos/app wiring invariants', () => {
  /**
   * A route page is placed through a dynamic tag and resolved by
   * `template.name`, which becomes its style NAMESPACE (falling back to
   * 'dynamic'). Two pages sharing a namespace share one injected
   * `<style>`: `Stylesheet.load()` takes a reference to the element
   * already in `<head>` instead of injecting a second one, so the later
   * page's CSS never appears.
   */
  it('every styled page carries a unique name', () => {
    const named = Object.entries( PAGES ).filter( ( [ , p ] ) => p.stylesheet )

    for( const [ id, page ] of named )
      expect( page.name, `page "${id}" needs an exported name` ).toBeTruthy()

    const names = named.map( ( [ , p ] ) => p.name )
    expect( new Set( names ).size, `duplicate page names: ${names}` ).toBe( names.length )
  })

  /**
   * Known HTML tags resolve as ELEMENTS before the registry is consulted,
   * so a component registered as `footer` compiles to an empty <footer>
   * and never runs. Compiling the tag is the check — it needs no copy of
   * the compiler's tag table.
   */
  it('no component is registered under an HTML tag name', () => {
    for( const name of Object.keys( COMPONENTS ) ){
      const { ir } = compileTemplate(`<${name}></${name}>`)
      const child = ir.root.blocks[0] as any

      expect( child?.t, `<${name}> compiles to an element, not a component` ).toBe('comp')
    }
  })

  it('registered components all carry a template', () => {
    for( const [ name, mod ] of Object.entries( COMPONENTS ) )
      expect( typeof mod.default, `<${name}> has no template` ).toBe('string')
  })

  /**
   * A sheet is wrapped as `[rel="<nsp>"] { … }`, so every selector in it is
   * a DESCENDANT selector — and a component's own root is the element
   * carrying `rel`, not a descendant of it. Styling the root therefore has
   * to be top-level declarations, which show up as a bare `[rel="x"]{…}`
   * rule with no combinator after the attribute selector.
   */
  it('components that style their own root do so with top-level declarations', () => {
    const rootStyled = [ 'counter', 'nav-bar', 'lang-switch', 'theme-switch', 'stat-tile', 'site-footer' ]

    for( const name of rootStyled ){
      const { ir } = compileStyle( ( COMPONENTS[ name ] as Source ).stylesheet!, { nsp: name })
      expect( ir.css, `<${name}> root declarations` ).toMatch(
        new RegExp(`\\[rel="${name}"\\]\\{[^}]`) )
    }
  })
})
