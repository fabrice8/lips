/**
 * Bootstrap: the app (`./boot`), mounted on the page.
 */
import { boot } from './boot'

const { lips, app } = boot('body')

// Handy for poking at the running app from devtools
Object.assign( window as any, { lips, app })
console.info(
  '%c[lips demo]%c try: app.emit("toast", "hello", "ok")  ·  app.state.path  ·  lips.setContext("online", false)',
  'color:#d6336c;font-weight:bold', 'color:inherit'
)
