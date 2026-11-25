/**
 * Icons: a set as data, drawn as inline svg (RFC-008 §5; lips#34).
 *
 *   lips.use( icons({ check: { paths: [ 'M5 12l5 5L20 7' ], stroke: 2 }, … }) )
 *
 *   <icon name="check" size=16 color=state.tone/>
 *   <button><icon name="close" label="Close"/></button>
 *
 * Each icon is its paths (`d`), its `box` (`0 0 24 24` by default), and a
 * stroke width for a line icon (drawn with no fill, round ends), or none
 * for a filled one. Its colour is bound into its markup: `color`, or the
 * text's (`currentColor`) on the web. On Lynx give `color`: Lynx draws an
 * svg from its markup, where neither a custom property nor the text's
 * colour reaches (RFC-008 §3).
 *
 * An icon with no `label` is `aria-hidden`; one with a label is an image
 * by that name, and alone in a button gives the button its label, on both
 * hosts. A name the set does not hold draws nothing.
 *
 * One set per Lips: a second `icons(…)` is refused as another plugin of
 * the same name. Merge sets before using them.
 */
import type { Plugin } from '../types'

export interface Icon {
  readonly paths: readonly string[]
  readonly box?: string
  /** A line icon's stroke width; none for a filled icon */
  readonly stroke?: number
}
export type IconSet = Readonly<Record<string, Icon>>

export const icons = ( set: IconSet ): Plugin => ({
  name: 'icons',
  components: {
    'icon': {
      // A getter stays a getter in each instance's `static` (`ir/initial`): the set is shared, not copied
      static: { get set(){ return set } },
      default: `<let i={ static.set[ input.name ] } color={ input.color || 'currentColor' } size={ input.size || 24 }/>
<if( i )><svg class=input.class viewBox=( i.box || '0 0 24 24' ) width=size height=size fill=( i.stroke ? 'none' : color ) stroke=( i.stroke ? color : null ) stroke-width=( i.stroke || null ) stroke-linecap=( i.stroke ? 'round' : null ) stroke-linejoin=( i.stroke ? 'round' : null ) role=( input.label ? 'img' : null ) aria-label=( input.label || null ) aria-hidden=( input.label ? null : 'true' )>
  <for [d] in=i.paths><path d=d/></for>
</svg></if>`
    }
  }
})
