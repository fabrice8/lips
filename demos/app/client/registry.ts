/**
 * Component registry.
 *
 * Every name here is deliberately NOT a standard HTML tag. The compiler
 * resolves known HTML tags as ELEMENTS before it consults the registry, so
 * `register('footer', …)` compiles to a bare `<footer></footer>` and the
 * component silently never runs. `header`, `main`, `nav`, `section`,
 * `dialog`, `menu`, `slot`, `output` and `progress` are the same trap —
 * which is why this map is exported: `tests/demo-app.spec.ts` asserts that
 * every key really does compile to a component.
 */
import type { default as Lips, Component } from '../../../src/lips'
import { menu } from '../../../src/parts'

import counter from './components/counter'
import profile from './components/profile'
import navBar from './components/nav-bar'
import langSwitch from './components/lang-switch'
import langTag from './components/lang-tag'
import themeSwitch from './components/theme-switch'
import statTile from './components/stat-tile'
import siteFooter from './components/site-footer'
import notFound from './components/not-found'

export const COMPONENTS: Record<string, Component> = {
  'counter': counter,
  'profile': profile,
  'nav-bar': navBar,
  'lang-switch': langSwitch,
  'lang-tag': langTag,
  'theme-switch': themeSwitch,
  'stat-tile': statTile,
  'site-footer': siteFooter,
  'not-found': notFound
}

export default ( lips: Lips ) => {
  for( const [ name, template ] of Object.entries( COMPONENTS ) )
    lips.register( name, template )

  // A part is a plugin: the menu, and the popover it is built on
  lips.use( menu )
}
