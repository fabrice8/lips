/**
 * Bootstrap.
 *
 * Imports resolve to `src/` because this demo lives inside the repo — that
 * way `tsc` checks it without a build step first, and it always runs the
 * real source. A published consumer writes `from '@lipsjs/lips'`.
 */
import Lips from '../../../src/lips'

import english from './languages/en.json'
import french from './languages/fr.json'

import registry from './registry'
import * as App from './app'

type Context = {
  online: boolean
  getUser: ( name: string, fail?: boolean ) => Promise<{ name: string, email: string, role: string }>
  /** Set below, once the root handle exists */
  toast: ( text: string, tone?: string ) => void
  /** Published by <router> on attach */
  navigate: ( path: string ) => void
  /** Provided per-subtree by <context lane="…"> on the composition page */
  lane?: string
}

/**
 * `lang` is NOT context. It used to be mirrored there because there was no
 * way to read the active language from a template — `self.lang` is that
 * accessor now, and `self.setLanguage()` switches it. A context copy would
 * just be a second writer that can drift.
 */
const lips = new Lips<Context>({ lang: 'en-US' })

const ROLES = [ 'Engineer', 'Mathematician', 'Rear Admiral', 'Analyst' ]

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
      }, 900 )
    })
  }
} as Context )

lips.i18n.setDictionary('en', english )
lips.i18n.setDictionary('fr', french )

registry( lips )

const app = lips.root( App, 'body')

/**
 * The component bus runs both ways, so the holder of the root handle can
 * send commands in. `context.toast` is that command, published so any
 * component can raise one without reaching for the handle itself.
 */
lips.setContext('toast', ( text: string, tone = 'info' ) => app.emit('toast', text, tone ) )

// Handy for poking at the running app from devtools
Object.assign( window as any, { lips, app })
console.info(
  '%c[lips demo]%c try: app.emit("toast", "hello", "ok")  ·  app.state.path  ·  lips.setContext("online", false)',
  'color:#d6336c;font-weight:bold', 'color:inherit'
)
