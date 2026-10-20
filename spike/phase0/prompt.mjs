/**
 * What the model is told. One system prompt for every call that writes a
 * component; the arms differ only in the user message.
 */

import { APPS, GRID, VIEW, PROBES, ascii } from './sketches.mjs'

/** A complete, valid component: the rig loads it in its own smoke test */
export const EXAMPLE = {
  state: { notes: [ { id: 1, title: 'Groceries' }, { id: 2, title: 'Ideas' }, { id: 3, title: 'Trip' } ], open: 1, query: '', pinned: false },
  handlers: {
    pick: 'function( id ){ this.state.open = id }',
    search: 'function( e ){ this.state.query = e.target.value }'
  },
  template: `<div class="app">
  <aside class="side" data-region="list">
    <input data-probe="text" placeholder="Search" value=state.query on-input( search )>
    <for [note] in=state.notes by="id">
      <button data-probe="pick" class="note {note.id === state.open ? 'on' : ''}" on-click( pick, note.id )>{note.title}</button>
    </for>
  </aside>
  <main class="main" data-region="detail">
    <if( state.pinned )><p class="pin">Pinned</p></if>
    <h1>{state.notes.find( n => n.id === state.open )?.title}</h1>
    <button data-probe="toggle" on-click( () => state.pinned = !state.pinned )>{state.pinned ? 'Unpin' : 'Pin'}</button>
  </main>
</div>`,
  style: `.app { display: grid; grid-template-columns: 1fr 3fr; height: 100%; font-family: system-ui }
.side { padding: 16px; border-right: 1px solid #ddd; display: flex; flex-direction: column; gap: 8px }
.note.on { background: #2563eb; color: white }
.main { padding: 24px }`
}

export const SYSTEM = `You write UI components for Lips, a small reactive framework whose templates are HTML-shaped. Reply with exactly one \`\`\`json fenced block and nothing else.

## A component is JSON
{ "state": { ... }, "handlers": { "name": "function( ...args ){ ... }" }, "template": "...", "style": "..." }
- state: plain JSON data.
- handlers: function source strings. Inside one, \`this.state\` is the state; assign to change it (replace arrays rather than mutating them).
- template: one root element. Plain HTML elements plus the syntax below.
- style: plain CSS for the whole page. The root element fills a ${VIEW.width}×${VIEW.height}px box; lay it out with CSS grid or flex.

## Template syntax
- Text: {state.title} or {item.count + 1}. Any JS expression in braces.
- Attribute bound to an expression: value=state.query, disabled=state.busy (no quotes, no braces).
- Attribute with text and expressions: class="row {item.id === state.open ? 'on' : ''}".
- Events: on-click( handlerName ), on-click( handlerName, item.id ), on-input( handlerName ), or inline on-click( () => state.count++ ). A named handler gets its listed arguments first, then the DOM event.
- Conditionals: <if( state.ready )>…</if><else-if( state.loading )>…</else-if><else>…</else>
- Lists: <for [item, i] in=state.items by="id">…</for>   (by= names a unique key)
- Inside templates, refer to state as state.x (not this.state).
- No <script>, no <style>, no components, no imports. Inline SVG is fine.

## Example (valid)
\`\`\`json
${JSON.stringify( EXAMPLE, null, 1 )}
\`\`\`
`

const regionList = app => Object.entries( APPS[ app ].regions ).map( ( [ id, what ] ) => `- ${id}: ${what}` ).join('\n')

const sketchText = sketch => `The layout is sketched on a ${GRID}×${GRID} grid over the ${VIEW.width}×${VIEW.height}px page (x, y, w, h in cells, from the top left):
${sketch.regions.map( r => `- ${r.id}: x ${r.x}, y ${r.y}, w ${r.w}, h ${r.h}` ).join('\n')}

As a map, one letter per region:
${ascii( sketch.regions )}

Place each region where the sketch puts it, at that size.`

/** Turn 0. Without a sketch (arm C), the model lays it out as it likes */
export function generate( app, sketch ){
  return `Build this app: ${APPS[ app ].brief}

It has these regions. Give each region's outermost element data-region="<id>", with the exact id:
${regionList( app )}

${sketch ? sketchText( sketch ) : 'Lay the regions out however you think works best.'}

${PROBES}

Use realistic sample content.`
}

const where = req => req.region ? `This is about the ${req.region} region.` : 'Choose where it goes yourself.'

/** Arm B: the whole component comes back */
export function reviseWhole( component, req ){
  return `Here is the current component:
\`\`\`json
${JSON.stringify( component, null, 1 )}
\`\`\`

Revise it: ${req.text} ${where( req )}

Reply with the whole revised component, in the same JSON shape. Keep every data-region and data-probe element.`
}

/** Arm A: only region elements come back, and only their CSS */
export function revisePatch( component, req, regions ){
  return `Here is the current component:
\`\`\`json
${JSON.stringify( component, null, 1 )}
\`\`\`

Revise it: ${req.text} ${where( req )}

You can change only region elements, not the root or anything outside the regions (${regions.join(', ')}). Reply with:
{ "patches": [ { "region": "<id>", "template": "<the region's whole new element, data-region included>", "style": "<CSS for it>" } ], "state": { <new state keys only> }, "handlers": { <new or changed handlers> } }
- One patch per region you change; leave the others out.
- A patch's style is added after the component's CSS, replacing what earlier patches gave that region. Every selector must start with [data-region="<id>"] — other rules are dropped.
- Keep every data-probe element that is in a region you change.`
}

export const JUDGE = `You check whether a UI revision did what was asked. Reply with exactly one \`\`\`json block: { "verdict": "yes" | "partly" | "no", "why": "<one sentence>" }`

export const judge = ( req, before, after ) => `Request: ${req.text} ${req.region ? `(the ${req.region} region)` : ''}

Before:
\`\`\`json
${JSON.stringify( before, null, 1 )}
\`\`\`

After:
\`\`\`json
${JSON.stringify( after, null, 1 )}
\`\`\`

Did the revision do what was asked?`
