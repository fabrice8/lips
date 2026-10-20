import { GRID, VIEW } from './sketches.mjs'

/** A sketch region in grid cells → its box in page pixels */
export const px = r => ({ x: r.x * VIEW.width / GRID, y: r.y * VIEW.height / GRID, w: r.w * VIEW.width / GRID, h: r.h * VIEW.height / GRID })

/** Intersection over union of two boxes; a missing one scores 0 */
export function iou( a, b ){
  if( !a || !b ) return 0
  const w = Math.min( a.x + a.w, b.x + b.w ) - Math.max( a.x, b.x ), h = Math.min( a.y + a.h, b.y + b.h ) - Math.max( a.y, b.y )
  const i = Math.max( 0, w ) * Math.max( 0, h )
  return i / ( a.w * a.h + b.w * b.h - i || 1 )
}

/** Mean overlap of each sketched region with where it rendered */
export const fit = ( sketch, boxes ) => sketch.regions.reduce( ( s, r ) => s + iou( px( r ), boxes[ r.id ] ), 0 ) / sketch.regions.length
