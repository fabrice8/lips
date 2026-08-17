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
      <!-- Stable key: reword this label and the translation still holds -->
      <span i18n="counter.label">Count</span>
      (<span @text=self.lang></span>)
    </button>

    <!-- Parameterised text goes through @format, not through a key alone -->
    <small @format="counter.hint, { count: state.count }"></small>

    <!-- A real switcher: setLanguage is the single writer, self.lang the reader -->
    <button on-click( () => self.setLanguage('en-US') )>EN</button>
    <button on-click( () => self.setLanguage('fr-FR') )>FR</button>
  </div>
`