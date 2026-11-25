/**
 * Virtual list and grid: a long list of rows of one size, of which only
 * what is in view is drawn (RFC-008 §5).
 *
 *   lips.use( virtualList )
 *
 *   <virtual-list items=state.rows size=40 class="rows" row="row" [item, index]>
 *     <span>{item.name}</span>
 *   </virtual-list>
 *   <virtual-list items=state.photos size=120 columns=3 …/>
 *   <virtual-list items=state.lines size=32 role="grid" …/>
 *
 * Its items are data, each with an `id`; `size` is a row's height in px,
 * `columns` how many items a row holds (1 by default), `overscan` how many
 * rows past the view are drawn too (3). Each item is drawn by the slot,
 * which gets `item` and `index`, in a box of the class `row`.
 *
 * On the web, the list is a box that scrolls, and only the rows in view
 * and the overscan are in the page, each placed where it falls. As
 * `grid` or `table` (`role`), a list of one column says how many rows it
 * has (`aria-rowcount`) and each row which it is (`aria-rowindex`), so a
 * screen reader knows where it is among rows that are not drawn.
 *
 * On Lynx, it is Lynx's own `list`, which draws only the cells in view and
 * recycles them (RFC-006 §4.5): every row is a `list-item`, `size` its
 * estimated height, `columns` its `span-count`. Its markup is its `lynx`
 * source (`lynxComponents`, `./lynx`).
 *
 * Not yet: rows of different heights, measured as they are drawn.
 */
import type { Plugin } from '../types'

/** What is drawn of a list: each item in view, its index, and where its box goes */
export interface Placed<T = any> { id: unknown, item: T, index: number, style: string }

/**
 * The items of a list of `count` in view of a box scrolled to `top` and
 * `height` high, in rows of `size` px holding `columns` each, with
 * `overscan` rows each side: from the first index, to the one past the last.
 */
export function frame( count: number, top: number, height: number, size: number, columns = 1, overscan = 3 ): [ number, number ] {
  if( !( size > 0 ) ) return [ 0, 0 ]
  const rows = Math.ceil( count / columns )
  const first = Math.max( 0, Math.floor( top / size ) - overscan )
  const last = Math.min( rows, Math.ceil( ( top + height ) / size ) + overscan )
  return [ first * columns, Math.min( count, last * columns ) ]
}

export const virtualList: Plugin = {
  name: 'virtual-list',
  components: {
    'virtual-list': {
      state: { shown: [] as Placed[], height: 0, rows: 0 },
      static: { top: 0, box: 'overflow-y: auto; position: relative' },
      handler: {
        /** Given new items, or a new size: what is in view is drawn again */
        onInput(){ ( this as any ).draw() },
        /** In the page: the box is measured, and what fits is drawn */
        async onAttach(){
          const self = this as any, b = await self.refs.box?.getBoundingClientRect()
          self.state.height = b?.height || 0
          self.draw()
        },
        scrolled( e: any ){
          const self = this as any, t = e.target
          self.static.top = t?.scrollTop || 0
          t?.clientHeight && ( self.state.height = t.clientHeight )
          self.draw()
        },
        draw(){
          const self = this as any, { items = [], size = 0, columns = 1, overscan = 3 } = self.input
          const [ from, to ] = frame( items.length, self.static.top, self.state.height, size, columns, overscan )
          const width = 100 / columns, shown: Placed[] = []

          for( let i = from; i < to; i++ ){
            const line = Math.floor( i / columns ), at = i % columns
            shown.push({ id: items[ i ].id, item: items[ i ], index: i,
              style: `position: absolute; top: ${line * size}px; left: ${at * width}%; width: ${width}%; height: ${size}px` })
          }
          self.state.rows = Math.ceil( items.length / columns )
          self.state.shown = shown
        }
      },
      default: `<let rows={ ( input.role === 'grid' || input.role === 'table' ) && !( input.columns > 1 ) }/>
<div class=input.class role=input.role aria-rowcount=( rows ? state.rows : null ) style=static.box @ref="box" on-scroll( scrolled )>
  <div style="position: relative; height: {state.rows * ( input.size || 0 )}px">
    <for [p] in=state.shown by="id">
      <div class=input.row role=( rows ? 'row' : null ) aria-rowindex=( rows ? p.index + 1 : null ) style=p.style><{input.renderer} item=p.item index=p.index/></div>
    </for>
  </div>
</div>`,
      lynx: `<list class=input.class list-type=( input.columns > 1 ? 'flow' : 'single' ) span-count=( input.columns || 1 )>
  <for [item, i] in=input.items by="id">
    <list-item class=input.row estimated-main-axis-size-px=input.size><{input.renderer} item=item index=i/></list-item>
  </for>
</list>`
    }
  }
}
