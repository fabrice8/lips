/**
 * Combobox: a text field and the options it finds as the person types
 * (RFC-008 §5; WAI-ARIA's combobox with a listbox, list autocomplete).
 *
 *   lips.use( combobox )   // and the popover it is built on
 *
 *   <popover open=state.open on-change( setOpen )>
 *     <popover-combobox options=state.people value=state.owner class="field" list="options" option="option" on-change( setOwner )/>
 *   </popover>
 *
 * Its options are data, `{ id, label, disabled? }`, as a menu's items are;
 * `value` is the chosen option's id, the app's, and a choice comes back as
 * `change` with the option. What is typed is the combobox's own: it finds
 * the options that `match` it (`contains` by default, the label holding
 * the text, in any case), and says `query` with it for an app that finds
 * them itself, which gives `match=( () => true )` and its own `options`.
 *
 * The field is the popover's trigger: typing opens the list, on the first
 * option found. Focus stays in the field, which names the active option
 * with `aria-activedescendant`; ArrowDown and ArrowUp open the list and
 * move through it past disabled options, Enter chooses, Escape closes,
 * Tab closes and lets focus go on. Home and End stay the field's own. A
 * tap chooses the option tapped. Chosen, the field shows its label.
 *
 * On Lynx, which has neither a combobox nor a listbox role, and no keys
 * but the soft keyboard's: the person types and taps, each option is a
 * button, and the chosen one says so (`aria-selected`).
 *
 * In a form, the field is the app's: `id` names it, for a `<label for>`
 * and for the app to focus it; `labelledby` labels it and its list by an
 * element of the app's in place of `label`; `describedby`, `required` and
 * `invalid` say what the app says of its own fields. Text typed and left,
 * by Escape or Tab, goes back to the chosen option's label: the field
 * shows what is chosen, never what was only typed.
 *
 * The active option has the class `is-active`; the chosen one,
 * `is-selected`; a disabled one, `aria-disabled` and `is-disabled`. Each
 * is drawn as its label, or by the slot, which gets `option`, `active`
 * and `selected`.
 */
import type { Plugin } from '../types'
import { popover, type PopoverApi } from './popover'
import { move, type MenuItem } from './menu'

export type Option = MenuItem
export type Match = ( option: Option, text: string ) => boolean

/** The label holds the text, in any case */
export const contains: Match = ( option, text ) => option.label.toLocaleLowerCase().includes( text.toLocaleLowerCase() )

const partOf = ( self: any ): PopoverApi => self.input.of || self.context.popover

export const combobox: Plugin = {
  name: 'combobox',
  requires: [ popover ],
  components: {
    'popover-combobox': {
      state: { text: '', typing: false, shown: [] as Option[], active: -1 },
      handler: {
        /** Given new options or a new value: what is shown follows, and the field shows the chosen label unless typed in */
        onInput(){
          const self = this as any, { options = [], value } = self.input
          self.state.typing || ( self.state.text = options.find( ( o: Option ) => o.id === value )?.label ?? '' )
          self.find()
        },
        onMount(){ partOf( this ).trigger = ( this as any ).refs.el },
        find(){
          const self = this as any, { options = [], match = contains } = self.input, s = self.state
          const shown = s.typing ? options.filter( ( o: Option ) => match( o, s.text ) ) : options.slice()
          // The active one let go before fewer are shown: each write is drawn, and none may name an option no longer there
          s.active >= shown.length && ( s.active = -1 )
          s.shown = shown
        },
        typed( e: any ){
          const self = this as any, s = self.state, p = partOf( self )
          s.text = e.target?.value ?? ''
          s.typing = true
          self.find()
          s.active = move( s.shown, -1, 1 )
          self.emit( 'query', s.text )
          p.open || p.set( true, false )
        },
        key( e: KeyboardEvent ){
          const self = this as any, s = self.state, p = partOf( self )
          const go = ( i: number ) => { e.preventDefault?.(); i >= 0 && ( s.active = i ) }

          switch( e.key ){
            case 'ArrowDown':
              if( !p.open ){ p.set( true, false ); return go( s.active >= 0 ? s.active : move( s.shown, -1, 1 ) ) }
              return go( move( s.shown, s.active, 1 ) )
            case 'ArrowUp':
              if( !p.open ){ p.set( true, false ); return go( move( s.shown, s.shown.length, -1 ) ) }
              return go( move( s.shown, s.active < 0 ? s.shown.length : s.active, -1 ) )
            case 'Enter':
              if( !p.open || s.active < 0 ) return
              e.preventDefault?.()
              return self.pick( s.active )
            case 'Escape':
              if( !p.open ) return
              e.preventDefault?.()
              self.left()
              return p.set( false, false )
            case 'Tab':
              self.left()
              return p.open && p.set( false, false )
          }
        },
        /** What was typed and not chosen, given up: the field shows the chosen label again */
        left(){
          const self = this as any, s = self.state
          s.typing = false
          s.text = ( self.input.options || [] ).find( ( o: Option ) => o.id === self.input.value )?.label ?? ''
          self.find()
        },
        pick( i: number ){
          const self = this as any, s = self.state, o: Option | undefined = s.shown[ i ]
          if( !o || o.disabled ) return
          s.text = o.label
          s.typing = false
          self.find()
          self.emit( 'change', o )
          partOf( self ).set( false )
        }
      },
      default: `<let p={ input.of || context.popover } on={ p.open && state.active >= 0 }/>
<input id=( input.id || p.id + '-trigger' ) class=input.class role="combobox" aria-expanded=p.open aria-controls=p.controls aria-autocomplete="list" aria-activedescendant=( on ? p.id + '-' + state.shown[ state.active ].id : null ) aria-label=( input.labelledby ? null : input.label ) aria-labelledby=input.labelledby aria-describedby=input.describedby aria-required=( input.required ? 'true' : null ) aria-invalid=( input.invalid ? 'true' : null ) placeholder=input.placeholder value=state.text @ref="el" on-input( typed ) on-keydown( key )/>
<popover-content of=p class=input.list popup="content">
  <div id=p.id role="listbox" aria-label=( input.labelledby ? null : input.label ) aria-labelledby=input.labelledby>
    <for [o, i] in=state.shown by="id">
      <div id="{p.id}-{o.id}" role="option" aria-selected=( o.id === input.value ) class="{input.option}{state.active === i ? ' is-active' : ''}{o.id === input.value ? ' is-selected' : ''}{o.disabled ? ' is-disabled' : ''}" aria-disabled=( o.disabled ? true : null ) on-click( pick, i )>
        <if( input.renderer )><{input.renderer} option=o active=( state.active === i ) selected=( o.id === input.value )/></if>
        <else><span>{o.label}</span></else>
      </div>
    </for>
  </div>
</popover-content>`
    }
  }
}
