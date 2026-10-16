/**
 * The change protocol between the two Lynx threads (RFC-006 §4.2).
 *
 * The background thread runs Lips and never touches an element. What it
 * sends is ONE flat array per flush: an opcode followed by a fixed number
 * of operands, repeated. Flat and primitive-only, so the cross-thread copy
 * is as cheap as a message can be, and it serializes to the same thing on
 * every platform. Ids are integers the background allocates; 1 is the page.
 *
 *   op         operands             main thread does
 *   CREATE     id, tag              element of that Lynx tag
 *   TEXT       id, value            raw text
 *   INSERT     parent, id, ref      insert before `ref`, or append when 0
 *   REMOVE     parent, id           detach
 *   ATTR       id, name, value      routed: class / id / data-* / attribute
 *   SET_TEXT   id, value            raw text's value
 *   STYLES     id, css              the whole inline style
 *   LISTEN     id, name             forward that event to the background
 *   UNLISTEN   id, name             stop forwarding it
 *   RELEASE    id                   forget the id (the node is gone)
 */

export const
CREATE = 0,
TEXT = 1,
INSERT = 2,
REMOVE = 3,
ATTR = 4,
SET_TEXT = 5,
STYLES = 6,
LISTEN = 7,
UNLISTEN = 8,
RELEASE = 9

/** Operand count per opcode, indexed by opcode */
export const ARITY = [ 2, 2, 3, 2, 3, 2, 2, 2, 2, 1 ]

export const PAGE_ID = 1

/** Cross-thread event names — background → main, and main → background */
export const OPS_EVENT = 'lips:ops'
export const DOM_EVENT = 'lips:event'

/** An element event as it crosses to the background: data only, never a ref */
export interface WireEvent {
  id: number
  name: string
  event: { type: string, detail?: unknown }
}

/** A Lips template tag → the Lynx element it renders as (RFC-006 §4.3) */
const VIEW = [
  'div', 'section', 'article', 'nav', 'header', 'footer', 'main', 'aside',
  'ul', 'ol', 'li', 'button', 'form', 'figure', 'dialog', 'details', 'summary'
]
const TEXT_LIKE = [
  'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label', 'b', 'strong',
  'i', 'em', 'small', 'a', 'code', 'mark', 's', 'u', 'sub', 'sup', 'time'
]
export const LYNX_TAG: Record<string, string> = Object.fromEntries([
  ...VIEW.map( t => [ t, 'view' ] ),
  ...TEXT_LIKE.map( t => [ t, 'text' ] ),
  [ 'img', 'image' ]
])

/** Template event name → Lynx event name: DOM spellings keep working */
export const LYNX_EVENT: Record<string, string> = { click: 'tap' }
