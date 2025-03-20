
import * as Home from '../pages/home'
import * as Account from '../pages/account'
import * as Product from '../pages/product'

export const _static = {
  routes: [
    { path: '/', template: Home, default: true },
    { path: '/account', template: Account },
    { path: '/product/:id', template: Product }
  ]
}
export const state = {
  initial: 3
}

export const context = ['online']
export const handler = {
  onRouteChange( ...args ){
    console.log('Route changed -- ', ...args )
  },
  onPageNotFound( path: string ){
    console.log(`<${path}> page not found`)
  }
}

export default `
<main>
  <router routes=static.routes
          global
          on-after(onRouteChange, 'after')
          on-before(onRouteChange, 'before')
          on-not-found(onPageNotFound)></router>
  
  <footer></footer>
</main>
`