/**
 * Templates on Lynx (RFC-006 §4.3): HTML-shaped tags, Lynx's rules.
 *
 * `compileLynxTemplate( src )` is `compileTemplate( src, { target: 'tree' })`
 * plus a pass over the parsed template for what HTML allows and Lynx
 * does not:
 *
 *  - Text renders only inside a text element. Where an element's content
 *    is inline — text, binds, text-like tags, control flow around them —
 *    it is wrapped in ONE `text`, which lays it out as a browser would:
 *    `<button>Save {state.n}</button>` just works. Text beside block
 *    content is ambiguous (one text? several?), so it is an error to fix
 *    (RFC-006 §9.2, decided 2026-10-16).
 *  - An HTML tag with no Lynx element is an error, with what to use.
 *  - A `list` holds `list-item`s: Lynx renders nothing else in one.
 *
 *   code        what
 *   LIPS-L101   HTML tag with no Lynx element
 *   LIPS-L102   text beside block content, in an element that is not text
 *   LIPS-L103   text at the top level: renders only inside a text element (warning)
 *   LIPS-L104   a list child that is not a list-item
 *
 * Macro bodies are inlined after this pass, so it does not see them.
 */
import { compileTemplate, HTML_TAGS, type CompileOptions, type CompileResult } from '../ir/compiler'
import type { TemplateNode, ElementNode, TemplateDiagnostic } from '../ir/parser'
import { locOf } from '../ir/style'
import { LYNX_TAG } from './protocol'

/** Control flow and its arms: transparent, their content lands in the parent */
const FLOW = new Set([
  'if', 'else-if', 'else', 'for', 'switch', 'case', 'default', 'async', 'then', 'catch',
  'loading', 'let', 'const', 'log', 'context', 'i18n'
])

/** Lynx's own elements that hold others, written as themselves (§3.4) */
const CONTAINERS = new Set([ 'view', 'scroll-view', 'list-item', 'swiper', 'swiper-item', 'overlay', 'refresh-view', 'viewpager' ])

/** Lynx elements whose names HTML or SVG also uses */
const NATIVE = new Set([ 'text', 'image', 'input', 'textarea', 'canvas', 'svg', 'audio' ])

const TABLE = 'Lynx has no tables: lay rows out with <div>s, in flex or grid'
const HINTS: Record<string, string> = {
  table: TABLE, thead: TABLE, tbody: TABLE, tfoot: TABLE, tr: TABLE, td: TABLE, th: TABLE,
  caption: TABLE, col: TABLE, colgroup: TABLE,
  select: 'Lynx has no native picker element: a list of <div>s, or a picker component',
  option: 'Lynx has no native picker element: a list of <div>s, or a picker component',
  br: 'End the <p> and start another one',
  hr: 'A <div> with a border',
  pre: 'A <p> styled white-space: pre',
  iframe: "Lynx's <webview>"
}

const lynxTag = ( tag: string ) => LYNX_TAG[ tag ] || tag
const isText = ( tag: string ) => lynxTag( tag ) === 'text'

/** Text or a bind here, or in control flow here — not inside an element */
function looseText( nodes: TemplateNode[] ): TemplateNode | undefined {
  for( const n of nodes ){
    if( n.t === 'text' || n.t === 'interp' ) return n
    const inner = n.t === 'fragment' || n.t === 'element' && FLOW.has( n.tag ) ? looseText( n.children ) : undefined
    if( inner ) return inner
  }
}

/** All of it would sit inline in a browser: one text can hold it */
const inline = ( nodes: TemplateNode[] ): boolean => nodes.every( n =>
  n.t === 'fragment' || n.t === 'element' && FLOW.has( n.tag ) ? inline( n.children )
  : n.t !== 'element' || isText( n.tag ) )

/** The elements here, through control flow */
function* elements( nodes: TemplateNode[] ): Generator<TemplateNode> {
  for( const n of nodes )
    n.t === 'fragment' || n.t === 'element' && FLOW.has( n.tag ) ? yield* elements( n.children )
    : n.t !== 'comment' && ( yield n )
}

export function lynxVocabulary( src: string ){
  return ( nodes: TemplateNode[], diagnostics: TemplateDiagnostic[] ) => {
    const report = ( code: string, severity: 'error' | 'warning', message: string, at: TemplateNode, hint?: string ) =>
      diagnostics.push({ code, severity, message, hint, loc: locOf( src, at.loc.offset, at.loc.length ) })

    const walk = ( nodes: TemplateNode[] ) => {
      for( const n of nodes ){
        if( n.t === 'fragment' ) walk( n.children )
        if( n.t !== 'element' ) continue

        const tag = n.tag
        if( HTML_TAGS.has( tag ) && !LYNX_TAG[ tag ] && !NATIVE.has( tag ) )
          report( 'LIPS-L101', 'error', `<${tag}> has no Lynx element: it would render nothing`, n,
                  HINTS[ tag ] || 'Use a tag Lynx renders: <div>, <p>, <span>, <img>, <input> or a Lynx element' )

        else if( tag === 'list' ){
          for( const c of elements( n.children ) )
            c.t === 'element' && c.tag === 'list-item'
            || report( 'LIPS-L104', 'error', `A <list> holds <list-item>s: Lynx renders nothing else in one`, c,
                       'Put each row in a <list-item>' )
        }

        else if( lynxTag( tag ) === 'view' || CONTAINERS.has( tag ) ){
          const text = looseText( n.children )
          if( text && inline( n.children ) ){
            /**
             * One text around all of it. An `i18n` marker goes with the
             * text it translates; the element keeps it for its attributes.
             */
            const i18n = n.attrs.filter( a => 'name' in a && a.name === 'i18n' )
            n.children = [{ t: 'element', tag: 'text', attrs: i18n, children: n.children, selfClosed: false, loc: n.loc }]
          }
          else text && report( 'LIPS-L102', 'error', `Text beside block content in <${tag}>: Lynx renders text only inside a text element`, text,
                               'Wrap the text in a <span> or a <p>' )
        }

        walk( n.children )
      }
    }

    const text = looseText( nodes )
    text && report( 'LIPS-L103', 'warning', 'Text at the top level of a template renders only when the template is placed inside a text element', text,
                    'Put it in a <p> or a <span>' )
    walk( nodes )
  }
}

/**
 * Compile a template for Lynx: the node tree a native host builds from,
 * with the vocabulary adapted and checked.
 */
export const compileLynxTemplate = ( src: string, options?: Omit<CompileOptions, 'target' | 'transform'> ): CompileResult =>
  compileTemplate( src, { ...options, target: 'tree', transform: lynxVocabulary( src ) })
