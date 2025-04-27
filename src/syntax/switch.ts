import type { Declaration, Handler, Metavars, MeshRenderer, MeshTemplate, VariableSet } from '../types'

export interface Input {
  by: string
  case: (MeshTemplate & { is: string | string[] })[]
  renderer: MeshRenderer
  default?: MeshTemplate
}
export interface Static {
  initialized: boolean
  prevRenderer: MeshRenderer | null
}

export const declaration: Declaration = {
  name: 'switch',
  syntax: true,
  tags: {
    'case': { type: 'child', many: true },
    'default': { type: 'child' }
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
    let validCases: string[] = []
  
    // Clean up previously rendered content
    this.static.prevRenderer?.cleanup()

    for( const _case of options.case ){
      if( _case.is == options.by || ( Array.isArray( _case.is ) && _case.is.includes( options.by ) ) ){
        Array.isArray( _case.is ) ? 
                // Array case value: Merge with valid cases
                validCases = [ ...(new Set([ ...validCases, ..._case.is ]) )]
                // String case value
                : validCases.push( _case.is )
      
        // Render case content
        const $content = _case.renderer.mesh({}, memo )
        this.static.prevRenderer = _case.renderer

        if( !$content?.length ) return
        if( init ) return $content
        
        _case.renderer.fill( $content )
      }
    }

    if( validCases.includes( options.by ) ) return

    // Render -- Default or Null fallback
    if( options.default ){
      // Render default content
      const $content = options.default.renderer.mesh({}, memo )
      this.static.prevRenderer = options.default.renderer

      if( !$content?.length ) return
      if( init ) return $content 

      options.default.renderer.fill( $content )
    }
    // Clear renderer
    else this.static.prevRenderer = null
  }
}