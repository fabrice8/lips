/**
 * Accessibility on Lynx (RFC-006 §4.8): a template's ARIA, read as Lynx's
 * own accessibility attributes (verified in §3.8).
 *
 * The background host keeps each element's ARIA and, once per flush,
 * sends what it comes to:
 *
 *   ARIA                                   Lynx
 *   role (and button, a, h1–h6)            accessibility-traits, -element, -heading, -role-description
 *   aria-label, alt, aria-labelledby,      accessibility-label: ids and <label for> resolved to
 *   <label for>, aria-describedby            their text here, and kept current
 *   aria-checked, -selected, -expanded,    accessibility-value: words, the same on every platform
 *   -pressed, -current, -disabled,
 *   -invalid, -required, -valuetext/now
 *   aria-hidden                            accessibility-elements-hidden
 *   aria-modal                             accessibility-exclusive-focus
 *   aria-live, role=status|log|alert       lynx.accessibilityAnnounce of the region's text
 *   tabindex                               focusable
 *
 * What has no Lynx equivalent is a compile-time warning (`./template`).
 */

/** Spoken words: the states, and the role descriptions Android speaks as given. Replace them to translate */
export const WORDS = {
  checked: 'checked', unchecked: 'not checked', mixed: 'mixed', pressed: 'pressed', selected: 'selected',
  expanded: 'expanded', collapsed: 'collapsed', current: 'current', disabled: 'disabled',
  invalid: 'invalid', required: 'required', radio: 'radio button', tab: 'tab'
}
export type Words = Record<keyof typeof WORDS, string>

/**
 * A role → its trait, and Android's role description. `checkbox`,
 * `switch` and `progressbar` are Android class names, not words: Android
 * speaks them in the user's language. Android and HarmonyOS take one
 * trait, of `button`, `image` and `text`; the others reach iOS only.
 */
export const ROLES: Record<string, [ string, string? ]> = {
  button: [ 'button' ], link: [ 'link' ], heading: [ 'header' ], img: [ 'image' ], image: [ 'image' ],
  checkbox: [ 'button', 'checkbox' ], switch: [ 'button', 'switch' ], radio: [ 'button', 'radio' ], tab: [ 'button', 'tab' ],
  option: [ 'button' ], menuitem: [ 'button' ], menuitemcheckbox: [ 'button', 'checkbox' ], menuitemradio: [ 'button', 'radio' ],
  searchbox: [ 'search' ], progressbar: [ 'none', 'progressbar' ]
}
/** Roles the content names: their element swallows its children on iOS, so it is labelled with their text */
const NAMED = new Set([ 'button', 'link', 'header' ])
/** Regions whose changes are announced */
export const LIVE: Record<string, string> = { status: 'polite', log: 'polite', alert: 'assertive' }
export const QUIET = new Set([ 'none', 'presentation' ])
/** The roles HTML tags carry: what Lynx's `view` and `text` lose */
export const IMPLICIT: Record<string, string> = {
  button: 'button', a: 'link', h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading'
}

/** State attribute → its word when set, and when "false" */
const STATES: [ string, keyof Words, ( keyof Words )? ][] = [
  [ 'aria-checked', 'checked', 'unchecked' ], [ 'aria-pressed', 'pressed' ], [ 'aria-selected', 'selected' ],
  [ 'aria-expanded', 'expanded', 'collapsed' ], [ 'aria-current', 'current' ], [ 'aria-disabled', 'disabled' ],
  [ 'aria-invalid', 'invalid' ], [ 'aria-required', 'required' ]
]

/** The attributes the host reads instead of sending */
export const A11Y = new Set([
  'role', 'alt', 'for', 'tabindex', 'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-hidden',
  'aria-live', 'aria-modal', 'aria-roledescription', 'aria-valuetext', 'aria-valuenow', ...STATES.map( s => s[ 0 ] )
])

export type Aria = Record<string, string>

/** ARIA takes the first token of a role list it knows; Lynx knows one */
export const roleOf = ( a: Aria, implicit?: string ) => a.role?.trim().split( /\s+/ )[ 0 ] || implicit || ''

/**
 * The Lynx attributes one element's ARIA comes to; `undefined` resets one.
 * `refs( ids )` is the text of those ids, `content()` the element's own,
 * `labelled` the text of a `<label for>` it.
 */
export function lynxA11y( a: Aria, role: string, isText: boolean, refs: ( ids: string ) => string, content: () => string, labelled: string, words: Words ){
  const r = ROLES[ role ]
  const value = [ a[ 'aria-valuetext' ] ?? a[ 'aria-valuenow' ] ]
  for( const [ name, on, off ] of STATES ){
    const v = a[ name ]
    // Empty is ARIA's "not set". A bound boolean arrives written out, "true" or "false" (lips#40)
    v && value.push( words[ v === 'false' ? off! : v === 'mixed' ? 'mixed' : on ] )
  }

  let label = a[ 'aria-labelledby' ] ? refs( a[ 'aria-labelledby' ] ) : a[ 'aria-label' ] || a.alt || labelled
  if( !label && r && NAMED.has( r[ 0 ] ) && !isText ) label = content()
  label = [ label, a[ 'aria-describedby' ] && refs( a[ 'aria-describedby' ] ) ].filter( Boolean ).join(', ')

  const tab = a.tabindex == null || a.tabindex === '' || isNaN( +a.tabindex ) ? undefined : +a.tabindex >= 0
  return {
    'accessibility-element': QUIET.has( role ) || a.alt === '' ? false : r || label ? true : undefined,
    'accessibility-traits': r?.[ 0 ],
    'accessibility-label': label || undefined,
    'accessibility-value': value.filter( Boolean ).join(', ') || undefined,
    'accessibility-heading': role === 'heading' || undefined,
    'accessibility-role-description': a[ 'aria-roledescription' ] || r?.[ 1 ] && ( words[ r[ 1 ] as keyof Words ] ?? r[ 1 ] ),
    'accessibility-elements-hidden': a[ 'aria-hidden' ] === 'true' || undefined,
    'accessibility-exclusive-focus': a[ 'aria-modal' ] === 'true' || undefined,
    focusable: tab
  } as Record<string, unknown>
}
