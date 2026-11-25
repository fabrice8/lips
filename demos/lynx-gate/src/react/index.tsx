/**
 * ReactLynx: the same screen as `../lips/background.ts`, the same run.
 */
import { root, useState, useEffect } from '@lynx-js/react'
import { drive, logBytes, logFlushes, rowsAt } from '../screen'

if( __MAIN_THREAD__ ){
  logFlushes('react')
  // What crosses: each patch, the JSON string ReactLynx sends, caught where
  // its main-thread runtime installs the receiver (`rLynxChange`)
  const g = globalThis as any
  let receive = g.rLynxChange
  Object.defineProperty( g, 'rLynxChange', {
    configurable: true,
    get: () => receive && ( ( d: any, ...r: unknown[] ) => ( logBytes( 'react', typeof d?.data === 'string' ? d.data : JSON.stringify( d ) ), receive( d, ...r ) ) ),
    set: ( f: unknown ) => { receive = f }
  })
}

function Screen(){
  const [ n, setN ] = useState( 0 ), [ rows, setRows ] = useState( rowsAt( 0 ) )
  useEffect( () => drive( 'react', step => { setN( step ); setRows( rowsAt( step ) ) } ), [] )
  return (
    <view className="screen">
      <text className="count" id="count">Count: {n}</text>
      {rows.map( row => <view key={row.id} className="row"><text>{row.label}</text></view> )}
    </view>
  )
}

root.render( <Screen /> )
