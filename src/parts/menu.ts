/**
 * Menu: a popover's panel of actions (RFC-008 §5; WAI-ARIA's menu button).
 *
 *   lips.use( menu )   // and the popover it is built on
 *
 *   <popover open=state.open on-change( setOpen )>
 *     <popover-trigger haspopup="menu"><span>Actions</span></popover-trigger>
 *     <popover-menu items=state.actions class="menu" item="menu-item" on-select( run )/>
 *   </popover>
 *
 * Named `popover-menu`: `menu` is an HTML element, which the compiler
 * reads as one.
 *
 * Its items are data, `{ id, label, disabled? }`, each drawn as its label
 * or by the slot, which gets `item` and `active`:
 * `<popover-menu … [item, active]><span>{item.label}</span></popover-menu>`.
 *
 * Its list is the popup (`popup="content"`): mounted each time the menu
 * opens, it starts on the item the trigger asked for, takes focus, and
 * names the active item with `aria-activedescendant`. Arrows move it, Home
 * and End go to the first and last, a letter to the next item it starts,
 * all past disabled items. Enter or Space selects it; a tap selects the
 * item tapped. Selecting emits `select` with the item and closes the menu,
 * giving focus back to the trigger. Tab closes it and lets focus move on.
 * On Lynx, which has no menu role, each item is a button.
 *
 * The active item has the class `is-active`; a disabled one,
 * `aria-disabled` and `is-disabled`.
 */
import type { Plugin } from '../types'
import { popover, type PopoverApi } from './popover'

export interface MenuItem { readonly id: string, readonly label: string, readonly disabled?: boolean }

/**
 * The next item to make active from `from`, by `step` (±1), wrapping and
 * skipping disabled ones; -1 when none can be. `from` -1 starts before the
 * first item, `items.length` after the last.
 */
export function move( items: readonly MenuItem[], from: number, step: 1 | -1 ): number {
  for( let i = 1; i <= items.length; i++ ){
    const at = ( ( from + step * i ) % items.length + items.length ) % items.length
    if( !items[ at ].disabled ) return at
  }
  return -1
}

/** The next enabled item after `from` whose label starts with `letter`, wrapping; -1 when none */
export function typed( items: readonly MenuItem[], from: number, letter: string ): number {
  const l = letter.toLocaleLowerCase()
  for( let i = 1; i <= items.length; i++ ){
    const at = ( from + i ) % items.length
    if( !items[ at ].disabled && items[ at ].label.toLocaleLowerCase().startsWith( l ) ) return at
  }
  return -1
}

const partOf = ( self: any ): PopoverApi => self.input.of || self.context.popover

export const menu: Plugin = {
  name: 'menu',
  requires: [ popover ],
  components: {
    'popover-menu': {
      handler: {
        /** Selected: the app hears it, and the menu closes */
        choose( item: MenuItem ){
          ;( this as any ).emit( 'select', item )
          partOf( this ).set( false )
        }
      },
      default: `<popover-content of=input.of class=input.class popup="content">
  <popover-menu-list of=input.of items=input.items item=input.item row=input.renderer on-choose( choose )/>
</popover-content>`
    },

    /** Mounted each time the menu opens, gone when it closes */
    'popover-menu-list': {
      state: { active: -1 },
      handler: {
        /** It starts where the trigger asked: its first item, or its last */
        onMount(){
          const self = this as any, { items } = self.input
          self.state.active = partOf( self ).start === 'last' ? move( items, items.length, -1 ) : move( items, -1, 1 )
        },
        onAttach(){ ( this as any ).refs.el?.focus() },
        key( e: KeyboardEvent ){
          const self = this as any, { items } = self.input, at = self.state.active
          const go = ( i: number ) => { e.preventDefault?.(); i >= 0 && ( self.state.active = i ) }

          switch( e.key ){
            case 'ArrowDown': return go( move( items, at, 1 ) )
            case 'ArrowUp': return go( move( items, at < 0 ? items.length : at, -1 ) )
            case 'Home': return go( move( items, -1, 1 ) )
            case 'End': return go( move( items, items.length, -1 ) )
            case 'Enter':
            case ' ':
              e.preventDefault?.()
              return at >= 0 && self.pick( at )
            case 'Tab': return partOf( self ).set( false, false )
          }
          e.key?.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && go( typed( items, at, e.key ) )
        },
        pick( i: number ){
          const self = this as any, item = self.input.items[ i ]
          item && !item.disabled && self.emit( 'choose', item )
        }
      },
      default: `<let p={ input.of || context.popover }/>
<div id=p.id role="menu" aria-labelledby="{p.id}-trigger" aria-activedescendant=( state.active >= 0 ? p.id + '-' + input.items[ state.active ].id : null ) tabindex="-1" @ref="el" on-keydown( key )>
  <for [item, i] in=input.items by="id">
    <div id="{p.id}-{item.id}" role="menuitem" class="{input.item}{state.active === i ? ' is-active' : ''}{item.disabled ? ' is-disabled' : ''}" aria-disabled=( item.disabled ? true : null ) on-click( pick, i )>
      <if( input.row )><{input.row} item=item active=( state.active === i )/></if>
      <else><span>{item.label}</span></else>
    </div>
  </for>
</div>`
    }
  }
}
