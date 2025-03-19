import type { Declaration, Handler, Metavars, MeshRenderer, VariableSet } from '..'

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
  lastInput: any
  processingBatch: boolean
}

export const declaration: Declaration = {
  name: 'for',
  syntax: true,
  iterator: true
}
export const state: State = {
  argvlist: null
}
export const _static: Static = {
  lastInput: null,
  processingBatch: false
}

export const handler: Handler<Metavars<Input, State, Static>> = {
  onInput(){
    /**
     * Skip processing when there's an ongoing 
     * processing batch to avoid duplicate work
     */
    if( this.static.processingBatch ) return

    if( !this.input.renderer )
      throw new Error('Undefined mesh renderer')

    let { in: _in, from: _from, to: _to } = this.input
    if( _in === undefined && _from === undefined )
      throw new Error('Invalid <for> arguments')
    
    this.static.processingBatch = true
    try {
      if( _from !== undefined ){
        _from = parseFloat( String( _from ) )

        if( _to == undefined )
          throw new Error('Expected <from> <to> attributes of the for loop to be defined')

        _to = parseFloat( String( _to ) )

        if( _from === _to )
          throw new Error('<from> and <to> attribute cannot have the same value')
        
        const 
        isAscending = _from < _to,
        expectedLength = Math.abs( _to - _from ) + 1
        
        /**
         * Optimize by just updating the values when 
         * there's already an argvlist of the correct length, 
         * and the range hasn't changed.
         */
        if( this.state.argvlist 
            && Array.isArray( this.state.argvlist ) 
            && this.state.argvlist.length === expectedLength ){
          const [ ivar ] = this.input.renderer.argv
          
          if( ivar ){
            let
            currentValue = _from,
            isCorrect = true
            
            for( let index = 0; index < this.state.argvlist.length; index++ ){
              if( this.state.argvlist[ index ][ ivar ].value !== currentValue ){
                isCorrect = false
                break
              }

              currentValue = isAscending ? currentValue + 1 : currentValue - 1
            }
            
            if( isCorrect ) return
            
            // Update all values in place
            currentValue = _from
            for( let index = 0; index < this.state.argvlist.length; index++ ){
              this.state.argvlist[ index ][ ivar ].value = currentValue
              currentValue = isAscending ? currentValue + 1 : currentValue - 1
            }
            
            return
          }
        }
        
        /**
         * Regenerate the full list when optimization 
         * conditions weren't met
         */
        const argvlist = []
        for( let i = _from; isAscending ? i <= _to : i >= _to; isAscending ? i++ : i-- ){
          const
          argvalues: VariableSet = {},
          [ ivar ] = this.input.renderer.argv

          if( ivar ) argvalues[ ivar ] = { value: i, type: 'arg' }

          argvlist.push( argvalues )
        }

        this.state.argvlist = argvlist
      }

      else if( Array.isArray( _in ) ){
        /**
         * Reference check for array inputs to 
         * avoid unnecessary processing.
         */
        if( this.state.argvlist
            && this.static.lastInput
            && this.input.in === this.static.lastInput )
          return
    
        if( !_in.length ){
          console.warn('empty for loop <in> attribute Array value')
          this.state.argvlist = []
          return
        }

        // Cache the input for future reference checks
        this.static.lastInput = _in

        /**
         * Skip full regeneration If we already have an 
         * argvlist and the object keys length hasn't changed
         * and only update changed items.
         */
        if( this.state.argvlist 
            && Array.isArray( this.state.argvlist ) 
            && this.state.argvlist.length === _in.length ){
          const [ evar, ivar ] = this.input.renderer.argv
          
          for( let index = 0; index < _in.length; index++ ){
            const argvalues = this.state.argvlist[ index ]
            if( evar ) argvalues[ evar ].value = _in[ index ]
          }
          
          return
        }
      
        /**
         * Regenerate the full list when optimization 
         * conditions weren't met
         */
        const argvlist = []
        let index = 0

        for( const each of _in ){
          const 
          argvalues: VariableSet = {},
          [ evar, ivar ] = this.input.renderer.argv

          if( evar ) argvalues[ evar ] = { value: each, type: 'arg' }
          if( ivar ) argvalues[ ivar ] = { value: index, type: 'arg' }

          argvlist.push( argvalues )
          index++
        }

        this.state.argvlist = argvlist
      }

      else if( _in instanceof Map ){
        /**
         * Reference check for map inputs to 
         * avoid unnecessary processing.
         */
        if( this.state.argvlist
            && this.static.lastInput
            && this.input.in === this.static.lastInput )
          return

        if( !_in.size ){
          console.warn('empty for loop <in> attribute Map value')
          this.state.argvlist = []
          return
        }

        // Cache the input for future reference checks
        this.static.lastInput = _in
        
        /**
         * Skip full regeneration If we already have an 
         * argvlist and the object keys length hasn't changed
         * and only update changed items.
         */
        if( this.state.argvlist 
            && Array.isArray( this.state.argvlist ) 
            && this.state.argvlist.length === _in.size ){
          
          const [ kvar, vvar, ivar ] = this.input.renderer.argv
          let index = 0
          
          for( const [ key, value ] of _in ){
            const argvalues = this.state.argvlist[ index ]
            
            /**
             * Update key and value
             * 
             * IMPORTANT: No need to be updated Index since 
             * it remains the same.
             */
            if( kvar ) argvalues[ kvar ].value = key
            if( vvar ) argvalues[ vvar ].value = value
            
            index++
          }
          
          return
        }

        /**
         * Regenerate the full list when optimization 
         * conditions weren't met
         */
        const argvlist = []
        let index = 0

        for( const [ key, value ] of _in ){
          const 
          argvalues: VariableSet = {},
          [ kvar, vvar, ivar ] = this.input.renderer.argv

          if( kvar ) argvalues[ kvar ] = { value: key, type: 'arg' } // key
          if( vvar ) argvalues[ vvar ] = { value: value, type: 'arg' } // value
          if( ivar ) argvalues[ ivar ] = { value: index, type: 'arg' } // index
          
          argvlist.push( argvalues )
          index++
        }

        this.state.argvlist = argvlist
      }

      else if( typeof _in == 'object' ){
        /**
         * Reference check for object inputs to 
         * avoid unnecessary processing.
         */
        if( this.state.argvlist
            && this.static.lastInput
            && this.input.in === this.static.lastInput )
          return

        if( !Object.keys( _in ).length ){
          console.warn('empty for loop <in> attribute Object value')
          this.state.argvlist = []
          return
        }

        // Cache the input for future reference checks
        this.static.lastInput = _in
        
        /**
         * Skip full regeneration If we already have an 
         * argvlist and the object keys length hasn't changed
         * and only update changed items.
         */
        const objectKeys = Object.keys( _in )
        if( this.state.argvlist 
            && Array.isArray( this.state.argvlist ) 
            && this.state.argvlist.length === objectKeys.length ){
          const [ kvar, vvar, ivar ] = this.input.renderer.argv
          
          // Check if we have the same keys and update values if needed
          for( let index = 0; index < objectKeys.length; index++ ){
            const
            key = objectKeys[ index ],
            argvalues = this.state.argvlist[ index ]
            
            /**
             * Update key and value
             * 
             * IMPORTANT: No need to be updated Index since 
             * it remains the same.
             */
            if( kvar ) argvalues[ kvar ].value = key
            if( vvar ) argvalues[ vvar ].value = _in[ key ]
          }
          
          return
        }

        /**
         * Regenerate the full list when optimization 
         * conditions weren't met
         */
        const argvlist = []
        let index = 0

        for( const key in _in ){
          const 
          argvalues: VariableSet = {},
          [ kvar, vvar, ivar ] = this.input.renderer.argv

          if( kvar ) argvalues[ kvar ] = { value: key, type: 'arg' } // key
          if( vvar ) argvalues[ vvar ] = { value: _in[ key ], type: 'arg' } // value
          if( ivar ) argvalues[ ivar ] = { value: index, type: 'arg' } // index
          
          argvlist.push( argvalues )
          index++
        }

        this.state.argvlist = argvlist
      }
    }
    finally { this.static.processingBatch = false }
  },
  
  /**
   * Custom update handler to optimize batch operations
   * for high-frequency updates.
   */
  updateItems( items ){
    if( !this.input.renderer )
      throw new Error('Undefined mesh renderer')

    if( !Array.isArray( items ) || !this.state.argvlist ) return
    
    // Prevent recursive updates
    this.static.processingBatch = true
    try {
      const [ evar ] = this.input.renderer?.argv
      if( !evar ) return
      
      // Process each update in the batch
      for( const { index, value } of items )
        if( index >= 0 && index < this.state.argvlist.length )
          this.state.argvlist[ index ][ evar ].value = value
    }
    finally { this.static.processingBatch = false }
  },
  
  /**
   * Update a single property across all items
   * without regenerating the entire list
   */
  updateProperty( propName, getter ){
    if( !this.input.renderer )
      throw new Error('Undefined mesh renderer')

    if( !this.state.argvlist ) return
    
    this.static.processingBatch = true
    try {
      for( let i = 0; i < this.state.argvlist.length; i++ ){
        const argvalues = this.state.argvlist[ i ]
        
        if( argvalues[ propName ] )
          argvalues[ propName ].value = typeof getter === 'function' 
                /**
                 * Use a function to compute the new 
                 * value if provided
                 */
                ? getter( argvalues[ propName ].value, i )
                : getter
      }
    }
    finally { this.static.processingBatch = false }
  }
}

export default `<{input.renderer} #=state.argvlist/>`