/**
 * Layer: what floats, over the whole page (RFC-008 §5). The popover and the
 * dialog stand on it; an app rarely uses it alone.
 *
 *   <page-layer on-dismiss( close ) on-live( measure )>…</page-layer>
 *   <page-layer center=true blur=12 backdrop="scrim" on-dismiss( close )>…</page-layer>
 *
 * One fixed element on both hosts, a backdrop in it, and what it is given
 * over the backdrop. On Lynx `fixed` places it as a child of the page's
 * root, which is what Lynx asks of a page that is all Lynx (its `overlay`
 * is for Lynx inside a native page). `center` centres what it is given,
 * as a dialog sits.
 *
 * The backdrop takes a tap outside whole, so nothing beneath is reached,
 * and the layer says `dismiss`; so does Escape anywhere in it. It says
 * `live` with its element once it is in the page, laid out, so what sits
 * in it can measure where it is.
 *
 * The backdrop is plain, or blurred (`blur`, a radius in px; `effect`, iOS's
 * material): `backdrop-blur` below. `backdrop` is its class, for its look.
 *
 * Its mechanics are inline styles: Lynx cannot add a sheet at run time, so
 * a part's own sheet would have to reach the app's build, and nothing here
 * needs what only a sheet reaches.
 */
import type { Plugin } from '../types'

export const
LAYER = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 1000',
CENTER = `${LAYER}; display: flex; align-items: center; justify-content: center`,
FILL = 'position: absolute; top: 0; left: 0; right: 0; bottom: 0'

export const layer: Plugin = {
  name: 'layer',
  components: {
    'page-layer': {
      static: { layer: LAYER, center: CENTER, fill: FILL },
      handler: {
        onAttach(){ ( this as any ).emit( 'live', ( this as any ).refs.layer ) },
        dismiss(){ ( this as any ).emit('dismiss') },
        key( e: KeyboardEvent ){
          if( e.key !== 'Escape' ) return
          e.preventDefault?.()
          ;( this as any ).emit('dismiss')
        }
      },
      default: `<let backdrop={ input.backdrop ? 'lips-backdrop ' + input.backdrop : 'lips-backdrop' }/>
<div class="lips-layer" style=( input.center ? static.center : static.layer ) @ref="layer" on-keydown( key )>
  <if( input.blur )><backdrop-blur class=backdrop radius=input.blur effect=input.effect style=static.fill on-click( dismiss )/></if>
  <else><div class=backdrop style=static.fill on-click( dismiss )></div></else>
  <{input.renderer}/>
</div>`
    },

    /**
     * What is behind it, blurred: `backdrop-filter` on the web, Lynx's
     * `blur-view` on Lynx. Each host draws what it knows and passes over
     * the other's: the DOM has no `blur-view` element and draws it as a
     * box; Lynx has no `backdrop-filter`. `radius` is in px; `effect` is
     * iOS's material over the blur (`light`, `dark`, `extra-light`), light
     * by default. A tap on it is its `click`.
     */
    'backdrop-blur': {
      handler: {
        tap(){ ( this as any ).emit('click') }
      },
      default: `<let r={ input.radius || 0 }/>
<blur-view class=input.class blur-radius="{r}px" blur-effect=input.effect style=( ( input.style ? input.style + '; ' : '' ) + 'backdrop-filter: blur(' + r + 'px)' ) on-click( tap )></blur-view>`
    }
  }
}
