import type { EventListener } from './types'

export type EventOptions = {
  emit?: boolean
}

export default class Events {
  private options: EventOptions = {
    emit: true
  }
  private __events: Record<string, EventListener[]> = {}
  private __once_events: Record<string, EventListener[]> = {}

  constructor( options?: EventOptions ){
    if( options )
      this.options = options
  }

  on( _event: string, fn: EventListener ){
    if( !Array.isArray( this.__events[ _event ] ) )
      this.__events[ _event ] = []

    this.__events[ _event ].push( fn )
    return this
  }
  once( _event: string, fn: EventListener ){
    if( !Array.isArray( this.__once_events[ _event ] ) )
      this.__once_events[ _event ] = []

    this.__once_events[ _event ].push( fn )
    return this
  }
  off( _event: string ){
    delete this.__events[ _event ]
    delete this.__once_events[ _event ]

    return this
  }
  emit( _event: string, ...params: any[] ){
    if( !this.options.emit ) return

    /**
     * TODO: Do not allow any proxied variables 
     * to be emitted out of a component.
     */
    const serialized = params.map( p => typeof p.toJSON === 'function' ? p.toJSON() : p )

    this.__events[ _event ]?.forEach( fn => fn( ...serialized ) )

    // Once listeners
    this.__once_events[ _event ]?.forEach( fn => fn( ...serialized ) )
    delete this.__once_events[ _event ]
  }
}