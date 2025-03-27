import type { Declaration, Handler, Metavars, MeshRenderer, MeshTemplate } from '../types'

export interface Input {
  by: string
  case: (MeshTemplate & { is: string | string[] })[]
  renderer: MeshRenderer
  default?: MeshTemplate
}
export interface State {
  renderer: MeshRenderer | null
}

export const declaration: Declaration = {
  name: 'switch',
  syntax: true,
  tags: {
    'case': { type: 'child', many: true },
    'default': { type: 'child' }
  }
}
export const state: State = {
  renderer: null
}

export const handler: Handler<Metavars<Input, State>> = {
  onInput(){
    let validCases: string[] = []

    for( const _case of this.input.case ){
      if( _case.is == this.input.by || ( Array.isArray( _case.is ) && _case.is.includes( this.input.by ) ) ){
        Array.isArray( _case.is ) ? 
                // Array case value: Merge with valid cases
                validCases = [ ...(new Set([ ...validCases, ..._case.is ]) )]
                // String case value
                : validCases.push( _case.is )

        this.state.renderer = _case.renderer
      }
    }

    if( !validCases.includes( this.input.by )  )
      this.state.renderer = this.input.default ? this.input.default.renderer : null
  }
}

export default `<{state.renderer}/>`