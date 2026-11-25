/**
 * Toasts: short messages in a region a screen reader is told of as they
 * come (RFC-008 §5; WAI-ARIA's status and alert).
 *
 *   lips.use( toast )
 *
 *   <toast-region items=state.toasts class="toasts" item="toast" act="toast-act" on-dismiss( drop ) on-act( undo )/>
 *   <toast-region items=state.errors role="alert" … />
 *
 * The queue is the app's: `items` are data, `{ id, text, action?,
 * duration? }`, and the region asks for one to go with `dismiss`, which
 * the app does by taking it out. It is controlled, as every part is; it
 * holds only each toast's time left.
 *
 * The region is always drawn, empty or not, so what comes into it is
 * announced: `role="status"` (polite) by default, or `alert` (assertive),
 * for errors. On Lynx, Lips announces a live region's new text through
 * `lynx.accessibilityAnnounce` (RFC-006 §4.8).
 *
 * A toast leaves by itself after its `duration` (or the region's, 5 s by
 * default), and not while the pointer or the focus is on it: its time is
 * held, and goes on from where it was. One that offers an `action` never
 * leaves by itself (WCAG 2.2.1): its button says `act`, and the app
 * decides when it goes. Each toast is drawn as its text and its action, or
 * by the slot, which gets `item`.
 */
import type { Plugin } from '../types'

export interface Toast {
  readonly id: string
  readonly text: string
  /** A button's words: a toast with one stays until the app takes it out */
  readonly action?: string
  /** How long it stays, in ms */
  readonly duration?: number
}

export const toast: Plugin = {
  name: 'toast',
  components: {
    'toast-region': {
      handler: {
        dismiss( t: Toast ){ ( this as any ).emit( 'dismiss', t ) },
        act( t: Toast ){ ( this as any ).emit( 'act', t ) }
      },
      default: `<div class=input.class role=( input.role || 'status' )>
  <for [t] in=input.items by="id">
    <toast-item item=t class=input.item act=input.act duration=input.duration row=input.renderer on-dismiss( dismiss ) on-act( act )/>
  </for>
</div>`
    },

    /** One toast: its own time */
    'toast-item': {
      static: { timer: null as any, left: null as number | null, since: 0 },
      handler: {
        onMount(){
          const self = this as any, { item, duration } = self.input
          if( item.action ) return
          self.static.left = item.duration ?? duration ?? 5000
          self.resume()
        },
        /** The pointer or the focus came onto it: its time is held */
        pause(){
          const s = ( this as any ).static
          if( s.timer === null ) return
          clearTimeout( s.timer )
          s.timer = null
          s.left = Math.max( 1, s.left - ( Date.now() - s.since ) )
        },
        resume(){
          const self = this as any, s = self.static
          if( s.left === null || s.timer !== null ) return
          s.since = Date.now()
          // It asks once: the app takes it out
          s.timer = setTimeout( () => { s.timer = s.left = null; self.emit( 'dismiss', self.input.item ) }, s.left )
        },
        act(){ ( this as any ).emit( 'act', ( this as any ).input.item ) }
      },
      default: `<div class=input.class on-mouseenter( pause ) on-mouseleave( resume ) on-focusin( pause ) on-focusout( resume )>
  <if( input.row )><{input.row} item=input.item/></if>
  <else>
    <span>{input.item.text}</span>
    <if( input.item.action )><button class=input.act on-click( act )><span>{input.item.action}</span></button></if>
  </else>
</div>`
    }
  }
}
