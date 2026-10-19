/**
 * One template, written HTML-shaped: `div`/`button` render as `view`,
 * `p`/`span` as `text` (RFC-006 §4.3). Text renders only inside text-like
 * tags; a button's bare label is wrapped in one at compile time (L3).
 * Ids are for the native headless run, which locates by id and class;
 * `data-k` is for the web e2e.
 *
 * L3: an input synced through `setValue` and its `input` event, a
 * `scroll-view` reporting where it is, and a native `list` that asks for
 * its cells as they scroll into view.
 */
export const TEMPLATE = `
<div class="app">
  <p class="title" id="count" data-k="count">Count: {state.n}</p>
  <div class="row">
    <button class="btn" id="inc" data-k="inc" on-click( inc )><span>+1</span></button>
    <button class="btn" id="add" data-k="add" on-click( add )><span>add</span></button>
    <button class="btn" id="rev" data-k="rev" on-click( reverse )><span>reverse</span></button>
    <button class="btn" id="theme" data-k="theme" on-click( theme )><span>theme</span></button>
  </div>
  <div class="swatch" id="swatch" data-k="swatch"></div>
  <for [row] in=state.rows by="id">
    <div class="item" data-id=row.id><span>{row.label}</span></div>
  </for>
  <input class="field" id="field" data-k="field" value=state.draft placeholder="Type here" on-input( onDraft )>
  <p class="echo" id="typed" data-k="typed">Typed: {state.typed}</p>
  <div class="row">
    <button class="btn" id="fill" data-k="fill" on-click( fill )>fill</button>
    <button class="btn" id="shuffle" data-k="shuffle" on-click( shuffle )>shuffle</button>
  </div>
  <p class="echo" id="top" data-k="top">Top: {state.top}</p>
  <div class="row">
    <scroll-view class="pane" id="scroller" data-k="scroller" scroll-y on-scroll( onScroll )>
      <for [n] in=state.lines><p class="line">line {n}</p></for>
    </scroll-view>
    <list class="pane" id="feed" data-k="feed">
      <for [cell] in=state.feed by="id"><list-item class="cell" data-cell=cell.id>item {cell.id}</list-item></for>
    </list>
  </div>
</div>`

let next = 3

export const state = {
  n: 0,
  rows: [ { id: 1, label: 'one' }, { id: 2, label: 'two' } ],
  // Bound by the stylesheet (app.lips.css)
  accent: '#e11d48',
  pad: 16,
  radius: 6,
  width: 50,
  // L3
  draft: '',
  typed: '',
  top: 0,
  lines: Array.from({ length: 12 }, ( _, i ) => i + 1 ),
  feed: Array.from({ length: 40 }, ( _, i ) => ({ id: i + 1 }) )
}

export const handlers = {
  inc( this: any ){ this.state.n++ },
  add( this: any ){
    const id = next++
    this.state.rows = [ ...this.state.rows, { id, label: `row ${id}` } ]
  },
  reverse( this: any ){ this.state.rows = [ ...this.state.rows ].reverse() },
  // `e.target.value` as on the DOM; `e.detail.value` is Lynx's own spelling
  onDraft( this: any, e: any ){ this.state.draft = this.state.typed = e.target.value },
  fill( this: any ){ this.state.draft = 'hello' },
  onScroll( this: any, e: any ){ this.state.top = Math.round( e.detail.scrollTop ) },
  shuffle( this: any ){ this.state.feed = [ ...this.state.feed ].reverse() },
  theme( this: any ){
    this.state.accent = '#2563eb'
    this.state.pad = 24
    this.state.radius = 12
    this.state.width = 80
  }
}
