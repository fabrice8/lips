/**
 * Dialog: a panel over the whole page that holds the page still until it
 * closes (RFC-008 §5; WAI-ARIA's modal dialog).
 *
 *   lips.use( dialog )   // and the popover and layer it is built on
 *
 *   <popover open=state.editing on-change( setEditing )>
 *     <popover-trigger haspopup="dialog"><span>Rename</span></popover-trigger>
 *     <popover-dialog class="sheet" blur=8 on-placed( started )>
 *       <dialog-title class="title"><span>Rename the file</span></dialog-title>
 *       …
 *     </popover-dialog>
 *   </popover>
 *
 * It is a popover's: the popover holds whether it is open (the app's
 * `open`), its id and its trigger, and a dialog opened with no trigger is
 * the same with none written. Named `popover-dialog`: `dialog` is an HTML
 * element.
 *
 * Open, it is a centred panel in the layer (`page-layer`, `./layer`),
 * `role="dialog"` (or the app's `role`, as `alertdialog`), `aria-modal`,
 * labelled by its `dialog-title`, or by `label` where it has none. Focus
 * goes to the panel, which a screen reader reads by its title; it says
 * `placed` then, for the app to move focus on to a field. The page behind
 * it is held still:
 *  - on the web, the rest of the page is `inert`, and Tab and Shift+Tab
 *    go round what can be focused in it;
 *  - on Lynx, `aria-modal` is `accessibility-exclusive-focus` (RFC-006
 *    §4.8): a screen reader stays inside it. Lynx has no Tab.
 *
 * It closes on Escape and on a tap on the backdrop, and whenever the app's
 * `open` turns false (its own button, a saved form); then the page is
 * given back and focus goes back to the trigger.
 */
import type { Plugin } from '../types'
import { popover } from './popover'

/** What can take focus, on the DOM */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Everything in the page's body but `el` and what holds it made `inert`;
 * what undoes it. What is already inert is left as it is, and stays. On
 * the DOM only: a Lynx node has no `parentElement`.
 */
export function inert( el: any ): () => void {
  const made: Element[] = []
  for( let n = el; n?.parentElement && n !== n.ownerDocument.body; n = n.parentElement )
    for( const s of n.parentElement.children )
      s !== n && !s.hasAttribute('inert') && ( s.setAttribute( 'inert', '' ), made.push( s ) )

  return () => made.forEach( s => s.removeAttribute('inert') )
}

export const dialog: Plugin = {
  name: 'dialog',
  requires: [ popover ],
  components: {
    'popover-dialog': {
      handler: {
        placed(){ ( this as any ).emit('placed') }
      },
      default: `<let p={ input.of || context.popover }/>
<if( p.open )><dialog-layer of=p class=input.class role=input.role label=input.label backdrop=input.backdrop blur=input.blur effect=input.effect on-placed( placed )><{input.renderer}/></dialog-layer></if>`
    },

    /** Mounted each time the dialog opens, gone when it closes */
    'dialog-layer': {
      static: { panel: 'position: relative', restore: null as null | ( () => void ) },
      handler: {
        /** In the page: the rest of it held still, focus on the panel */
        live( layer: any ){
          const self = this as any
          self.static.restore = inert( layer )
          self.refs.panel?.focus()
          self.emit('placed')
        },
        /** Closed, however it closed: the page given back, then focus, which an inert trigger would refuse */
        onDestroy(){
          const self = this as any
          self.static.restore?.()
          self.input.of.trigger?.focus()
        },
        dismiss(){ ( this as any ).input.of.set( false ) },
        /** Tab and Shift+Tab go round what can be focused in it */
        trap( e: KeyboardEvent ){
          const panel = ( this as any ).refs.panel
          if( e.key !== 'Tab' || !panel?.querySelectorAll ) return

          const all = [ ...panel.querySelectorAll( FOCUSABLE ) ] as HTMLElement[], at = panel.ownerDocument.activeElement
          const to = !all.length ? panel
            : e.shiftKey && ( at === all[ 0 ] || at === panel ) ? all[ all.length - 1 ]
            : !e.shiftKey && at === all[ all.length - 1 ] ? all[ 0 ]
            : null
          if( !to ) return
          e.preventDefault()
          to.focus()
        }
      },
      default: `<let p=input.of/>
<page-layer center=true backdrop=input.backdrop blur=input.blur effect=input.effect on-live( live ) on-dismiss( dismiss )>
  <div id=p.id class=input.class role=( input.role || 'dialog' ) aria-modal="true" aria-label=input.label aria-labelledby=( input.label ? null : p.id + '-title' ) tabindex="-1" style=static.panel @ref="panel" on-keydown( trap )><{input.renderer}/></div>
</page-layer>`
    },

    /** The dialog's title, and so its label */
    'dialog-title': {
      default: `<let p={ input.of || context.popover }/>
<div id="{p.id}-title" role="heading" class=input.class><{input.renderer}/></div>`
    }
  }
}
