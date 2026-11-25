/**
 * The tags the compiler reads as something other than a component.
 *
 * Their own module, so the registry can refuse a component named after one
 * (`IRLips.register`) in a build that ships no compiler (`./runtime`).
 */

export const CONTROL_TAGS = new Set([
  'if', 'else-if', 'else', 'for', 'switch', 'async', 'let', 'const', 'log',
  // RFC-005 §4 — scoped context / scoped language
  'context', 'i18n'
])
export const ARM_TAGS = new Set([ 'case', 'default', 'then', 'catch', 'loading' ])

/** Standard HTML + common SVG tags — anything else is a component candidate */
export const HTML_TAGS = new Set([
  'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'base', 'bdi', 'bdo',
  'blockquote', 'body', 'br', 'button', 'canvas', 'caption', 'cite', 'code', 'col',
  'colgroup', 'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl',
  'dt', 'em', 'embed', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2',
  'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html', 'i', 'iframe', 'img',
  'input', 'ins', 'kbd', 'label', 'legend', 'li', 'link', 'main', 'map', 'mark', 'menu',
  'meta', 'meter', 'nav', 'noscript', 'object', 'ol', 'optgroup', 'option', 'output', 'p',
  'picture', 'pre', 'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'script', 'section',
  'select', 'slot', 'small', 'source', 'span', 'strong', 'style', 'sub', 'summary', 'sup',
  'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th', 'thead', 'time', 'title',
  'tr', 'track', 'u', 'ul', 'var', 'video', 'wbr',
  // SVG
  'svg', 'circle', 'clippath', 'defs', 'ellipse', 'foreignobject', 'g', 'image', 'line',
  'lineargradient', 'marker', 'mask', 'path', 'pattern', 'polygon', 'polyline',
  'radialgradient', 'rect', 'stop', 'symbol', 'text', 'tspan', 'use'
])

/**
 * What `name` is to the compiler when it is not a component, or undefined
 * when a component of that name renders as one. Tag names reach the
 * compiler lowercased, so `Menu` is `menu`.
 */
export function taken( name: string ): string | undefined {
  const tag = name.toLowerCase()
  return HTML_TAGS.has( tag ) ? 'an HTML or SVG element'
    : CONTROL_TAGS.has( tag ) || ARM_TAGS.has( tag ) || tag === 'macro' ? 'a template syntax tag'
    : undefined
}
