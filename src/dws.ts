import { Metavars } from '.'
import type Component from './component'

type WatchData = {
  timeout: NodeJS.Timeout
  type: 'attach' | 'detach'
}

/**
 * DOM Watch Service
 */
export default class DWS<MT extends Metavars> {
  private domObserver: MutationObserver
  private observedComponents = new Map<Component<MT>, WatchData>()
  private readonly TIMEOUT = 10000 // 10 seconds

  constructor(){
    this.domObserver = new MutationObserver( () => {
      this.observedComponents.forEach( ( watchData, component ) => {
        try {
          const $node = component.node
          if( !$node ){
            this.unwatch( component )
            return
          }

          // console.log('Hello - ', watchData, component.__name__, document.contains( $node[0] as Element ) )
          
          if( watchData.type === 'attach' && document.contains( $node[0] as Element ) ){
            this.unwatch( component )
            component.emit('component:attached', component )
            // console.log('attached', component )

            typeof component.onAttach == 'function'
            && component.onAttach.bind( component )()
          }
          else if( watchData.type === 'detach' && !document.contains( $node[0] as Element ) ){
            this.unwatch( component )
            component.emit('component:detached', component )

            typeof component.onDetach == 'function'
            && component.onDetach.bind( component )()
          }
        }
        catch( error ){
          console.log('DWS error --', error )
        }
      })

      // Stop observing if no components left to watch
      !this.observedComponents.size && this.domObserver.disconnect()
    })
  }

  watch( component: Component<MT>, type: 'attach' | 'detach' = 'attach' ){
    const $node = component.node
    if( !$node ) return

    // For attachment, check if already in DOM
    if( type === 'attach' && document.contains( $node[0] as Element ) ){
      component.emit('component:attached', component )

      typeof component.onAttach == 'function'
      && component.onAttach.bind( component )()
      return
    }

    // For detachment, check if already out of DOM
    if( type === 'detach' && !document.contains( $node[0] as Element ) ){
      component.emit('component:detached', component )

      typeof component.onDetach == 'function'
      && component.onDetach.bind( component )()
      return
    }

    // Clean up any existing watch
    this.unwatch( component )

    // Start new watch
    const timeout = setTimeout( () => {
      this.unwatch( component )
      component.emit(`component:${type}ment-timeout`, component )
    }, this.TIMEOUT )

    this.observedComponents.set( component, { timeout, type })

    // Start observing if first component
    this.observedComponents.size === 1
    && this.domObserver.observe( document.body, { childList: true, subtree: true })

    // Set up detachment watching once attached
    type === 'attach'
    && component.once('component:attached', () => this.watch( component, 'detach' ))
  }

  unwatch( component: Component<MT> ){
    const watchData = this.observedComponents.get( component )
    if( watchData ){
      clearTimeout( watchData.timeout )
      this.observedComponents.delete( component )
    }

    // Stop observing if no components left
    !this.observedComponents.size && this.domObserver.disconnect()
  }

  dispose(){
    this.domObserver.disconnect()
    this.observedComponents.forEach( watchData => clearTimeout( watchData.timeout ) )

    this.observedComponents.clear()
  }
}