import type { Declaration, Handler, Metavars, MeshRenderer, VariableSet, FragmentBoundaries } from '../types'
import $ from 'cash-dom'
import { isEqual } from '../utils'

type ArgvTrack = {
  argvalues: VariableSet,
  boundaries: FragmentBoundaries
  /**
   * Reconciliation key — present only in keyed mode
   * (`by=` attribute). Also used to derive the item's
   * partial path suffix `[k:<key>]`.
   */
  key?: string | number
}
export interface Input {
  in: Record<string, any> | any[]
  from?: number
  to?: number
  /**
   * Keyed reconciliation (arrays only):
   * - string: property path into each item, e.g. `by="id"`
   * - function: `( item, index ) => key` for computed keys
   *
   * Named `by` (Marko-style) — `key` is reserved/skipped by
   * the component input caster.
   */
  by?: string | (( item: any, index: number ) => string | number)
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
      /**
       * Keyed reconciliation (`by=`) for arrays.
       *
       * TODO(Phase 1): Map/Object iteration should default to
       * keyed reconciliation by the natural entry key.
       */
      else if( Array.isArray( _in ) )
        return options.by !== undefined
                  ? this.asKeyedArray( options.renderer, _in, memo, init )
                  : this.asArray( options.renderer, _in, memo, init )
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

  /**
   * Resolve an item's reconciliation key from the `by=`
   * input: property path string or key function.
   */
  keyOf( item: any, index: number ){
    const by = this.input.by
    return typeof by === 'function'
                ? by( item, index )
                : String( by ).split('.').reduce( ( v: any, k: string ) => v?.[ k ], item )
  },
  /**
   * Render a fresh keyed item. Does NOT insert into the DOM
   * nor into `argvlist` — callers own placement and ordering.
   */
  addKeyedItem( renderer: MeshRenderer, memo: VariableSet, argvalues: VariableSet, key: string | number ){
    const
    suffix = `[k:${key}]`,
    $item = renderer.mesh( argvalues, memo, suffix ),
    { boundaries, $partial } = renderer.demarcate( $item || $(), suffix )

    this.static.prevRenderer = renderer

    return { track: { argvalues, boundaries, key } as ArgvTrack, $partial }
  },
  /**
   * Tear down every tracked item (used when falling back
   * from keyed to index mode on invalid keys).
   */
  clearAllItems( renderer: MeshRenderer ){
    if( !this.static.argvlist ) return

    for( let i = this.static.argvlist.length - 1; i >= 0; i-- ){
      const track = this.static.argvlist[ i ]
      renderer.cleanup( track.boundaries, track.key !== undefined ? `[k:${track.key}]` : `[${i}]` )
    }

    this.static.argvlist = null
    this.static.lastIn = null
  },
  asKeyedArray( renderer: MeshRenderer, _in: any[], memo: VariableSet, init: boolean ){
    /**
     * Reference check to avoid unnecessary processing
     * (inputs are deep-cloned upstream, so this only
     * catches genuine no-op re-entries)
     */
    if( this.static.argvlist
        && this.static.lastIn
        && _in === this.static.lastIn )
      return

    // Cache the input for future reference checks
    this.static.lastIn = _in

    const [ evar, ivar ] = renderer.argv

    /**
     * Compute keys upfront — undefined/null/duplicate keys
     * invalidate keyed mode for this pass: fall back to
     * index reconciliation after clearing keyed tracks.
     */
    const
    keys: ( string | number )[] = [],
    seen = new Set<string | number>()

    for( let i = 0; i < _in.length; i++ ){
      const k = this.keyOf( _in[ i ], i )
      if( k === undefined || k === null || seen.has( k ) ){
        console.warn(`<for> \`by\` yielded ${seen.has( k ) ? 'duplicate' : 'undefined'} key at index ${i} — falling back to index reconciliation`)

        this.clearAllItems( renderer )
        return this.asArray( renderer, _in, memo, init )
      }

      seen.add( k )
      keys.push( k )
    }

    /**
     * Initial keyed render
     */
    if( !Array.isArray( this.static.argvlist ) ){
      // Clear existing for content
      this.static.prevRenderer?.cleanup()
      this.static.argvlist = []

      let $content = $()
      for( let i = 0; i < _in.length; i++ ){
        const argvalues: VariableSet = {}
        if( evar ) argvalues[ evar ] = { value: _in[ i ], type: 'arg' }
        if( ivar ) argvalues[ ivar ] = { value: i, type: 'arg' }

        const { track, $partial } = this.addKeyedItem( renderer, memo, argvalues, keys[ i ] )

        this.static.argvlist.push( track )
        $content = $content.add( $partial )
      }

      if( !$content?.length ) return
      if( init ) return $content

      renderer.fill( $content )
      return
    }

    /**
     * Keyed reconciliation pass
     *
     * 1. Match by key: reuse tracks, patch changed values/index
     * 2. Create tracks for new keys (placement deferred)
     * 3. Cleanup tracks whose keys disappeared
     * 4. Single pointer walk to restore DOM order — moves
     *    whole boundary ranges, preserving node identity and
     *    nested component state
     */
    const oldByKey = new Map<string | number, ArgvTrack>()
    this.static.argvlist.forEach( ( track: ArgvTrack ) => oldByKey.set( track.key as string | number, track ) )

    const
    newTracks: ArgvTrack[] = [],
    pendingInserts = new Map<string | number, any>()

    for( let i = 0; i < _in.length; i++ ){
      const
      k = keys[ i ],
      existing = oldByKey.get( k )

      if( existing ){
        oldByKey.delete( k )

        // Patch only what changed: item value and/or index
        const updates: VariableSet = {}
        if( evar && !isEqual( existing.argvalues[ evar ]?.value, _in[ i ] ) )
          updates[ evar ] = { value: _in[ i ], type: 'arg' }

        if( ivar && existing.argvalues[ ivar ]?.value !== i )
          updates[ ivar ] = { value: i, type: 'arg' }

        if( Object.keys( updates ).length ){
          existing.argvalues = { ...existing.argvalues, ...updates }
          renderer.update( Object.keys( updates ), updates, memo, existing.boundaries, `[k:${k}]` )
        }

        newTracks.push( existing )
      }
      else {
        const argvalues: VariableSet = {}
        if( evar ) argvalues[ evar ] = { value: _in[ i ], type: 'arg' }
        if( ivar ) argvalues[ ivar ] = { value: i, type: 'arg' }

        const { track, $partial } = this.addKeyedItem( renderer, memo, argvalues, k )

        pendingInserts.set( k, $partial )
        newTracks.push( track )
      }
    }

    // Remove disappeared keys (also removes their boundaries)
    oldByKey.forEach( ( track, k ) => renderer.cleanup( track.boundaries, `[k:${k}]` ) )

    /**
     * Pointer walk: enforce DOM order to match `newTracks`.
     * `pointer` is the last correctly-placed node, starting
     * at this <for> component's own start boundary.
     */
    if( this.boundaries ){
      let pointer: Node = this.boundaries.start

      for( const track of newTracks ){
        const $pending = pendingInserts.get( track.key as string | number )

        // Insert freshly created item right after pointer
        if( $pending ) $( pointer ).after( $pending )

        // Move existing range only when out of position
        else if( pointer.nextSibling !== track.boundaries.start ){
          const nodes: Node[] = []
          let n: Node | null = track.boundaries.start

          while( n ){
            nodes.push( n )
            if( n === track.boundaries.end ) break
            n = n.nextSibling
          }

          const frag = document.createDocumentFragment()
          nodes.forEach( nd => frag.appendChild( nd ) )
          pointer.parentNode?.insertBefore( frag, pointer.nextSibling )
        }

        pointer = track.boundaries.end
      }
    }

    this.static.argvlist = newTracks
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