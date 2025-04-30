import type { Declaration, Handler, Metavars, MeshRenderer, VariableSet, FragmentBoundaries } from '../types'
import $ from 'cash-dom'
import { isEqual } from '../utils'

type ArgvTrack = {
  argvalues: VariableSet,
  boundaries: FragmentBoundaries
}
export interface Input {
  in: Record<string, any> | any[]
  from?: number
  to?: number
  renderer?: MeshRenderer
}
export interface State {
  argvlist: Record<string, any>[] | null
}
export interface Static {
  lastIn: any
  argvlist: ArgvTrack[] | null
  initialized: boolean
  prevRenderer: MeshRenderer | null
  processingBatch: boolean
}

export const declaration: Declaration = {
  name: 'for',
  syntax: true
}
export const _static: Static = {
  lastIn: null,
  argvlist: null,
  initialized: false,
  prevRenderer: null,
  processingBatch: false
}

export const handler: Handler<Metavars<Input, State, Static>> = {
  onInput( memo ){
    this.static.initialized
    && this.processor( this.input, memo )
  },
  onSelfRender(){
    const $content = this.processor( this.input, undefined, true )
    this.static.initialized = true

    return $content
  },

  processor( options: Input, memo?: VariableSet, init = false ){
    /**
     * Skip processing when there's an ongoing 
     * processing batch to avoid duplicate work
     */
    if( this.static.processingBatch ) return
    
    if( !options.renderer )
      throw new Error('Undefined mesh renderer')

    let { in: _in, from: _from, to: _to } = options
    if( _in === undefined && _from === undefined )
      throw new Error('Invalid <for> arguments')
    
    this.static.processingBatch = true
    try {
      if( _from !== undefined ) return this.asFromTo( options.renderer, _from, _to, memo, init )
      else if( Array.isArray( _in ) ) return this.asArray( options.renderer, _in, memo, init )
      else if( _in instanceof Map ) return this.asMap( options.renderer, _in, memo, init )
      else if( typeof _in == 'object' ) return this.asObject( options.renderer, _in, memo, init )
    }
    finally { this.static.processingBatch = false }
  },

  addItem( renderer: MeshRenderer, memo: VariableSet, argvalues: VariableSet, index: number ){
    if( !this.static.argvlist )
      this.static.argvlist = []

    // Render new item content
    const
    suffix = `[${index}]`,
    $item = renderer.mesh( argvalues, memo, suffix )
    if( !$item ) return
    
    const { boundaries, $partial } = renderer.demarcate( $item, suffix )

    this.static.prevRenderer = renderer
    this.static.argvlist.push({ argvalues, boundaries })

    return $partial
  },
  updateItem( renderer: MeshRenderer, memo: VariableSet, argvalues: VariableSet, index: number ){
    if( !this.static.argvlist?.[ index ] ) return

    this.static.argvlist[ index ].argvalues = argvalues
    renderer.update( Object.keys( argvalues ), argvalues, memo, this.static.argvlist[ index ].boundaries, `[${index}]` )
  },
  removeItem( renderer: MeshRenderer, index: number ){
    if( !this.static.argvlist?.[ index ] ) return
    
    renderer.cleanup( this.static.argvlist[ index ].boundaries, `[${index}]` )
    this.static.argvlist.splice( index, 1 )
  },

  asFromTo( renderer: MeshRenderer, _from: number, _to: number, memo: VariableSet, init: boolean ){
    _from = parseFloat( String( _from ) )

    if( _to == undefined )
      throw new Error('Expected <from> <to> attributes of the for loop to be defined')

    _to = parseFloat( String( _to ) )
    
    const 
    isAscending = _from < _to,
    expectedLength = Math.abs( _to - _from ) + 1
    
    /**
     * Optimize by just updating the values when 
     * there's already an argvlist of the correct length, 
     * and the range hasn't changed.
     */
    if( Array.isArray( this.static.argvlist ) ){
      const [ ivar ] = renderer.argv
      
      if( ivar ){
        let currentValue = _from

        /**
         * Perform granular updates when 
         * length hasn't changed
         */
        if( this.static.argvlist.length === expectedLength ){
          for( let i = 0; i < this.static.argvlist.length; i++ ){
            // Update item's dependency without re-rendering
            this.static.argvlist[ i ].argvalues[ ivar ].value !== currentValue
            && this.updateItem( renderer, memo, { [ ivar ]: { value: currentValue, type: 'arg' } }, i )

            currentValue = isAscending ? currentValue + 1 : currentValue - 1
          }

          return
        }
        
        /**
         * Update incrementally existing items when 
         * length has changed
         */
        const existsLength = Math.min( this.static.argvlist.length, expectedLength )
        for( let i = 0; i < existsLength; i++ )
          this.updateItem( renderer, memo, { [ ivar ]: { value: i, type: 'arg' } }, i )
        
        // Add new items in additions
        if( expectedLength > this.static.argvlist.length ){
          for( let i = this.static.argvlist.length; i < expectedLength; i++ ){
            const argvalues: VariableSet = { [ ivar ]: { value: i, type: 'arg' } }
            
            // Add item to the existing list
            this.boundaries
            && $(this.boundaries.end).before( this.addItem( renderer, memo, argvalues, i ) )
          }
        }
        // Remove items
        else if( expectedLength < this.static.argvlist.length ){
          for( let i = this.static.argvlist.length - 1; i >= expectedLength; i-- )
            this.removeItem( renderer, i )
        }
      }

      return
    }
    
    // Clear exiting for content
    this.static.prevRenderer?.cleanup()
    /**
     * Regenerate the full list when optimization 
     * conditions weren't met
     */
    this.static.argvlist = []
    let $content = $()
    for( let i = _from; isAscending ? i <= _to : i >= _to; isAscending ? i++ : i-- ){
      const
      argvalues: VariableSet = {},
      [ ivar ] = renderer.argv
      if( ivar )
        argvalues[ ivar ] = { value: i, type: 'arg' }
    
      // Bundle item
      $content = $content.add( this.addItem( renderer, memo, argvalues, i ) )
    }

    if( !$content?.length ) return
    if( init ) return $content

    renderer.fill( $content )
  },
  asArray( renderer: MeshRenderer, _in: any[], memo: VariableSet, init: boolean ){
    /**
     * Reference check for array inputs to 
     * avoid unnecessary processing.
     */
    if( this.static.argvlist
        && this.static.lastIn
        && _in === this.static.lastIn )
      return

    if( !_in.length ){
      if( !this.static.lastIn )
        console.warn('For loop with empty initial rendering <in> attribute array value will not update')
    }

    // Cache the input for future reference checks
    this.static.lastIn = _in
    
    /**
     * Skip full regeneration If we already have an 
     * argvlist and the object keys length hasn't changed
     * and only update changed items.
     */
    if( Array.isArray( this.static.argvlist ) ){
      const [ evar, ivar ] = renderer.argv
      
      if( evar ){
        if( this.static.argvlist.length === _in.length ){
          // Update item's dependency without re-rendering
          for( let i = 0; i < this.static.argvlist.length; i++ )
            !isEqual( this.static.argvlist[ i ].argvalues[ evar ].value, _in[ i ] )
            && this.updateItem( renderer, memo, {
              [ evar ]: { value: _in[ i ], type: 'arg' },
              [ ivar ]: { value: i, type: 'arg' }
            }, i )

          return
        }
        
        /**
         * Update incrementally existing items when 
         * length has changed
         */
        const existsLength = Math.min( this.static.argvlist.length, _in.length )
        for( let i = 0; i < existsLength; i++ )
          this.updateItem( renderer, memo, {
            [ evar ]: { value: _in[ i ], type: 'arg' },
            [ ivar ]: { value: i, type: 'arg' }
          }, i )
        
        // Add new items in additions
        if( _in.length > this.static.argvlist.length ){
          for( let i = this.static.argvlist.length; i < _in.length; i++ ){
            const argvalues: VariableSet = {
              [ evar ]: { value: _in[ i ], type: 'arg' },
              [ ivar ]: { value: i, type: 'arg' }
            }
            
            // Add item to the existing list
            this.boundaries
            && $(this.boundaries.end).before( this.addItem( renderer, memo, argvalues, i ) )
          }
        }
        // Remove items
        else if( _in.length < this.static.argvlist.length ){
          for( let i = this.static.argvlist.length - 1; i >= _in.length; i-- )
            this.removeItem( renderer, i )
        }
      }

      return
    }
    
    // Clear exiting for content
    this.static.prevRenderer?.cleanup()
    /**
     * Regenerate the full list when optimization 
     * conditions weren't met
     */
    this.static.argvlist = []
    let
    $content = $(),
    index = 0

    for( const each of _in ){
      const 
      argvalues: VariableSet = {},
      [ evar, ivar ] = renderer.argv

      if( evar ) argvalues[ evar ] = { value: each, type: 'arg' }
      if( ivar ) argvalues[ ivar ] = { value: index, type: 'arg' }
      
      // Bundle item
      $content = $content.add( this.addItem( renderer, memo, argvalues, index ) )
      index++
    }

    if( !$content?.length ) return
    if( init ) return $content

    renderer.fill( $content )
  },
  asMap( renderer: MeshRenderer, _in: Map<any, any>, memo: VariableSet, init: boolean ){
    /**
     * Reference check for array inputs to 
     * avoid unnecessary processing.
     */
    if( this.static.argvlist
        && this.static.lastIn
        && _in === this.static.lastIn )
      return

    if( !_in.size ){
      if( !this.static.lastIn )
        console.warn('For loop with empty initial rendering <in> attribute map value will not update')
    }

    // Cache the input for future reference checks
    this.static.lastIn = _in
    
    /**
     * Skip full regeneration If we already have an 
     * argvlist and the object keys length hasn't changed
     * and only update changed items.
     */
    if( Array.isArray( this.static.argvlist ) ){
      const
      [ kvar, vvar, ivar ] = renderer.argv,
      _ine = Array.from( _in.entries() )
      
      if( kvar ){
        if( this.static.argvlist.length === _ine.length ){
          // Update item's dependency without re-rendering
          for( let i = 0; i < this.static.argvlist.length; i++ )
            !isEqual( this.static.argvlist[ i ].argvalues[ kvar ].value, _ine[i][0] )
            || !isEqual( this.static.argvlist[ i ].argvalues[ vvar ].value, _ine[i][1] )
            && this.updateItem( renderer, memo, {
              [ kvar ]: { value: _ine[i][0], type: 'arg' },
              [ vvar ]: { value: _ine[i][1], type: 'arg' },
              [ ivar ]: { value: i, type: 'arg' }
            }, i )

          return
        }
        
        /**
         * Update incrementally existing items when 
         * length has changed
         */
        const existsLength = Math.min( this.static.argvlist.length, _ine.length )
        for( let i = 0; i < existsLength; i++ )
          this.updateItem( renderer, memo, {
            [ kvar ]: { value: _ine[i][0], type: 'arg' },
            [ vvar ]: { value: _ine[i][1], type: 'arg' },
            [ ivar ]: { value: i, type: 'arg' }
          }, i )
        
        // Add new items in additions
        if( _ine.length > this.static.argvlist.length ){
          for( let i = this.static.argvlist.length; i < _ine.length; i++ ){
            const argvalues: VariableSet = {
              [ kvar ]: { value: _ine[i][0], type: 'arg' },
              [ vvar ]: { value: _ine[i][1], type: 'arg' },
              [ ivar ]: { value: i, type: 'arg' }
            }
            
            // Add item to the existing list
            this.boundaries
            && $(this.boundaries.end).before( this.addItem( renderer, memo, argvalues, i ) )
          }
        }
        // Remove items
        else if( _ine.length < this.static.argvlist.length ){
          for( let i = this.static.argvlist.length - 1; i >= _ine.length; i-- )
            this.removeItem( renderer, i )
        }
      }

      return
    }
    
    // Clear exiting for content
    this.static.prevRenderer?.cleanup()
    /**
     * Regenerate the full list when optimization 
     * conditions weren't met
     */
    this.static.argvlist = []
    let
    $content = $(),
    index = 0

    for( const [ key, value ] of _in ){
      const 
      argvalues: VariableSet = {},
      [ kvar, vvar, ivar ] = renderer.argv

      if( kvar ) argvalues[ kvar ] = { value: key, type: 'arg' } // key
      if( vvar ) argvalues[ vvar ] = { value: value, type: 'arg' } // value
      if( ivar ) argvalues[ ivar ] = { value: index, type: 'arg' } // index
      
      // Bundle item
      $content = $content.add( this.addItem( renderer, memo, argvalues, index ) )
      index++
    }

    if( !$content?.length ) return
    if( init ) return $content

    renderer.fill( $content )
  },
  asObject( renderer: MeshRenderer, _in: Record<string, any>, memo: VariableSet, init: boolean ){
    /**
     * Reference check for object inputs to 
     * avoid unnecessary processing.
     */
    if( this.static.argvlist
        && this.static.lastIn
        && _in === this.static.lastIn )
      return

    if( !Object.keys( _in ).length ){
      if( !this.static.lastIn )
        console.warn('For loop with empty initial rendering <in> attribute object value will not update')
    }

    // Cache the input for future reference checks
    this.static.lastIn = _in
    
    /**
     * Skip full regeneration If we already have an 
     * argvlist and the object keys length hasn't changed
     * and only update changed items.
     */
    if( Array.isArray( this.static.argvlist ) ){
      const 
      [ kvar, vvar, ivar ] = renderer.argv,
      _ine = Object.entries( _in )
      
      if( kvar ){
        if( this.static.argvlist.length === _ine.length ){
          // Update item's dependency without re-rendering
          for( let i = 0; i < this.static.argvlist.length; i++ )
            !isEqual( this.static.argvlist[ i ].argvalues[ kvar ].value, _ine[i][0] )
            || !isEqual( this.static.argvlist[ i ].argvalues[ vvar ].value, _ine[i][1] )
            && this.updateItem( renderer, memo, {
              [ kvar ]: { value: _ine[i][0], type: 'arg' },
              [ vvar ]: { value: _ine[i][1], type: 'arg' },
              [ ivar ]: { value: i, type: 'arg' }
            }, i )

          return
        }
        
        /**
         * Update incrementally existing items when 
         * length has changed
         */
        const existsLength = Math.min( this.static.argvlist.length, _ine.length )
        for( let i = 0; i < existsLength; i++ )
          this.updateItem( renderer, memo, {
            [ kvar ]: { value: _ine[i][0], type: 'arg' },
            [ vvar ]: { value: _ine[i][1], type: 'arg' },
            [ ivar ]: { value: i, type: 'arg' }
          }, i )
        
        // Add new items in additions
        if( _ine.length > this.static.argvlist.length ){
          let $batchItems = $()
          for( let i = this.static.argvlist.length; i < _ine.length; i++ ){
            const argvalues: VariableSet = {
              [ kvar ]: { value: _ine[i][0], type: 'arg' },
              [ vvar ]: { value: _ine[i][1], type: 'arg' },
              [ ivar ]: { value: i, type: 'arg' }
            }

            const $item = this.addItem( renderer, memo, argvalues, i )
            $batchItems = $batchItems.add( $item )
          }
          
          // Add item to the existing list
          this.boundaries
          && $(this.boundaries.end).before( $batchItems )
        }
        // Remove items
        else if( _ine.length < this.static.argvlist.length ){
          for( let i = this.static.argvlist.length - 1; i >= _ine.length; i-- )
            this.removeItem( renderer, i )
        }
      }

      return
    }
    
    // Clear exiting for content
    this.static.prevRenderer?.cleanup()
    /**
     * Regenerate the full list when optimization 
     * conditions weren't met
     */
    this.static.argvlist = []
    let
    $content = $(),
    index = 0

    for( const key in _in ){
      const 
      argvalues: VariableSet = {},
      [ kvar, vvar, ivar ] = renderer.argv

      if( kvar ) argvalues[ kvar ] = { value: key, type: 'arg' } // key
      if( vvar ) argvalues[ vvar ] = { value: _in[ key ], type: 'arg' } // value
      if( ivar ) argvalues[ ivar ] = { value: index, type: 'arg' } // index
      
      // Bundle item
      $content = $content.add( this.addItem( renderer, memo, argvalues, index ) )
      index++
    }

    if( !$content?.length ) return
    if( init ) return $content

    renderer.fill( $content )
  },
  // Safe-guard cleanup
  onDestroy(){
    this.static.prevRenderer?.cleanup( undefined, true )

    this.static.prevRenderer = null
    this.static.argvlist = null
    this.static.lastIn = null
  }
}