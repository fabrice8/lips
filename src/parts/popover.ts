/**
 * Popover: a trigger and the panel it opens, over the page (RFC-008 §5).
 *
 *   lips.use( popover )
 *
 *   <popover open=state.open on-change( setOpen )>
 *     <popover-trigger class="btn"><span>Actions</span></popover-trigger>
 *     <popover-content class="panel">…</popover-content>
 *   </popover>
 *
 * It is controlled: `open` is the app's, and a change comes back as
 * `change`. `popover` provides what its pieces share as `context.popover`
 * (`PopoverApi`), which reaches them where its slot places them (RFC-005
 * §4.4). A piece given `of` uses that instead, so a piece can be driven by
 * any controller of the same shape.
 *
 * `popover-content` renders, while open, a layer over the whole page, a
 * backdrop in it and the panel. The layer is one fixed element on both
 * hosts: on Lynx `fixed` places it as a child of the page's root, which is
 * what Lynx asks of a page that is all Lynx (its `overlay` is for Lynx
 * inside a native page). Each time it opens, the panel is drawn invisible,
 * then the trigger, the layer and the panel are measured and the panel is
 * placed (`place`, or the app's own as `place=`), and focus goes to it.
 *
 * Closing: Escape, a tap on the backdrop, and whatever the content asks
 * (`p.set( false )`); focus goes back to the trigger. The backdrop takes a
 * tap outside whole, so it closes the panel and reaches nothing beneath,
 * as a menu on a phone does. `.outside` would not do: it listens in the
 * capture phase on both hosts, before the trigger's own tap, which would
 * close the panel and open it again.
 *
 * `popup` says which element is the popup a screen reader is told of:
 * `"panel"` (the default) gives the panel the popover's id, its `role`,
 * the trigger as its label, and focus; `"content"` leaves all of that to
 * the content, as a menu's list takes it (`./menu`).
 *
 * Its mechanics (the layer over the page, where the panel sits) are
 * inline styles: Lynx cannot add a sheet at run time, so a part's own
 * sheet would have to reach the app's build, and nothing here needs what
 * only a sheet reaches (`:hover`, `@keyframes`, `@media`). Its look is the
 * app's, through the classes it is given.
 */
import type { Plugin } from '../types'

/** What a popover's pieces share: `context.popover`, or a piece's `of` */
export interface PopoverApi {
  /** The popup's id; the trigger's is this with `-trigger` */
  readonly id: string
  /** The app's `open`, read live */
  readonly open: boolean
  /** The popup's id while it is open: what `aria-controls` names */
  readonly controls: string | null
  /** The trigger's element, set by the trigger */
  trigger?: { focus(): void, getBoundingClientRect(): unknown }
  /** Where content with items starts when it opens, as the trigger's key asked */
  start: 'first' | 'last'
  /** Ask for `open`; closed, focus goes back to the trigger unless `back` is false */
  set( open: boolean, back?: boolean ): void
  toggle(): void
}

/** A box as the DOM and Lips's Lynx refs both give it */
export interface Box { top: number, left: number, right: number, bottom: number, width: number, height: number }

/** Where a panel goes in its layer, from the three boxes measured */
export type Placement = ( trigger: Box, layer: Box, panel: Box, rtl?: boolean ) => { top: number, left: number }

/**
 * Below the trigger, or above it where it does not fit below and does
 * above; its start edge on the trigger's, or its end edge in right-to-left;
 * kept inside the layer.
 */
export const place: Placement = ( trigger, layer, panel, rtl = false ) => {
  const
  below = trigger.bottom - layer.top,
  above = trigger.top - layer.top - panel.height,
  top = below + panel.height > layer.height && above >= 0 ? above : below,
  start = rtl ? trigger.right - layer.left - panel.width : trigger.left - layer.left,
  left = Math.max( 0, Math.min( start, layer.width - panel.width ) )

  return { top, left }
}

let seq = 0
const
LAYER = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 1000',
FILL = 'position: absolute; top: 0; left: 0; right: 0; bottom: 0',
UNPLACED = 'position: absolute; top: 0; left: 0; opacity: 0'

/** A piece's popover: the one it is given, else the one it sits in */
const partOf = ( self: any ): PopoverApi => self.input.of || self.context.popover

export const popover: Plugin = {
  name: 'popover',
  components: {
    'popover': {
      static: { api: null as PopoverApi | null },
      handler: {
        onCreate(){
          const self = this as any, id = `lips-popover-${++seq}`
          const api: PopoverApi = {
            id,
            get open(){ return self.input.open === true },
            get controls(){ return api.open ? id : null },
            start: 'first',
            set( open, back = true ){
              self.emit( 'change', open )
              !open && back && api.trigger?.focus()
            },
            toggle(){ api.start = 'first'; api.set( !api.open ) }
          }
          self.static.api = api
        }
      },
      default: `<context popover=static.api><{input.renderer}/></context>`
    },

    'popover-trigger': {
      handler: {
        onMount(){ partOf( this ).trigger = ( this as any ).refs.el },
        toggle(){ partOf( this ).toggle() },
        /** The trigger of a menu or a listbox opens it from the keyboard: down on its first item, up on its last */
        key( e: KeyboardEvent ){
          const { haspopup } = ( this as any ).input, p = partOf( this )
          if( haspopup !== 'menu' && haspopup !== 'listbox' ) return
          if( e.key !== 'ArrowDown' && e.key !== 'ArrowUp' ) return
          e.preventDefault?.()
          p.start = e.key === 'ArrowUp' ? 'last' : 'first'
          p.set( true )
        }
      },
      default: `<let p={ input.of || context.popover }/>
<button id="{p.id}-trigger" class=input.class aria-haspopup=input.haspopup aria-expanded=p.open aria-controls=p.controls @ref="el" on-click( toggle ) on-keydown( key )><{input.renderer}/></button>`
    },

    'popover-content': {
      handler: {
        placed(){ ( this as any ).emit('placed') }
      },
      default: `<let p={ input.of || context.popover }/>
<if( p.open )><popover-layer of=p class=input.class role=input.role popup=input.popup dir=input.dir place=input.place on-placed( placed )><{input.renderer}/></popover-layer></if>`
    },

    /** Mounted each time the popover opens, gone when it closes */
    'popover-layer': {
      state: { style: UNPLACED },
      static: { layer: LAYER, fill: FILL },
      handler: {
        /**
         * Placed once it is live, when what it measures is laid out. Closed
         * before the boxes come back, it is gone: its refs are dropped, so
         * nothing is focused, and nothing hears it.
         */
        async onAttach(){
          const self = this as any, { of: p, dir } = self.input, at: Placement = self.input.place || place
          const [ t, l, b ] = await Promise.all([
            p.trigger?.getBoundingClientRect(), self.refs.layer?.getBoundingClientRect(), self.refs.panel?.getBoundingClientRect()
          ])
          const { top, left } = t && l && b ? at( t, l, b, dir === 'rtl' ) : { top: 0, left: 0 }
          self.state.style = `position: absolute; top: ${top}px; left: ${left}px`
          self.input.popup !== 'content' && self.refs.panel?.focus()
          self.emit('placed')
        },
        dismiss(){ ( this as any ).input.of.set( false ) },
        key( e: KeyboardEvent ){
          if( e.key !== 'Escape' ) return
          e.preventDefault?.()
          ;( this as any ).input.of.set( false )
        }
      },
      default: `<let p=input.of panel={ input.popup !== 'content' }/>
<div class="lips-layer" style=static.layer @ref="layer" on-keydown( key )>
  <div class="lips-backdrop" style=static.fill on-click( dismiss )></div>
  <div id=( panel ? p.id : null ) class=input.class role=( panel ? input.role : null ) aria-labelledby=( panel ? p.id + '-trigger' : null ) tabindex=( panel ? '-1' : null ) style=state.style @ref="panel"><{input.renderer}/></div>
</div>`
    }
  }
}
