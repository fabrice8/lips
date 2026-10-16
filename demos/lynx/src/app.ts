/**
 * One template, written HTML-shaped: `div`/`button` render as `view`,
 * `p`/`span` as `text` (RFC-006 §4.3). Text sits inside text-like tags,
 * which is where Lynx renders it. Ids are for the native headless run,
 * which locates by id and class; `data-k` is for the web e2e.
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
</div>`

let next = 3

export const state = {
  n: 0,
  rows: [ { id: 1, label: 'one' }, { id: 2, label: 'two' } ],
  // Bound by the stylesheet (app.lips.css)
  accent: '#e11d48',
  pad: 16,
  radius: 6,
  width: 50
}

export const handlers = {
  inc( this: any ){ this.state.n++ },
  add( this: any ){
    const id = next++
    this.state.rows = [ ...this.state.rows, { id, label: `row ${id}` } ]
  },
  reverse( this: any ){ this.state.rows = [ ...this.state.rows ].reverse() },
  theme( this: any ){
    this.state.accent = '#2563eb'
    this.state.pad = 24
    this.state.radius = 12
    this.state.width = 80
  }
}
