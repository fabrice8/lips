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
import type Lips from '../../../src/lips'

import * as Counter from './components/counter'
import * as Profile from './components/profile'
import * as NavBar from './components/nav-bar'
import * as LangSwitch from './components/lang-switch'
import * as LangTag from './components/lang-tag'
import * as ThemeSwitch from './components/theme-switch'
import * as StatTile from './components/stat-tile'
import * as SiteFooter from './components/site-footer'
import * as NotFound from './components/not-found'

export const COMPONENTS: Record<string, any> = {
  'counter': Counter,
  'profile': Profile,
  'nav-bar': NavBar,
  'lang-switch': LangSwitch,
  'lang-tag': LangTag,
  'theme-switch': ThemeSwitch,
  'stat-tile': StatTile,
  'site-footer': SiteFooter,
  'not-found': NotFound
}

export default ( lips: Lips ) => {
  for( const [ name, template ] of Object.entries( COMPONENTS ) )
    lips.register( name, template )
}
