
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
          on-after="onRouteChange, 'after'"
          on-before="onRouteChange, 'before'"
          on-not-found="onPageNotFound"></router>

  <section style="{ border: '2px solid gray', margin: '3rem', padding: '15px' }">
    <counter initial=state.initial
              on-update="value => console.log( value )">
      Count till 12
    </counter>

    <counter initial=1>
      Note: 10
    </counter>

    <p>I'm <span text="context.online ? 'Online' : 'Offline'"></span></p>

    <br><br>
    <button on-click="() => state.initial = 10">Reinitialize</button>
    <button title="Undo"
            style="background: black;color: white" 
            on-click="() => self.destroy()">Destroy</button>
    <br>
    <profile></profile>
    <footer></footer>
  </section>
</main>
`