/**
 * The style pipeline for the Lynx target (RFC-006 §4.4). Build-time only:
 * Lynx cannot add a stylesheet at runtime (§3.7), so a component sheet is
 * compiled into the bundle's CSS, and the background thread gets only the
 * binds.
 *
 *   const { ir, diagnostics } = compileLynxStyle( source, { nsp: 'card', preprocess: stylisPreprocessor })
 *   ir.css     → the bundle's CSS: flat, scoped by class
 *   ir.binds   → the background: variables written on the scope roots
 *
 * What changes from the DOM, each because of what the engine does (§3):
 *
 *  - **Flat.** Lynx has no CSS nesting, so the sheet always goes through
 *    the preprocessor.
 *  - **Scoped by class**, `.lips-<nsp>`. Attribute selectors parse but
 *    never match (§3.1).
 *  - **Full-value binds.** `calc()` works on lengths only (§3.2), so
 *    `padding: {x}px` binds a variable that carries the unit (`12px`)
 *    instead of multiplying a number back into it. There is no
 *    `@property`, so no registrations either.
 *  - **Lint.** Whatever parses but does nothing on Lynx is a diagnostic on
 *    the source (`LIPS-L…`), not a silent no-op.
 */

import { compileStyle, type StyleIR, type StyleLint, type StylePreprocessor, type StyleCompileResult } from '../ir/style'
import { LYNX_TAG, scopeClass } from './protocol'

export interface LynxStyleOptions {
  /** Scope name: the component's registration name */
  nsp: string
  /** Flattens the sheet. Required: Lynx has no CSS nesting */
  preprocess: StylePreprocessor
  /** Global sheet: no scope */
  meta?: boolean
}

/**
 * The page config the pipeline relies on (RFC-006 §4.4). These are PAGE
 * config, `sourceContent.config` in the encoder — as compiler options
 * they do nothing (tested, tier B):
 *
 *  - `enableCSSInlineVariables`: variables set inline (the binds) apply
 *  - `enableCSSRule`: `@media` applies
 *  - `enableCSSInheritance`: `color`, `font-size` and the other text
 *    properties inherit, as on the web. Templates are HTML-shaped and
 *    sheets are written for the web's cascade.
 */
export const LYNX_PAGE_CONFIG = {
  enableCSSInlineVariables: true,
  enableCSSRule: true,
  enableCSSInheritance: true
}

export function compileLynxStyle( source: string, options: LynxStyleOptions ): StyleCompileResult {
  const { ir, diagnostics } = compileStyle( source, {
    nsp: options.nsp,
    meta: options.meta,
    preprocess: options.preprocess,
    scope: `.${scopeClass( options.nsp )}`,
    lint: lintLynx
  })
  return { ir: fullValues( ir ), diagnostics }
}

// ----------------------------------------------------------- full values
/**
 * What the compiler writes for a unit-suffixed bind on the DOM, where the
 * variable holds a number. Matched only on the compiler's own variable
 * names (`--<nsp>-<n>`), never an author's.
 */
const GENERATED_CALC = /calc\(var\((--[\w-]+?-(\d+))\)\s*\*\s*1(%|[a-zA-Z]+)\)/g
const REGISTRATION = /@property\s[^{]+\{[^}]*\}/g

/**
 * Rewrite each `calc(var(--card-0) * 1px)` as `var(--card-0-px)`, bound to
 * the same expression with its unit: the runtime writes `12px` whole. One
 * expression used with two units becomes two variables.
 */
function fullValues( ir: StyleIR ): StyleIR {
  const
  prefix = `--${ir.nsp.replace( /[^a-zA-Z0-9_-]/g, '-' )}-`,
  binds = [ ...ir.binds ],
  css = ir.css
    .replace( REGISTRATION, '' )
    .replace( GENERATED_CALC, ( whole, prop: string, e: string, unit: string ) => {
      if( !prop.startsWith( prefix ) || prop.length !== prefix.length + e.length ) return whole

      const name = `${prop}-${unit === '%' ? 'pct' : unit}`
      binds.some( b => b.prop === name ) || binds.push({ prop: name, e: +e, u: unit })
      return `var(${name})`
    })

  const out: StyleIR = {
    ...ir,
    css,
    // A number-holding variable no rule reads any more is never written
    binds: binds.filter( b => b.u || !b.prop.startsWith( prefix ) || css.includes(`var(${b.prop})`) )
  }
  delete out.props
  return out
}

// ------------------------------------------------------------------ lint
type Finding = NonNullable<ReturnType<StyleLint>>[ number ]

const error = ( code: string, message: string, hint?: string ): Finding => ({ code, severity: 'error', message, hint })
const warning = ( code: string, message: string, hint?: string ): Finding => ({ code, severity: 'warning', message, hint })

/**
 * Every property Lynx supports: the `Shorthands` and `Longhands` of
 * `@lynx-js/types` 4.2.1 (`types/common/csstype.d.ts`), which are
 * generated from the engine, in CSS spelling.
 */
const PROPERTIES = new Set( `
  -x-animation-color-interpolation -x-app-region -x-auto-font-size -x-auto-font-size-line-ranges
  -x-auto-font-size-preset-sizes -x-caret-gradient -x-caret-height -x-caret-radius -x-caret-width
  -x-handle-color -x-handle-size adapt-font-size align-content align-items align-self animation
  animation-delay animation-direction animation-duration animation-fill-mode
  animation-iteration-count animation-name animation-play-state animation-timing-function
  aspect-ratio background background-clip background-color background-image background-origin
  background-position background-repeat background-size border border-bottom border-bottom-color
  border-bottom-left-radius border-bottom-right-radius border-bottom-style border-bottom-width
  border-color border-end-end-radius border-end-start-radius border-inline-end-color
  border-inline-end-style border-inline-end-width border-inline-start-color
  border-inline-start-style border-inline-start-width border-left border-left-color
  border-left-style border-left-width border-radius border-right border-right-color
  border-right-style border-right-width border-start-end-radius border-start-start-radius
  border-style border-top border-top-color border-top-left-radius border-top-right-radius
  border-top-style border-top-width border-width bottom box-shadow box-sizing caret-color
  clip-path color column-gap content cursor direction display enter-transition-name
  exit-transition-name filter flex flex-basis flex-direction flex-flow flex-grow flex-shrink
  flex-wrap font-family font-feature-settings font-optical-sizing font-size font-style
  font-variation-settings font-weight gap grid-auto-columns grid-auto-flow grid-auto-rows
  grid-column-end grid-column-gap grid-column-span grid-column-start grid-row-end grid-row-gap
  grid-row-span grid-row-start grid-template-columns grid-template-rows height hyphens
  image-rendering implicit-animation inset-inline-end inset-inline-start justify-content
  justify-items justify-self layout-animation-create-delay layout-animation-create-duration
  layout-animation-create-property layout-animation-create-timing-function
  layout-animation-delete-delay layout-animation-delete-duration layout-animation-delete-property
  layout-animation-delete-timing-function layout-animation-update-delay
  layout-animation-update-duration layout-animation-update-timing-function left letter-spacing
  line-height line-spacing linear-cross-gravity linear-direction linear-gravity
  linear-layout-gravity linear-orientation linear-weight linear-weight-sum list-cross-axis-gap
  list-main-axis-gap margin margin-bottom margin-inline-end margin-inline-start margin-left
  margin-right margin-top mask mask-clip mask-image mask-origin mask-position mask-repeat
  mask-size max-height max-width min-height min-width offset-distance offset-path offset-rotate
  opacity order outline outline-color outline-style outline-width overflow overflow-x overflow-y
  padding padding-bottom padding-inline-end padding-inline-start padding-left padding-right
  padding-top pause-transition-name perspective pointer-events position relative-align-bottom
  relative-align-inline-end relative-align-inline-start relative-align-left relative-align-right
  relative-align-top relative-bottom-of relative-center relative-id relative-inline-end-of
  relative-inline-start-of relative-layout-once relative-left-of relative-right-of relative-top-of
  resume-transition-name right row-gap text-align text-decoration text-decoration-color
  text-indent text-overflow text-shadow text-stroke text-stroke-color text-stroke-width top
  transform transform-origin transition transition-delay transition-duration transition-property
  transition-timing-function vertical-align visibility white-space width word-break z-index
`.trim().split( /\s+/ ) )

/** `@font-face` descriptors: declarations, but not properties */
const DESCRIPTORS = new Set([ 'src', 'font-display', 'unicode-range' ])

/**
 * `calc()` works on these (§3.2): lengths, but not `border-radius`,
 * `transform`, `opacity` or colours (tested, tier B: `opacity: calc(…)`
 * stays an unevaluated string).
 */
const CALC_OK = /^(width|height|(min|max)-(width|height)|(margin|padding)(-(top|right|bottom|left|inline-start|inline-end))?|top|right|bottom|left|inset-inline-(start|end)|gap|row-gap|column-gap|grid-(row|column)-gap|font-size|line-height|letter-spacing|flex-basis|text-indent|border(-(top|right|bottom|left|inline-start|inline-end))?-width|outline-width)$/

/** Pseudo-classes that match (§3.1); `:hover` only on desktop */
const PSEUDO_OK = new Set([ 'not', 'active', 'focus', 'root' ])
/** Pseudo-elements still written with one colon */
const LEGACY_ELEMENT = new Set([ 'before', 'after', 'first-line', 'first-letter' ])

/** Supported at-rules (`@media` with `enableCSSRule`, set by `LYNX_PAGE_CONFIG`) */
const AT_OK = new Set([ 'media', 'keyframes', 'font-face', 'import' ])
/** Evaluated in the engine's source, documented as unsupported: untested */
const AT_UNVERIFIED = new Set([ 'supports', 'layer' ])

const QUOTED = /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g

const lintLynx: StyleLint = ( text, value ) =>
  text[ 0 ] === '@' ? atRule( text )
  : value === undefined ? selector( text )
  : declaration( text, value )

function selector( prelude: string ){
  const
  found: Finding[] = [],
  s = prelude.replace( QUOTED, '""' )

  if( s.includes('[') )
    found.push( error( 'LIPS-L001', 'Attribute selectors never match on Lynx', 'Select by class instead.' ) )

  for( const [ , colons, name ] of s.matchAll( /(::?)([-\w]+)/g ) ){
    const pseudo = name.toLowerCase()

    if( colons === '::' || LEGACY_ELEMENT.has( pseudo ) )
      found.push( error( 'LIPS-L002', `Pseudo-elements are not supported on Lynx: '${colons}${name}'`, 'Render it as an element.' ) )
    else if( pseudo === 'hover' )
      found.push( warning( 'LIPS-L004', "':hover' matches only on desktop Lynx", 'Mobile has no pointer to hover with.' ) )
    else if( !PSEUDO_OK.has( pseudo ) )
      found.push( error( 'LIPS-L003', `':${name}' never matches on Lynx`, 'Lynx matches :not(), :active, :focus and :root. Use a class.' ) )
  }

  // Type selectors: a name opening a compound, outside `[…]`
  for( const [ , , tag ] of s.replace( /\[[^\]]*\]/g, '' ).matchAll( /(^|[\s>+~,(])([a-zA-Z][-\w]*)/g ) ){
    const lynx = LYNX_TAG[ tag.toLowerCase() ]
    lynx && found.push( error( 'LIPS-L005',
      `'${tag}' renders as '${lynx}' on Lynx, so this selector never matches`,
      `Use a class. A '${lynx}' selector would match every ${lynx}, not just the ${tag}s.` ) )
  }

  return found
}

function atRule( prelude: string ){
  const name = /^@(?:-\w+-)?([-\w]+)/.exec( prelude )?.[ 1 ].toLowerCase()
  if( !name || AT_OK.has( name ) ) return

  return [ AT_UNVERIFIED.has( name )
    ? warning( 'LIPS-L007', `'@${name}' is untested on Lynx`, 'The engine evaluates it, but its docs say it is unsupported.' )
    : error( 'LIPS-L006', `'@${name}' is not supported on Lynx` ) ]
}

function declaration( name: string, value: string ){
  const found: Finding[] = []
  if( name.startsWith('--') ) return found

  const property = name.toLowerCase()
  PROPERTIES.has( property ) || DESCRIPTORS.has( property )
  || found.push( warning( 'LIPS-L008', `'${name}' is not a Lynx CSS property`, 'Lynx ignores it.' ) )

  // What the compiler generated for a bind is not the author's calc()
  const authored = value.replace( QUOTED, '""' ).replace( GENERATED_CALC, 'var()' )

  const fn = /(?:^|[^-\w])(min|max|clamp)\(/i.exec( authored )
  fn && found.push( error( 'LIPS-L009', `'${fn[ 1 ]}()' is not supported on Lynx`, 'Compute the value in the expression instead.' ) )

  ;/(?:^|[^-\w])calc\(/i.test( authored ) && !CALC_OK.test( property )
  && found.push( error( 'LIPS-L010', `'calc()' works on length properties only on Lynx, not '${name}'`,
    'Bind the computed value instead: `{expr}` writes it whole.' ) )

  ;/!\s*important/i.test( authored )
  && found.push( warning( 'LIPS-L011', "'!important' is ignored on Lynx unless the page enables it" ) )

  return found
}
