/**
 * RFC-003 Phase 0 inputs. Three apps, two arrangements each, as regions on
 * a 12×12 grid over a 1280×800 viewport. The arrangements are chosen to be
 * unlike what a model reaches for unprompted; arm C (text only) shows what
 * that default is.
 */

export const GRID = 12
export const VIEW = { width: 1280, height: 800 }

/** Every app must hold live state the rig can set, then look for after each revision */
export const PROBES = `Include, somewhere sensible:
- an <input data-probe="text"> whose value is kept in state as the user types;
- at least three clickable items with data-probe="pick", each selecting itself (the selection kept in state);
- one button with data-probe="toggle" that flips or counts something in state.`

export const APPS = {
  inbox: {
    brief: 'A team inbox: browse conversations, read one, reply to it.',
    regions: {
      nav: 'folders and labels',
      list: 'the conversations, selectable',
      detail: 'the open conversation',
      composer: 'a reply box with a send button'
    },
    requests: [
      { kind: 'content', region: 'detail', text: 'Rewrite the open conversation so it reads as a customer escalation about a late shipment.' },
      { kind: 'style', region: 'list', text: 'Make the conversation list denser, and give the selected conversation a strong highlight.' },
      { kind: 'add', region: 'composer', text: 'Add an "attach file" button next to send.' },
      { kind: 'add-unplaced', region: null, text: 'Add a small unread-count badge somewhere sensible.' },
      { kind: 'vague', region: null, text: 'Make it feel more modern and polished.' }
    ]
  },
  dashboard: {
    brief: 'A sales analytics dashboard.',
    regions: {
      header: 'the title and the signed-in user',
      filters: 'filters for region, product and channel',
      kpis: 'three key numbers',
      chart: 'a bar chart of monthly sales (bars drawn with elements)',
      table: 'the top deals, selectable rows'
    },
    requests: [
      { kind: 'content', region: 'kpis', text: 'Change the key numbers to revenue, churn and active users, with realistic values.' },
      { kind: 'style', region: 'chart', text: 'Restyle the chart with a dark background and brighter bars.' },
      { kind: 'add', region: 'filters', text: 'Add a date-range selector.' },
      { kind: 'add-unplaced', region: null, text: 'Add a "last updated" timestamp somewhere sensible.' },
      { kind: 'vague', region: null, text: 'Make it feel more modern and polished.' }
    ]
  },
  shop: {
    brief: 'A product page for an outdoor-gear shop.',
    regions: {
      gallery: 'product photos (placeholders), with selectable thumbnails',
      info: 'name, price and description',
      options: 'colour choice, quantity and an add-to-cart button',
      reviews: 'customer reviews'
    },
    requests: [
      { kind: 'content', region: 'info', text: 'Rewrite the product as a waterproof hiking boot.' },
      { kind: 'style', region: 'reviews', text: 'Make each review a card, with its star rating shown prominently.' },
      { kind: 'add', region: 'options', text: 'Add a size picker.' },
      { kind: 'add-unplaced', region: null, text: 'Add a "free shipping" notice somewhere sensible.' },
      { kind: 'vague', region: null, text: 'Make it feel more modern and polished.' }
    ]
  }
}

/** [ id, x, y, w, h ] in grid cells */
const box = ( [ id, x, y, w, h ] ) => ({ id, x, y, w, h })

export const SKETCHES = [
  { id: 'inbox-a', app: 'inbox', regions: [
    [ 'list', 0, 0, 12, 3 ], [ 'detail', 0, 3, 8, 7 ], [ 'composer', 0, 10, 8, 2 ], [ 'nav', 8, 3, 4, 9 ] ].map( box ) },
  { id: 'inbox-b', app: 'inbox', regions: [
    [ 'detail', 0, 0, 7, 10 ], [ 'list', 7, 0, 5, 6 ], [ 'composer', 7, 6, 5, 4 ], [ 'nav', 0, 10, 12, 2 ] ].map( box ) },
  { id: 'dashboard-a', app: 'dashboard', regions: [
    [ 'filters', 0, 0, 3, 12 ], [ 'chart', 3, 0, 6, 6 ], [ 'table', 3, 6, 6, 4 ], [ 'header', 3, 10, 6, 2 ], [ 'kpis', 9, 0, 3, 12 ] ].map( box ) },
  { id: 'dashboard-b', app: 'dashboard', regions: [
    [ 'table', 0, 0, 12, 5 ], [ 'chart', 0, 5, 5, 7 ], [ 'kpis', 5, 5, 3, 7 ], [ 'filters', 8, 5, 4, 5 ], [ 'header', 8, 10, 4, 2 ] ].map( box ) },
  { id: 'shop-a', app: 'shop', regions: [
    [ 'reviews', 0, 0, 4, 12 ], [ 'gallery', 4, 0, 8, 6 ], [ 'info', 4, 6, 4, 6 ], [ 'options', 8, 6, 4, 6 ] ].map( box ) },
  { id: 'shop-b', app: 'shop', regions: [
    [ 'options', 0, 0, 12, 2 ], [ 'info', 0, 2, 3, 10 ], [ 'gallery', 3, 2, 6, 10 ], [ 'reviews', 9, 2, 3, 10 ] ].map( box ) }
]

/** The sketch as a character map: one letter per region, `.` for none */
export function ascii( regions ){
  const rows = Array.from({ length: GRID }, () => Array( GRID ).fill('.') )
  regions.forEach( r => {
    for( let y = r.y; y < r.y + r.h; y++ )
      for( let x = r.x; x < r.x + r.w; x++ ) rows[ y ][ x ] = r.id[ 0 ].toUpperCase()
  })
  return rows.map( r => r.join(' ') ).join('\n')
}
