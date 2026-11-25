/**
 * The app's context, typed once: every component reads `this.context`
 * as this, and `new Lips()` takes it as its own, with no annotation in
 * either. A published app writes the same block against '@lipsjs/lips'.
 */
declare module '../../../src/types' {
  interface SharedContext {
    online: boolean
    getUser: ( name: string, fail?: boolean ) => Promise<{ name: string, email: string, role: string }>
    /** Set by `boot()`, once the root handle exists */
    toast: ( text: string, tone?: string ) => void
    /** Published by <router> on attach */
    navigate: ( path: string ) => void
    /** Set by <theme-switch> on mount, from the mode it resolves */
    theme?: string
    /** Provided per-subtree by <context lane="…"> on the composition page */
    lane?: string
  }
}

export {}
