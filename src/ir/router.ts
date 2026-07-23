/**
 * Phase 2 — `<router>` for the IR engine.
 *
 * Implemented as an ordinary component (no engine privileges): its
 * template is a dynamic tag holding the matched page's template
 * object, resolved by the host's `resolveTemplate` hook.
 *
 *   <router routes=static.routes global
 *           on-before(…) on-after(…) on-not-found(…)></router>
 */

type RouteDef = {
  path: string
  template: any
  default?: boolean
}
type Route = RouteDef & {
  pathVars: string[]
  pathRegex: RegExp
}

function safeDecode( value: string ){
  try { return decodeURIComponent( value ) }
  catch( e ){ return value }
}

/** URLSearchParams handles percent-decoding, `+`, and values with `=` */
const parseQuery = ( str: string ) => Object.fromEntries( new URLSearchParams( str ) )

export const routerTemplate = {
  state: {
    page: null as any,
    params: {} as Record<string, any>,
    query: {} as Record<string, any>
  },

  handler: {
    onCreate( this: any ){
      this.__routes = [] as Route[]
      this.__defaultPath = null as string | null
      this.__currentRoute = null as Route | null
      this.__global = false
    },

    onInput( this: any ){ this.processor( this.input ) },

    processor( this: any, options: { routes?: RouteDef[], global?: boolean } ){
      if( !options?.routes ) return

      if( options.global ) this.__global = true

      this.__routes = options.routes.map( ({ path, template, default: _default }: RouteDef ) => {
        if( _default ) this.__defaultPath = path

        const
        pathVars = path.match(/:[^\/]*(\/|$)/gi ) || [],
        pathRegex = path.replaceAll('/', '\\/')
                        .replaceAll(/:[^\/]*(\/|$)/gi, '([^\\\/]+)(?:\\\/|$)')

        return { path, template, default: _default, pathVars, pathRegex: new RegExp(`${pathRegex}$`, 'i') }
      })

      if( options.global ){
        const cpathname = window.location.pathname

        this.__defaultPath = this.__defaultPath
                              && cpathname === '/'
                              && cpathname !== this.__defaultPath
                                  ? this.__defaultPath
                                  : cpathname
                                      ? cpathname + window.location.search
                                      : this.__routes[0]?.path
      }
    },

    onAttach( this: any ){
      if( this.input?.global ){
        window.navigate = this.navigate.bind( this )
        window.addEventListener('popstate', ( e: PopStateEvent ) =>
          e.state && this.navigate( e.state.path, true ) )
      }

      // Contextual navigation for every component
      typeof this.setContext === 'function' && this.setContext('navigate', this.navigate.bind( this ) )

      this.__defaultPath && this.navigate( this.__defaultPath )
    },

    navigate( this: any, path: string, back?: boolean ){
      !back && this.__global && history.pushState({ path }, '', path )

      const parts = String( path ).split('?')
      path = parts[0]

      const query = parts[1] ? parseQuery( parts[1] ) : {}

      let fromState: any = null
      if( this.__currentRoute ){
        fromState = { path: this.__currentRoute.path, params: this.state.params }
        this.emit('before', { fromState, toState: { path, query } })
      }

      const result = this.match( path )
      if( !result ){
        this.__currentRoute = null
        this.state.params = {}
        this.state.query = {}
        this.state.page = null

        this.emit('not-found', path )
        return
      }

      const { route, params } = result
      this.emit('after', { fromState, toState: { path: route.path, params, query } })

      this.__currentRoute = route

      this.state.params = params
      this.state.query = query
      this.state.page = route.template
    },

    match( this: any, path: string ){
      const params: Record<string, any> = {}

      for( const route of this.__routes as Route[] ){
        const matches = path.match( route.pathRegex )
        if( matches === null || matches.index !== 0 ) continue

        for( let x = 0; x + 1 < matches.length && x < route.pathVars.length; x++ )
          params[ route.pathVars[ x ].replaceAll(/[\/:]/g, '') ] = safeDecode( matches[ x + 1 ] )

        return { route, params }
      }

      return false
    }
  },

  default: `<{state.page} params=state.params query=state.query/>`
}

declare global {
  interface Window {
    navigate: ( path: string, back?: boolean ) => void
  }
}
