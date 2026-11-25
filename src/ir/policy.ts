/**
 * RFC-007 — what a template you did not write may touch.
 *
 * ONE policy decides; three places ask it:
 *
 *   checkTemplate   compile time — a refusal is a positioned diagnostic,
 *                   and the refused construct is dropped before it compiles
 *   guard           runtime, expressions — a second evaluator over the same
 *                   AST, asking the policy at every name, member and value
 *   host            runtime, the page — the DOM host with every write to
 *                   the page held to the same rules (RFC-006 §4.1's seam)
 *
 * Compile time REPORTS, runtime ENFORCES: a precompiled IR, a template
 * object built from data, or a value that only exists at runtime never
 * meets the compiler, so the runtime holds the line on its own.
 *
 * The policy is data plus predicates. Replace it whole, or in part —
 * methods call each other through `this`, so overriding `url` changes
 * what `attr` and `css` accept too:
 *
 *   new Lips({ untrusted: { ...untrustedPolicy, url: sameOriginOnly } })
 *
 * It ships as its own entry, `@lipsjs/lips/untrusted`, passed to Lips by
 * value: an app that never renders an untrusted template pays nothing.
 */

import type { Expr, ExprEnv } from './expression'
import { parseExpression, splitTopLevel } from './expression'
import type { TemplateNode, ElementNode, AttrNode, ExprSlot } from './parser'
import type { BlockIR, CompileOptions } from './compiler'
import { HTML_TAGS, CONTROL_TAGS, ARM_TAGS } from './tags'
import type { Host } from './host'
import { domHost } from './host'
import type { Guard, RuntimeOptions, IRComponentDef } from './runtime'
import type { StyleCompileOptions, StyleCompileResult } from './style'

/** The runtime's mark on a component `self` — registered, so this bundle finds the same one */
const SELF = Symbol.for('lips.self')

/** Line/col of `offset` in `src`, as every Lips diagnostic counts them */
const locOf = ( src: string, offset: number, length: number ) => {
  const before = src.slice( 0, offset ).split('\n')
  return { line: before.length, col: before[ before.length - 1 ].length + 1, offset, length }
}

type StyleCompiler = ( src: string, options: StyleCompileOptions ) => StyleCompileResult

// ------------------------------------------------------------------- types
export interface Refusal {
  code: string
  message: string
  hint?: string
}
/** `undefined` allows */
export type Verdict = Refusal | undefined

export interface TemplatePolicy {
  /** Names an expression may read besides its metavars and its scope */
  globals: Record<string, unknown>
  /**
   * May an expression reach `key` — read it, call it, or with `write`
   * assign it? `obj` is the value when known: always at runtime, and at
   * compile time when it is one of `globals`.
   */
  member( key: string, write: boolean, obj?: unknown ): Verdict
  /** The same question for the component's own `self`, which has rules of its own */
  self( key: string, write?: boolean ): Verdict
  /** May an expression hold this value — read from data, returned by a call, passed to an arrow? */
  value( v: unknown ): Verdict
  /** What an inline handler receives in place of a DOM event */
  event( e: Event ): object
  /** May the template create this element (lower-case tag)? */
  tag( name: string ): Verdict
  /** May the template render this registered component? */
  component( name: string ): Verdict
  /**
   * May the template set this attribute on `tag`? `value` is undefined
   * when it is not known yet (an expression, at compile time). `@html` is
   * asked under the name '@html'.
   */
  attr( tag: string, name: string, value?: string ): Verdict
  /** May the page load this URL — an href, a src, a CSS url()? */
  url( value: string ): Verdict
  /** May this CSS reach the page — a stylesheet, a style=, a reactive declaration? */
  css( text: string ): Verdict
  /** Runtime refusals outside an expression land here (inside one, they throw into the component's onError) */
  report( refusal: Refusal ): void
}

/** What the facade needs, built once per untrusted Lips instance — `untrusted()` makes one */
export interface Untrusted {
  check: Check
  /** The style compiler, held to the policy: a sheet with a refusal ships empty */
  style( compile: StyleCompiler ): StyleCompiler
  /** The facade's runtime options, guarded */
  runtime( options: RuntimeOptions ): RuntimeOptions
}

type Check = NonNullable<CompileOptions['check']>

// ------------------------------------------------------------------ tables
const no = ( code: string, message: string, hint?: string ): Refusal => ({ code, message, hint })
const own = ( o: object, key: string ) => Object.prototype.hasOwnProperty.call( o, key )

/** Members that lead to prototypes and constructors rather than data */
const PROTO = new Set([
  'constructor', '__proto__', 'prototype',
  '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__',
  'caller', 'callee'
])

const TAGS = new Set([
  // run script, or are a document of their own
  'script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'portal', 'fencedframe',
  // act on the whole page
  'base', 'link', 'meta', 'style', 'title', 'head', 'body', 'html',
  // content the element check cannot follow
  'template', 'noscript', 'noembed', 'noframes', 'xmp', 'plaintext',
  // SVG animation writes attributes, href among them
  'animate', 'animatemotion', 'animatetransform', 'set'
])

const URL_ATTRS = new Set([
  'href', 'src', 'action', 'formaction', 'xlink:href', 'poster', 'cite', 'background',
  'longdesc', 'manifest', 'data', 'codebase', 'lowsrc', 'dynsrc', 'icon'
])
const SCHEMES = new Set([ 'http', 'https', 'mailto', 'tel' ])

const ATTRS: Record<string, string> = {
  srcdoc: 'It is a whole document, written into an attribute',
  is: "It makes the element one the page defined, running the page's code",
  form: 'It joins a form of the host page by id'
}

// ----------------------------------------------------------------- globals
/**
 * What the default policy offers, and nothing else of the realm. Copies,
 * frozen — the page's own `Math` or `JSON` handed to a template would be
 * the page's to overwrite. Constructors are offered as plain calls with
 * chosen statics, so none of them leads anywhere.
 */
const OFFERED = new WeakSet<object>()
const offer = <T extends object>( o: T ): T => ( OFFERED.add( o ), Object.freeze( o ) )
const pick = ( from: any, keys: string[] ) => Object.fromEntries( keys.map( k => [ k, from[ k ] ] ) )
const call = ( fn: ( ...a: any[] ) => any, statics: Record<string, unknown> = {} ) =>
  offer( Object.assign( ( ...a: any[] ) => fn( ...a ), statics ) )

const GLOBALS: Record<string, unknown> = {
  Math: offer( pick( Math, Object.getOwnPropertyNames( Math ) ) ),
  JSON: offer( pick( JSON, [ 'parse', 'stringify' ] ) ),
  Object: offer( pick( Object, [ 'keys', 'values', 'entries', 'fromEntries' ] ) ),
  Array: offer( pick( Array, [ 'isArray', 'from', 'of' ] ) ),
  String: call( String, pick( String, [ 'fromCharCode', 'fromCodePoint' ] ) ),
  Number: call( Number, pick( Number, [ 'isFinite', 'isInteger', 'isNaN', 'isSafeInteger', 'parseFloat', 'parseInt', 'EPSILON', 'MAX_SAFE_INTEGER', 'MIN_SAFE_INTEGER' ] ) ),
  Boolean: call( Boolean ),
  Date: call( Date, pick( Date, [ 'now', 'parse', 'UTC' ] ) ),
  parseInt, parseFloat, isNaN, isFinite,
  encodeURIComponent, decodeURIComponent, encodeURI, decodeURI
}

// -------------------------------------------------------------------- css
/** The CSS a browser reads: comments gone (outside strings), escapes decoded */
function cssText( src: string ){
  let out = '', i = 0

  while( i < src.length ){
    const c = src[ i ]

    if( c === '"' || c === "'" ){
      let j = i + 1
      while( j < src.length && src[ j ] !== c ) j += src[ j ] === '\\' ? 2 : 1
      out += src.slice( i, j + 1 )
      i = j + 1
      continue
    }
    if( c === '/' && src[ i + 1 ] === '*' ){
      const end = src.indexOf( '*/', i + 2 )
      i = end < 0 ? src.length : end + 2
      continue
    }
    out += c
    i++
  }

  return out.replace( /\\(?:([\da-f]{1,6})[ \t\n\r\f]?|([^\n\r\f\da-f])|[\n\r\f])/gi,
    ( _, hex, ch ) => hex ? String.fromCodePoint( Math.min( parseInt( hex, 16 ), 0x10FFFF ) || 0xFFFD ) : ch ?? '' )
}

/** Platform objects, and the constructors that turn text into code */
const isPlatform = ( v: any ): boolean =>
  v === globalThis
  || v === globalThis.eval
  || ( typeof v === 'function' && /^(Async|AsyncGenerator|Generator)?Function$/.test( v.name ) && v.prototype?.constructor === v )
  || ( typeof Node === 'function' && v instanceof Node )
  || ( typeof Event === 'function' && v instanceof Event )
  || ( typeof EventTarget === 'function' && v instanceof EventTarget )
  // another realm's (an iframe's) nodes and windows
  || ( typeof v === 'object' && ( ( 'nodeType' in v && 'ownerDocument' in v ) || v.window === v ) )

// ---------------------------------------------------------- default policy
export const untrustedPolicy: TemplatePolicy = {
  globals: GLOBALS,

  member( key, write, obj ){
    if( PROTO.has( key ) )
      return no( 'LIPS-U002', `'${key}' leads to prototypes and constructors, not data`,
        'An untrusted template reads and writes data; prototype machinery is not reachable' )

    if( obj != null && OFFERED.has( obj as object ) && ( write || !own( obj as object, key ) ) )
      return no( 'LIPS-U003', write ? `Globals are read-only — '${key}' cannot be written` : `'${key}' is not offered`,
        'Offered: Math, JSON, Object.keys/values/entries/fromEntries, Array.isArray/from/of, String, Number, Boolean, Date, parseInt, parseFloat, isNaN, isFinite and the URI codecs' )
  },

  self( key, write ){
    if( write ) return no( 'LIPS-U005', `self is read-only — '${key}' cannot be written`, 'Write state instead: state.x = …' )
    if( PROTO.has( key ) ) return this.member( key, false )
    // `refs` (lips#37) holds the elements a template names with `@ref`: the same nodes, by name
    if( key === 'node' || key === 'refs' )
      return no( 'LIPS-U005', `self.${key} holds the component's DOM nodes`,
        'An untrusted template reaches the page only through the template language' )
  },

  value( v ){
    if( v !== null && ( typeof v === 'object' || typeof v === 'function' ) && isPlatform( v ) )
      return no( 'LIPS-U004', 'A DOM node, window, event or code constructor cannot be held by an untrusted template',
        'Hand the template data, not the platform object it came from' )
  },

  event( e: any ){
    const el = ( t: any ) => t && {
      value: t.value, checked: t.checked, name: t.name, id: t.id, type: t.type,
      tagName: t.tagName, dataset: { ...t.dataset }
    }

    return {
      type: e.type, key: e.key, code: e.code, data: e.data, inputType: e.inputType,
      altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, repeat: e.repeat,
      button: e.button, buttons: e.buttons, clientX: e.clientX, clientY: e.clientY,
      deltaX: e.deltaX, deltaY: e.deltaY,
      target: el( e.target ),
      currentTarget: el( e.currentTarget ),
      preventDefault: () => e.preventDefault(),
      stopPropagation: () => e.stopPropagation()
    }
  },

  tag( name ){
    const t = name.toLowerCase()

    if( TAGS.has( t ) )
      return no( 'LIPS-U010', `<${t}> is refused in an untrusted template`,
        'It runs script, holds a document of its own, or acts on the whole page' )
    if( t.includes('-') )
      return no( 'LIPS-U011', `<${t}> is a custom element`,
        "Custom elements run the page's own code — a Lips component the host registered renders instead" )
  },

  component( name ){
    if( name === 'router' )
      return no( 'LIPS-U012', '<router> owns the page URL and window.navigate',
        'Switch on state for pages — <switch( state.page )>; routing stays with the host' )
  },

  attr( tag, name, value ){
    const n = name.toLowerCase()

    if( n.startsWith('on') )
      return no( 'LIPS-U020', `'${name}' is an event-handler attribute`, 'Use the instruction form: on-click( … )' )
    if( own( ATTRS, n ) ) return no( 'LIPS-U021', `'${name}' is refused`, ATTRS[ n ] )
    if( value === undefined ) return

    if( ( n === 'id' || n === 'name' ) && typeof document === 'object' && value in document )
      return no( 'LIPS-U022', `${n}="${value}" would shadow document.${value}`, 'Choose another value' )

    if( n === 'style' ) return this.css( value )
    if( URL_ATTRS.has( n ) ) return this.url( value )

    if( n === 'srcset' || n === 'imagesrcset' || n === 'ping' )
      for( const part of value.split( n === 'ping' ? /\s+/ : ',' ) ){
        const r = part.trim() ? this.url( part.trim().split( /\s+/ )[ 0 ] ) : undefined
        if( r ) return r
      }
  },

  url( value ){
    // What a URL parser does first: tabs and newlines go, leading controls and spaces go
    const v = String( value ).replace( /[\t\n\r]/g, '' ).replace( /^[\u0000- ]+/, '' )
    const scheme = /^([a-z][a-z\d+.-]*):/i.exec( v )?.[ 1 ].toLowerCase()

    if( !scheme || SCHEMES.has( scheme ) || /^data:image\/(png|gif|jpe?g|webp|avif|bmp)[;,]/i.test( v ) ) return

    return no( 'LIPS-U030', `'${scheme}:' URLs are refused`,
      'Use a relative, http(s), mailto: or tel: URL — or a raster data:image' )
  },

  css( text ){
    const s = cssText( text )

    if( /@import\b/i.test( s ) )
      return no( 'LIPS-U040', '@import loads a stylesheet outside the component scope', 'Write the rules into the stylesheet itself' )

    if( /(?:^|[^\w-])(?:-webkit-|-moz-)?(?:image-set|image|cross-fade|element)\(/i.test( s ) )
      return no( 'LIPS-U041', 'image-set(), image(), cross-fade() and element() load without url()',
        'Use url( … ), which is held to the URL rule' )

    for( const m of s.matchAll( /\b(?:url|src)\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))/gi ) ){
      const r = this.url( ( m[ 1 ] ?? m[ 2 ] ?? m[ 3 ] ).trim() )
      if( r ) return r
    }
  },

  report( refusal ){ console.warn( '[lips:untrusted]', refusal ) }
}

// ----------------------------------------------------------- compile time
const METAVARS = new Set([ 'state', 'input', 'context', 'static', 'self', 'arguments' ])
/** Elements that are template syntax, not output */
const SYNTAX = new Set([ ...CONTROL_TAGS, ...ARM_TAGS, 'macro' ])
const NONE = new Set<string>()

/**
 * Check one expression. `fail` gets each refusal and where in `source` it
 * sits; the result says whether the expression may stay. A syntax error is
 * left to the compiler, which reports it already.
 *
 * `handler`: the expression is the first segment of an event instruction,
 * where a bare unknown name means a method of `self`.
 */
function checkExpression(
  policy: TemplatePolicy,
  source: string,
  declared: Set<string>,
  fail: ( r: Refusal, at: number, length: number ) => void,
  handler = false
): boolean {
  const { ast, diagnostics } = parseExpression( source )
  if( diagnostics.length ) return true

  let ok = true
  const refuse = ( r: Verdict, at = 0, length = 1 ) => { if( r ){ ok = false; fail( r, at, length ) } }
  const known = ( name: string, locals: Set<string> ) =>
    locals.has( name ) || declared.has( name ) || METAVARS.has( name ) || own( policy.globals, name )

  if( handler && ast.t === 'id' && !known( ast.name, NONE ) ){
    refuse( policy.self( ast.name ), ast.at, ast.name.length )
    return ok
  }

  const visit = ( n: Expr, locals: Set<string>, write = false ): void => {
    switch( n.t ){
      case 'id':
        known( n.name, locals ) || refuse( no( 'LIPS-U001', `'${n.name}' is not provided to an untrusted template`,
          'Expressions read state, input, context, static, self, their scope, and the globals the policy offers' ),
          n.at, n.name.length )
        return

      case 'member': {
        visit( n.obj, locals )
        n.computed && visit( n.prop as Expr, locals )

        const prop = n.prop as Expr
        const key = !n.computed ? n.prop as string
                  : prop.t === 'lit' && ( typeof prop.v === 'string' || typeof prop.v === 'number' ) ? String( prop.v )
                  : undefined
        if( key === undefined ) return

        const root = n.obj.t === 'id' && !locals.has( n.obj.name ) && !declared.has( n.obj.name ) ? n.obj.name : ''
        refuse(
          root === 'self' ? policy.self( key, write )
          : root && own( policy.globals, root ) ? policy.member( key, write, policy.globals[ root ] )
          : policy.member( key, write ),
          n.at, key.length )
        return
      }

      case 'call': visit( n.callee, locals ); n.args.forEach( a => visit( a, locals ) ); return
      case 'unary': visit( n.arg, locals ); return
      case 'update': visit( n.arg, locals, true ); return
      case 'bin': case 'logic': visit( n.l, locals ); visit( n.r, locals ); return
      case 'cond': visit( n.test, locals ); visit( n.cons, locals ); visit( n.alt, locals ); return
      case 'assign': visit( n.target, locals, true ); visit( n.value, locals ); return
      case 'arrow': visit( n.body, new Set([ ...locals, ...n.params ]) ); return
      case 'arr': n.items.forEach( i => visit( i.value, locals ) ); return
      case 'obj':
        for( const p of n.props ){
          p.key !== undefined && refuse( policy.member( p.key, true ), p.at, p.key.length )
          visit( p.value, locals )
        }
    }
  }

  visit( ast, NONE )
  return ok
}

/**
 * The compile-time half: a `CompileOptions.check` that holds a parsed
 * template (and its macros) to `policy`. Every refusal is reported where
 * it is written; the refused element or attribute is removed, a refused
 * expression becomes `undefined`.
 *
 *   compileTemplate( src, { check: checkTemplate( untrustedPolicy ) } )
 */
export function checkTemplate( policy: TemplatePolicy = untrustedPolicy ): Check {
  return ( nodes, diagnostics, src ) => {
    /**
     * Every name the template declares anywhere — iterator and arm
     * arguments, macro argv, let/const. Coarser than the runtime's scope,
     * on purpose: this only decides what to REPORT, and a name declared
     * somewhere else resolves to nothing, never to something of the page.
     */
    const declared = new Set<string>()

    const
    report = ( r: Refusal, offset: number, length = 1 ) =>
      diagnostics.push({ ...r, severity: 'error', loc: locOf( src, offset, length ) }),
    /** Where an expression's own text starts — attribute and slot locations start earlier */
    find = ( text: string, from: number ) => {
      const i = src.indexOf( text, from )
      return i < 0 ? from : i
    },
    expr = ( source: string, from: number, handler = false ) =>
      checkExpression( policy, source, declared, ( r, at, length ) => report( r, from + at, length ), handler ),
    /** `on-x( name, …args )` and `<log( … )>`: comma-separated expressions */
    instruction = ( source: string, from: number, handler = true ) => {
      let ok = true, at = 0
      splitTopLevel( source ).forEach( ( seg, i ) => {
        at = source.indexOf( seg, at )
        ok = expr( seg, from + at, handler && i === 0 ) && ok
        at += seg.length
      })
      return ok
    },
    slots = ( parts: ( string | ExprSlot )[] ) => {
      for( const p of parts )
        if( typeof p !== 'string' && !expr( p.expr, find( p.expr, p.loc.offset ) ) ) p.expr = 'undefined'
    },
    /** An HTML tag is an element; anything else is a component */
    kind = ( tag: string ) => HTML_TAGS.has( tag ) ? policy.tag( tag ) : policy.component( tag )

    const collect = ( list: TemplateNode[] ) => {
      for( const n of list ){
        if( n.t === 'fragment' ) collect( n.children )
        if( n.t !== 'element' ) continue

        for( const a of n.attrs )
          a.k === 'args' ? a.names.forEach( x => declared.add( x ) )
          : ( n.tag === 'let' || n.tag === 'const' ) && 'name' in a && declared.add( a.name )
        collect( n.children )
      }
    }

    /** False drops the attribute */
    const attr = ( a: AttrNode, tag: string | null ): boolean => {
      const from = a.loc.offset

      switch( a.k ){
        case 'args': return true
        case 'event': return instruction( a.source, find( a.source, from ) )
        case 'spread': case 'fn': return expr( a.source, find( a.source, from ) )
      }

      // On an element the attribute reaches the page. `@text` / `@format` / `i18n` are not attributes.
      if( tag && !/^(@(?!html$)|i18n(-|$))/.test( a.name ) ){
        const r = policy.attr( tag, a.name, a.k === 'literal' ? a.value : a.k === 'bool' ? '' : undefined )
        if( r ){
          report( r, from, a.name.length )
          return false
        }
      }

      // `@format="reference, { params }"` — only the params are an expression
      if( a.name === '@format' ){
        const raw = a.k === 'literal' ? a.value
                  : a.k === 'expr' ? a.source
                  : a.k === 'interp' ? a.parts.map( p => typeof p === 'string' ? p : `{${p.expr}}` ).join('')
                  : ''
        const params = raw.slice( raw.indexOf(',') + 1 ).trim()
        return !raw.includes(',') || expr( params, find( params, from ) )
      }

      if( a.k === 'expr' && !expr( a.source, find( a.source, from ) ) ) a.source = 'undefined'
      if( a.k === 'interp' ) slots( a.parts )
      return true
    }

    /** False drops the element and everything in it */
    const element = ( n: ElementNode ): boolean => {
      const { tag } = n

      if( tag === '#dynamic' ){
        const d = n.dynamicTag!, from = find( d.expr, d.loc.offset )

        if( !expr( d.expr, from ) ) d.expr = 'undefined'
        else {
          const { ast } = parseExpression( d.expr )
          const r = ast.t === 'lit' && typeof ast.v === 'string' ? kind( ast.v.toLowerCase() ) : undefined
          if( r ){
            report( r, from, d.expr.length )
            return false
          }
        }
      }
      else if( !SYNTAX.has( tag ) ){
        const r = kind( tag )
        if( r ){
          report( r, n.loc.offset, tag.length + 1 )
          return false
        }
      }

      if( n.head ){
        const h = n.head, from = find( h.expr, h.loc.offset )
        ;( tag === 'log' ? instruction( h.expr, from, false ) : expr( h.expr, from ) ) || ( h.expr = 'undefined' )
      }

      const html = HTML_TAGS.has( tag ) ? tag : null
      n.attrs = n.attrs.filter( a => attr( a, html ) )
      return true
    }

    const walk = ( list: TemplateNode[] ) => {
      for( let i = 0; i < list.length; i++ ){
        const n = list[ i ]

        if( n.t === 'fragment' ) walk( n.children )
        else if( n.t === 'interp' ) slots( n.parts )
        else if( n.t === 'element' )
          element( n ) ? walk( n.children ) : list.splice( i--, 1 )
      }
    }

    collect( nodes )
    walk( nodes )
  }
}

// ---------------------------------------------------------------- runtime
const fault = ( r: Refusal ) => Object.assign( new Error( r.message ), { name: 'PolicyError' }, r )

type Frame = Record<string, any>

const OPS: Record<string, ( l: any, r: any ) => any> = {
  '+': ( l, r ) => l + r,   '-': ( l, r ) => l - r,   '*': ( l, r ) => l * r,
  '/': ( l, r ) => l / r,   '%': ( l, r ) => l % r,
  '<': ( l, r ) => l < r,   '>': ( l, r ) => l > r,   '<=': ( l, r ) => l <= r,  '>=': ( l, r ) => l >= r,
  // eslint-disable-next-line eqeqeq
  '==': ( l, r ) => l == r, '!=': ( l, r ) => l != r,
  '===': ( l, r ) => l === r, '!==': ( l, r ) => l !== r
}

/**
 * The guarded evaluator. Same AST and same semantics as
 * `interpretExpression`, which it deliberately does not share: the trusted
 * walker stays as fast as it was, and this one stays small enough to read
 * in one sitting.
 *
 * Every value becomes visible to a template in one of four ways — a name,
 * a member read, a call's result, an arrow's argument — and each goes
 * through `policy.value`. Every member, read or written, goes through
 * `policy.member` (or `policy.self`). Refusals throw: an expression that
 * cannot finish must not finish with something else.
 */
function evaluator( policy: TemplatePolicy ){
  const
  refuse = ( r: Verdict ) => { if( r ) throw fault( r ) },
  hold = <T>( v: T ): T => ( refuse( policy.value( v ) ), v ),
  keyOf = ( k: unknown ): string => {
    if( typeof k === 'string' ) return k
    if( typeof k === 'number' ) return String( k )
    throw fault( no( 'LIPS-U002', 'A computed member must be a string or a number' ) )
  },
  reach = ( obj: any, key: string, write: boolean ) =>
    refuse( obj != null && typeof obj === 'object' && obj[ SELF ] ? policy.self( key, write ) : policy.member( key, write, obj ) )

  return ( ast: Expr, env: ExprEnv ) => {
    const scope = env.scope

    const name = ( id: string, frames: Frame[] ) => {
      for( const f of frames ) if( id in f ) return f[ id ]
      if( scope && id in scope ) return hold( scope[ id ] )

      switch( id ){
        case 'state': return env.state
        case 'input': return env.input
        case 'context': return env.context
        case 'static': return env.static
        case 'self': return env.self
        case 'arguments': return env.arguments
      }
      return own( policy.globals, id ) ? policy.globals[ id ] : undefined
    }

    const set = ( t: Expr, v: any, frames: Frame[] ) => {
      if( t.t === 'id' ){
        const f = frames.find( f => t.name in f ) ?? scope
        f && ( f[ t.name ] = v )
      }
      else if( t.t === 'member' ){
        const obj = ev( t.obj, frames )
        const key = keyOf( t.computed ? ev( t.prop as Expr, frames ) : t.prop )
        reach( obj, key, true )
        if( obj != null ) obj[ key ] = v
      }
      return v
    }

    const ev = ( n: Expr, frames: Frame[] ): any => {
      switch( n.t ){
        case 'lit': return n.v
        case 'id': return name( n.name, frames )

        case 'member': {
          const obj = ev( n.obj, frames )
          if( n.optional && obj == null ) return undefined
          const key = keyOf( n.computed ? ev( n.prop as Expr, frames ) : n.prop )
          reach( obj, key, false )
          return obj == null ? undefined : hold( obj[ key ] )
        }

        case 'call': {
          const c = n.callee
          let self: any, fn: any

          if( c.t === 'member' ){
            self = ev( c.obj, frames )
            if( ( c.optional || n.optional ) && self == null ) return undefined
            const key = keyOf( c.computed ? ev( c.prop as Expr, frames ) : c.prop )
            reach( self, key, false )
            fn = self == null ? undefined : hold( self[ key ] )
          }
          else fn = ev( c, frames )

          if( n.optional && fn == null ) return undefined
          return hold( Reflect.apply( fn, self, n.args.map( a => ev( a, frames ) ) ) )
        }

        case 'unary': {
          const v = ev( n.arg, frames )
          return n.op === '!' ? !v : n.op === '-' ? -v : +v
        }
        case 'update': {
          const cur = ev( n.arg, frames ), next = n.op === '++' ? cur + 1 : cur - 1
          set( n.arg, next, frames )
          return n.prefix ? next : cur
        }
        case 'bin': return OPS[ n.op ]( ev( n.l, frames ), ev( n.r, frames ) )
        case 'logic': {
          const l = ev( n.l, frames )
          return n.op === '&&' ? l && ev( n.r, frames ) : n.op === '||' ? l || ev( n.r, frames ) : l ?? ev( n.r, frames )
        }
        case 'cond': return ev( n.test, frames ) ? ev( n.cons, frames ) : ev( n.alt, frames )
        case 'assign':
          return set( n.target, n.op === '=' ? ev( n.value, frames ) : OPS[ n.op[ 0 ] ]( ev( n.target, frames ), ev( n.value, frames ) ), frames )

        case 'arrow':
          return ( ...args: any[] ) => {
            const f: Frame = Object.create( null )
            n.params.forEach( ( p, k ) => f[ p ] = hold( args[ k ] ) )
            return ev( n.body, [ f, ...frames ] )
          }

        case 'arr': {
          const out: any[] = []
          for( const i of n.items ) i.spread ? out.push( ...ev( i.value, frames ) ) : out.push( ev( i.value, frames ) )
          return out
        }
        case 'obj': {
          const out: Frame = {}
          const put = ( k: string, v: any ) => { reach( out, k, true ); out[ k ] = v }

          for( const p of n.props ){
            const v = ev( p.value, frames )
            if( !p.spread ) put( p.key!, v )
            else if( v != null ) for( const k of Object.keys( v ) ) put( k, hold( v[ k ] ) )
          }
          return out
        }
      }
    }

    return ev( ast, [] )
  }
}

/**
 * The DOM host, held to the policy at the one place where nothing gets
 * past: what reaches the page. Skeletons — from the compiler or from a
 * precompiled IR nobody checked — are swept once, when first parsed, in
 * the inert `<template>` they are parsed into; `@html` goes through the
 * same sweep; every attribute, element, style value and listener after
 * that is asked one at a time.
 *
 * It never throws: a render cannot be half-aborted. A refused write is
 * skipped and reported.
 */
function guardHost( policy: TemplatePolicy, base: Host<Node> = domHost ): Host<Node> {
  const
  swept = new WeakMap<BlockIR, HTMLTemplateElement>(),
  refused = ( r: Verdict ) => ( r && policy.report( r ), !!r ),
  tagOf = ( el: Node ) => ( el as Element ).localName.toLowerCase(),
  /**
   * What a refused element becomes: an inert, hidden `<template>` that
   * keeps the children, so the skeleton's paths still resolve.
   */
  standIn = ( doc: Document, tag: string ) => {
    const t = doc.createElement('template')
    t.setAttribute( 'data-lips-refused', tag )
    return t
  }

  const sweep = ( root: DocumentFragment ) => {
    for( const el of [ ...root.querySelectorAll('*') ] ){
      const tag = tagOf( el )

      if( refused( policy.tag( tag ) ) ){
        const t = standIn( el.ownerDocument, tag )
        t.append( ...el.childNodes )
        el.replaceWith( t )
        continue
      }

      let shed = false
      for( const { name, value } of [ ...el.attributes ] )
        if( refused( policy.attr( tag, name, value ) ) ){
          el.removeAttribute( name )
          shed ||= name.toLowerCase() === 'is'
        }

      /**
       * `is` outlives its attribute: the element was parsed as the page's
       * custom element and upgrades on insertion. Only a new one sheds it.
       */
      if( shed ){
        const fresh = el.ownerDocument.createElementNS( el.namespaceURI, el.localName )
        for( const a of [ ...el.attributes ] ) fresh.setAttribute( a.name, a.value )
        fresh.append( ...el.childNodes )
        el.replaceWith( fresh )
      }
    }
  }

  const parse = ( markup: string ) => {
    const tpl = document.createElement('template')
    tpl.innerHTML = markup
    sweep( tpl.content )
    return tpl
  }

  return {
    ...base,

    clone( block ){
      let tpl = swept.get( block )
      if( !tpl ) swept.set( block, tpl = parse( block.html ) )
      return tpl.content.cloneNode( true )
    },

    element: tag => refused( policy.tag( tag.toLowerCase() ) ) ? standIn( document, tag ) : base.element( tag ),

    attr( el, name, value ){
      base.attr( el, name, value !== null && refused( policy.attr( tagOf( el ), name, value ) ) ? null : value )
    },

    html( el, value ){
      refused( policy.attr( tagOf( el ), '@html', value ) )
        ? base.content( el, '' )
        : ( el as Element ).replaceChildren( parse( value ).content )
    },

    styleVar( el, prop, value ){
      base.styleVar( el, prop, value !== null && refused( policy.css( value ) ) ? null : value )
    },

    /** Handlers see the policy's view of an event, never the event */
    listen: ( el, name, fn ) => base.listen( el, name, e => fn( policy.event( e ) ) )
  }
}

/** A refused component renders as this — nothing */
const NOTHING: IRComponentDef = { ir: { v: 1, exprs: [], root: { html: '', scope: [], binds: [], blocks: [] } } }

/**
 * Everything an untrusted Lips instance runs with:
 *
 *   new Lips({ untrusted: untrusted() })
 *   new Lips({ untrusted: untrusted({ ...untrustedPolicy, url: sameOriginOnly }) })
 */
export function untrusted( policy: TemplatePolicy = untrustedPolicy ): Untrusted {
  const
  run = evaluator( policy ),
  asts = new Map<string, Expr>(),
  host = guardHost( policy ),
  /** Stylesheets this instance compiled from source and found clean: the only ones injected */
  sheets = new Set<string>()

  const guard: Guard = {
    run( src ){
      let ast = asts.get( src )
      if( !ast ) asts.set( src, ast = parseExpression( src ).ast )
      return env => run( ast!, env )
    },
    self: key => policy.self( key )
  }

  return {
    check: checkTemplate( policy ),

    style: compile => ( src, options ) => {
      const
      result = compile( src, {
        ...options,
        lint( text, value ){
          const r = value !== undefined ? policy.css( value ) : text[ 0 ] === '@' ? policy.css( text ) : undefined
          return r && [{ ...r, severity: 'error' }]
        }
      }),
      fail = ( r: Refusal, at: number, length: number ) =>
        result.diagnostics.push({ ...r, severity: 'error', loc: locOf( src, Math.max( at, 0 ), length ) })

      let clean = !result.diagnostics.some( d => d.code.startsWith('LIPS-U') )

      // Stylesheet expressions are held to the same rules, where they are written
      for( const e of result.ir.exprs ){
        const at = src.indexOf( e )
        clean = checkExpression( policy, e, NONE, ( r, a, length ) => fail( r, at + a, length ) ) && clean
      }

      // What the statement-by-statement lint cannot see (an `@import` at EOF with no `;`)
      const whole = clean ? policy.css( result.ir.css ) : undefined
      whole && fail( whole, 0, 0 )

      if( !clean || whole ) return { ...result, ir: { ...result.ir, css: '', binds: [], props: undefined } }

      sheets.add( result.ir.css )
      return result
    },

    runtime( options ){
      const { components, createStylesheet } = options

      return {
        ...options,
        guard,
        host,

        components: components && new Proxy( components, {
          get: ( target, name: string ) => refusedComponent( policy, name ) ? NOTHING : target[ name ]
        }),

        /**
         * A stylesheet reaches the page only if this instance compiled it
         * from source: a precompiled sheet — or one in a definition built
         * from data — is injected verbatim and was never scoped by Lips.
         */
        createStylesheet: createStylesheet && ( ( nsp, css ) => {
          if( sheets.has( css ) ) return createStylesheet( nsp, css )
          policy.report( no( 'LIPS-U042', `A stylesheet Lips did not compile cannot be checked — <${nsp}> ships unstyled`,
            'Send the stylesheet source; precompiled sheets are trusted output' ) )
          return { clear(){} }
        })
      }
    }
  }
}

const refusedComponent = ( policy: TemplatePolicy, name: string ) => {
  const r = typeof name === 'string' ? policy.component( name ) : undefined
  r && policy.report( r )
  return !!r
}
