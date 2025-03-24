import type { Handler, Metavars } from '../../../../dist/types'

export type Input = {
  initial: number
}
type Static = {
  limit: number
}
type State = {
  count: number
}

export const _static: Static = {
  limit: 12
}

export const context = ['lang']

export const state: State = {
  count: 0
}

export const handler: Handler<Metavars<Input, State, Static>> = {
  // onCreate(){ this.state.count = Number( this.input.initial ) },
  onInput(){ this.state.count = Number( this.input.initial ) },
  handleClick( e ){
    if( this.state.count >= this.static.limit )
      return

    this.state.count++
    this.emit('update', this.state.count )
  }
}

export const stylesheet = `
  span { font: 14px arial; color: blue; }
`
  
export default `
  <div>
    <{input.renderer}/>: 
    <span @text=state.count></span>
    <br>
    <button on-click(handleClick)>
      <span @text="Count"></span>
      (<span @text=context.lang></span>)
    </button>
  </div>
`