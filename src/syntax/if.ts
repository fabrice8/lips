import type { Declaration, Handler, Metavars, MeshRenderer, MeshTemplate, VariableSet } from '../types'

export interface Input {
  by: boolean
  renderer?: MeshRenderer
  'else-if'?: MeshTemplate[]
  'else'?: MeshTemplate
}
export interface Static {
  initialized: boolean
  prevRenderer: MeshRenderer | null
}

export const declaration: Declaration = {
  name: 'if',
  syntax: true,
  tags: {
    'else-if': {
      type: 'nexted',
      many: true,
      optional: true
    },
    'else': { 
      type: 'nexted',
      alts: ['else-if'],
      optional: true
    }
  }
}
export const _static: Static = {
  initialized: false,
  prevRenderer: null
}

export const handler: Handler<Metavars<Input, {}, Static>> = {
  onInput( memo ){ this.static.initialized && this.processor( this.input, memo ) },
  onSelfRender(){
    const $content = this.processor( this.input, undefined, true )
    this.static.initialized = true

    return $content
  },

  processor( options: Input, memo?: VariableSet, init = false ){
    if( !options.renderer ) return
    
    // Render -- if
    if( options.by ){
      // Clean up previously rendered content
      this.static.prevRenderer?.cleanup()
      
      // Render if content
      const $content = options.renderer.mesh({}, memo )
      this.static.prevRenderer = options.renderer

      if( !$content?.length ) return
      if( init ) return $content

      options.renderer.fill( $content )
    }
    else {
      // Clean up previously rendered content
      this.static.prevRenderer?.cleanup()
      
      // Render -- else-if
      let
      elseifMatch = false,
      $content
      
      if( Array.isArray( options['else-if'] ) && options['else-if'].length )
        for( const each of options['else-if'] ){
          if( !each.by ) continue
          
          // Render else-if content
          $content = each.renderer.mesh({}, memo )
          this.static.prevRenderer = each.renderer

          if( !$content?.length ) return
          if( init ) return $content

          $content?.length
          && each.renderer.fill( $content )

          elseifMatch = true
          break
        }
        
      // Render -- else fallback
      if( !elseifMatch && options.else ){
        // Render else content
        const $content = options.else.renderer.mesh({}, memo )
        this.static.prevRenderer = options.else.renderer

        if( !$content?.length ) return
        if( init ) return $content
        
        options.else.renderer.fill( $content )
      }
    }
  }
}