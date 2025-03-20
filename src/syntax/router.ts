import type { Handler, Metavars, Template } from '..'

type RouteDef<MT extends Metavars> = {
  path: string
  template: Template<MT>
  default?: boolean
}
export type Input<RouteInput extends Object> = {
  global?: boolean
  routes: RouteDef<Metavars<RouteInput>>[]
}

type Route = RouteDef<any> & {
  pathVars: string[]
  pathRegex: RegExp
}
type State = {
  page: Template<any> | null
  params: Record<string, any>
  query: Record<string, any>
}
type Static = {
  global: boolean
  routes: Route[]
  defaultPath: string | null
  currentPath: string | null
  currentRoute: Route | null
}

export const state: State = {
  page: null,
  params: {},
  query: {}
}
export const _static: Static = {
  global: false,
  routes: [],
  defaultPath: null,
  currentPath: null,
  currentRoute: null
}

function parseQuery( str: string ){
  const
  obj: any = {},
  array = str.split('&')

  array.map( each => {
    const [ key, value ] = each.split('=')
    obj[ key ] = value
  })

  return obj
}

declare global {
  interface Window {
    navigate: ( path: string, back?: boolean ) => void
  }
}

export const handler: Handler<Metavars<Input<any>, any, Static>> = {
  onInput(){
    if( !this.input.routes )
      return

    if( this.input.global )
      this.static.global = this.input.global

    this.static.routes = this.input.routes.map( ({ path, template, default: _default }) => {
      if( _default )
        this.static.defaultPath = path

      const
      // Retrieve pathname variables
      pathVars = path.match(/:[^\/]*(\/|$)/gi) || [],
      // Convert path to wildcard matching regex path
      pathRegex = path.replaceAll('/', '\\/')
                      .replaceAll(/:[^\/]*(\/|$)/gi, '([^\\\/]+)(?:\\\/|$)')
      
      return {
        path,
        template,
        default: _default, 
        pathVars,
        pathRegex: new RegExp(`${pathRegex}$`, 'i')
      }
    } )

    if( this.input.global ){
      const cpathname = window.location.pathname
      this.static.defaultPath = this.static.defaultPath
                                && cpathname == '/' 
                                && cpathname !== this.static.defaultPath ?
                                        // Default path different root path `/`
                                        this.static.defaultPath
                                        // Use first route as default
                                        : cpathname ? cpathname + window.location.search : this.static.routes[0].path
    }
  },
  onAttach(){
    if( this.input.global ){
      window.navigate = this.navigate.bind(this)
      // window.refresh = () => {}
    
      window.addEventListener('popstate', e => e.state && this.navigate( e.state.path, true ) )
    }

    /**
     * Auto-navigate to specified default path
     */
    this.static.defaultPath && this.navigate( this.static.defaultPath )
  },

  navigate( path: string, back?: boolean ){
    // Record new navigation history
    !back
    && this.static.global
    && history.pushState({ path }, '', path )

    const parts = path.split('?')
    path = parts[0]
    
    // Parse search query
    const query = parts[1] ? parseQuery( parts[1] ) : {}

    // Routing state prior to where to nativate to
    let fromState: any = null 
    if( this.static.currentRoute ){
      fromState = {
        path: this.static.currentRoute.path,
        params: this.state.params
      }

      // Before match and render page event
      this.emit('before', { fromState, toState: { path, query } })
    }
    
    // Match path with define routes
    const result = this.match( path )
    // Page not found
    if( !result ){
      this.static.currentRoute = null
      this.state.params = {}
      this.state.query = {}
      
      this.emit('not-found', path )
      return
    }

    // After match and render page event
    const { route, params } = result
    this.emit('after', {
      fromState,
      toState: {
        path: route.path,
        params,
        query
      }
    })
    
    this.static.currentPath = path
    this.static.currentRoute = route

    // Render page
    this.state.params = params
    this.state.query = query
    this.state.page = route.template

    console.log( this.state.page.toJSON() )
  },
  match( path ){
    const params: any = {}
    let matchRoute: Route | boolean = false

    for( const route of this.static.routes ){
      const
      { pathVars, pathRegex } = route,
      matches = path.match( pathRegex )

      // Find matching path
      if( matches !== null && matches.index === 0 ){
        // Extract pathname params values
        for( let x = 0; x + 1 < matches.length && x < pathVars.length; x++ )
          params[ pathVars[x].replaceAll(/[\/:]/g, '') ] = matches[ x + 1 ]

        matchRoute = route
        break
      }
    }

    return matchRoute ? { route: matchRoute, params } : false
  }
}

export default `<{state.page} params=state.params query=state.query/>`