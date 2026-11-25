/**
 * The app, built: what `index.ts` mounts in the browser and what
 * `tests/demo-render.spec.ts` mounts in a test — one setup, so the demo the
 * tests click through is the demo a reader runs.
 *
 * Imports resolve to `src/` because this demo lives inside the repo — that
 * way `tsc` checks it without a build step first, and it always runs the
 * real source. A published consumer writes `from '@lipsjs/lips'`.
 */
import Lips from '../../../src/lips'

import english from './languages/en.json'
import french from './languages/fr.json'

import registry from './registry'
import shell from './app'

const ROLES = [ 'Engineer', 'Mathematician', 'Rear Admiral', 'Analyst' ]

/** `delay` is how long the stand-in fetch takes: a test passes 0 */
export function boot( target: string, { delay = 900 } = {} ){
  /**
   * `lang` is NOT context. It used to be mirrored there because there was no
   * way to read the active language from a template — `self.lang` is that
   * accessor now, and `self.setLanguage()` switches it. A context copy would
   * just be a second writer that can drift.
   */
  const lips = new Lips({ lang: 'en-US' })

  lips.setContext({
    online: true,

    /**
     * Stand-in for a real fetch. `fail` lets the profile card drive the
     * `<catch>` arm on demand — an async demo that can only succeed shows
     * half the feature.
     */
    getUser( name: string, fail?: boolean ){
      return new Promise<{ name: string, email: string, role: string }>( ( resolve, reject ) => {
        setTimeout( () => {
          if( fail ) return reject(`Lookup for "${name}" failed — the provider rejected`)

          resolve({
            name,
            email: `${name.toLowerCase().replace( /[^a-z]+/g, '.' )}@example.dev`,
            role: ROLES[ name.length % ROLES.length ]
          })
        }, delay )
      })
    }
  })

  lips.i18n.setDictionary('en', english )
  lips.i18n.setDictionary('fr', french )

  registry( lips )

  const app = lips.root( shell, target )

  /**
   * The component bus runs both ways, so the holder of the root handle can
   * send commands in. `context.toast` is that command, published so any
   * component can raise one without reaching for the handle itself.
   */
  lips.setContext('toast', ( text: string, tone = 'info' ) => app.emit('toast', text, tone ) )

  return { lips, app }
}
