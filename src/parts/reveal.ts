/**
 * A region that reveals and folds: a button and the content it shows, in
 * the page's flow (RFC-008 §5; WAI-ARIA's disclosure).
 *
 *   lips.use( reveal )   // and the popover it is built on
 *
 *   <popover open=state.more on-change( setMore )>
 *     <popover-trigger class="more"><span>Details</span></popover-trigger>
 *     <reveal-region class="details" keep=true>…</reveal-region>
 *   </popover>
 *
 * It is a popover's: the popover holds whether it is open (the app's
 * `open`) and its id, and its trigger is the button, `aria-expanded`
 * and controlling the region while it shows. The region is not a layer:
 * it takes its place in the page, takes no focus, and nothing closes it
 * but the button and the app.
 *
 * Folded, it renders nothing, or with `keep` stays rendered and hidden
 * (`display: none`, which hides it from a screen reader on both hosts), so
 * what was typed in it stays. With a `role` (`region`), it is named by
 * its button.
 */
import type { Plugin } from '../types'
import { popover } from './popover'

export const reveal: Plugin = {
  name: 'reveal',
  requires: [ popover ],
  components: {
    'reveal-region': {
      static: { folded: 'display: none' },
      default: `<let p={ input.of || context.popover }/>
<if( p.open || input.keep )><div id=p.id class=input.class role=input.role aria-labelledby=( input.role ? p.id + '-trigger' : null ) style=( p.open ? null : static.folded )><{input.renderer}/></div></if>`
    }
  }
}
