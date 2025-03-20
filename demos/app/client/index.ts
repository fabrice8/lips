import Lips from '../../../dist/lips.min'
import english from '../languages/en.json'
import french from '../languages/fr.json'

import registry from './registry'
import * as App from './app'

type Context = {
  lang: string
  online: boolean
  getUser: ( name ) => Promise<{ name: string, email: string }>
}

const lips = new Lips()

lips.setContext({
  lang: 'en-US',
  online: true,
  getUser( name ){
    return new Promise( ( resolve, reject ) => {
      setTimeout( () => resolve({ name, email: 'g.peter@mail.com' }), 3000 )
      // setTimeout( () => reject('Unexpected error occured'), 1000 )
    })
  }
})

lips.i18n.setDictionary('en', english )
lips.i18n.setDictionary('fr', french )

registry( lips )
lips.root( App, 'body')

setTimeout( () => {
  // Change detault translation language
  // lips.language('fr-FR')
  lips.setContext('online', false )
}, 5000 )

setTimeout( () => window.navigate('/account?userid=1001'), 2000 )
setTimeout( () => window.navigate('/account?userid=20'), 5000 )
setTimeout( () => lips.getContext().navigate('/product/00009?category=phone'), 8000 )