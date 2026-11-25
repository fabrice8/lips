/**
 * Public types.
 *
 * Component authoring shape — the same plain object the framework has
 * always taken, and the serializable artifact a generator can emit:
 *
 *   { default, state, handler, _static, context, macros, stylesheet }
 *
 * These are the types `register`/`render`/`root` actually accept: the
 * facade is generic over `Metavars`, so `Template<MT>` here and the
 * argument the engine takes are the same type, not parallel ones.
 */
import type { MessageFormat, Model } from 'messageformat'
import type { MessageFunction } from 'messageformat/functions'
import type { TemplateIR } from './ir/compiler'
import type { StyleIR } from './ir/style'
import type { Untrusted } from './ir/policy'
import type { IRLips } from './ir/facade'

/**
 * The four typed surfaces of a component. Defaults are permissive on
 * purpose: an untyped `lips.render('x', { state: { n: 0 } })` still
 * gets `c.state.n` without annotation, and a component that declares
 * its metavars gets exact types. Tightening these to `{}` would turn
 * every unannotated read into a compile error.
 */
export interface Metavars<
  Input extends Object = Record<string, any>,
  State extends Object = Record<string, any>,
  Static extends Object = Record<string, any>,
  Context extends Object = Record<string, any>
> {
  Input: Input
  State: State
  Static: Static
  Context: Context
}

export type LifeCycleEventTypes = 'onCreate'
                                  | 'onInput'
                                  | 'onMount'
                                  | 'onRender'
                                  | 'onUpdate'
                                  | 'onAttach'
                                  | 'onDetach'
                                  | 'onContext'
                                  | 'onError'
                                  | 'onDestroy'

/**
 * `this` inside a handler: reactive stores plus the component's
 * own API (emit/on/off, setContext).
 */
export interface ComponentSelf<MT extends Metavars = Metavars> {
  state: MT['State']
  input: MT['Input']
  context: MT['Context']
  static: MT['Static']

  /** Live root elements of this component */
  readonly node: Element[]

  /**
   * The elements its template names with `@ref="name"`, while they live:
   * `this.refs.search.focus()`. On the DOM each is the element; on Lynx a
   * node that answers `focus`, `blur`, `scrollTo`, `scrollIntoView` and
   * `animate` as the element would.
   */
  readonly refs: Record<string, any>

  /**
   * Active language, read reactively — a bind that reads it re-renders
   * on `setLanguage()`. Component-grained: a component under
   * `<i18n lang=…>` reports the scoped language, but an `<i18n>` block
   * inside this component's own template does not change it (RFC-005 §2).
   */
  readonly lang: string
  /** Switches the language for the whole app — the single writer */
  setLanguage( lang: string ): void

  /** Reaches both this component's own listeners and external ones */
  emit( event: string, ...args: any[] ): void
  /**
   * Also the inbound channel: a listener registered here receives
   * `component.emit(…)` calls made by whoever holds the handle.
   */
  on( event: string, fn: ( ...args: any[] ) => void ): ComponentSelf<MT>
  once( event: string, fn: ( ...args: any[] ) => void ): ComponentSelf<MT>
  off( event: string, fn?: ( ...args: any[] ) => void ): ComponentSelf<MT>
  setContext( arg: string | Record<string, any>, value?: any ): void

  /** Sibling handlers, reachable as `this.otherMethod()` */
  [ key: string ]: any
}

export interface LifecycleEvents<MT extends Metavars> {
  onCreate( this: ComponentSelf<MT> ): void
  onInput( this: ComponentSelf<MT> ): void
  onMount( this: ComponentSelf<MT> ): void
  onRender( this: ComponentSelf<MT> ): void
  onUpdate( this: ComponentSelf<MT> ): void
  onAttach( this: ComponentSelf<MT> ): void
  onDetach( this: ComponentSelf<MT> ): void
  onContext( this: ComponentSelf<MT> ): void
  onError( this: ComponentSelf<MT>, error: Error ): void
  onDestroy( this: ComponentSelf<MT> ): void
}

export type Handler<MT extends Metavars> = Partial<LifecycleEvents<MT>> & {
  /** Any other key is a method bound to the component self */
  [ K in string as K extends keyof LifecycleEvents<MT> ? never : K ]?:
    ( this: ComponentSelf<MT>, ...args: any[] ) => any
}

export type Template<MT extends Metavars = Metavars> = {
  /** Template source — the component's markup */
  default?: string
  /** Precompiled template IR — used instead of `default` (see `precompile`) */
  ir?: TemplateIR
  state?: MT['State']
  /**
   * Variables that never re-render — read and written as `this.static` in
   * a handler, read as `static.x` in a template, which subscribes to none
   * of them. Each instance has its own copy, as it has of `state`: what
   * the template declares is where each starts. `_static` is the same
   * field: a NAMED MODULE EXPORT cannot
   * be called `static` (it is reserved in strict mode, and ES modules
   * are always strict), so the underscore exists for that form only.
   * Object literals should use `static`.
   */
  static?: MT['Static']
  _static?: MT['Static']
  /**
   * Context fields whose change fires this component's `onContext`.
   *
   * It does NOT declare what the component reads: bindings that read
   * `context.x` are tracked individually and update whether or not `x`
   * is listed here. The old spelling for this was `context`, which read
   * as "the context this component uses" and misled accordingly.
   */
  watchContext?: string[]
  /** @deprecated Renamed to `watchContext` — same meaning (RFC-005 §4.3) */
  context?: string[]
  /** `<macro [argv] name="X">…</macro>` definitions, inlined at compile time */
  macros?: string
  handler?: Handler<MT>
  /** Scoped CSS — declaration values may be `{expr}` (RFC-004) */
  stylesheet?: string
  /** Precompiled StyleIR — used instead of `stylesheet` (see `precompile`) */
  style?: StyleIR
}

/**
 * What `lips.use()` installs: a library of components (`@lipsjs/lips/parts`
 * is one), what it needs installed before it, and its own setup.
 */
export interface Plugin<Options = unknown> {
  /** Installed once per Lips, however many times it is used or required */
  readonly name: string
  /** Installed before it, each once */
  readonly requires?: readonly Plugin<any>[]
  /** Registered by name; a name something else holds is refused */
  readonly components?: Readonly<Record<string, Template<any>>>
  /** Anything else it sets up, with what `use()` was given */
  install?( lips: IRLips<any>, options?: Options ): void
}

export type LipsConfig<Context extends Object = {}> = {
  debug?: boolean
  context?: Context
  /** Reserved for engine selection; the IR engine is the only one shipped */
  engine?: string
  /**
   * Initial i18n language, e.g. 'fr-FR'. Defaults to `navigator.language`,
   * falling back to 'en-US' where there is no navigator (SSR, workers).
   * Set it when the language comes from the app — a user preference, a
   * URL segment, a server-rendered locale — rather than from the browser.
   * Change it later with `lips.setLanguage()`.
   */
  lang?: string
  /**
   * Emit component sheets inside `@layer <name>` (RFC-004 §9). Absent by
   * default, and absent output is byte-identical to no layer at all —
   * only utility-framework users (Tailwind) need this, because unlayered
   * styles beat layered ones regardless of specificity.
   */
  styleLayer?: string
  /**
   * CSS preprocessor for component stylesheets. Absent, the sheet ships
   * nested and the browser's own CSS nesting resolves the scope wrap —
   * Chrome/Edge 112+, Safari 16.5+, Firefox 117+ — 1.9 KB gzipped
   * lighter. Older engines drop a nested sheet whole.
   *
   *   import { stylisPreprocessor } from '@lipsjs/lips/stylis'
   *   new Lips({ stylePreprocessor: stylisPreprocessor })
   *
   * Wire it to flatten for pre-nesting engines, or pass a preprocessor
   * of your own: it receives the scoped sheet, comments kept, with the
   * at-rules that cannot nest already hoisted. `@import`, `@charset` and
   * `@namespace` are placed ahead of its output as written. It is passed
   * here rather than imported for its side effect because the two
   * entries are separate bundles with separate module state.
   */
  stylePreprocessor?: ( css: string ) => string
  /**
   * The MessageFormat 2 engine dictionaries are formatted with. The full
   * build wires it in; the precompiled `./runtime` entry ships without it
   * (~7.2 KB gzipped), so an app that translates passes it:
   *
   *   import { messageFormat } from '@lipsjs/lips/i18n'
   *   new Lips({ messageFormat })
   *
   * Without one, registering a dictionary is refused rather than read
   * some other way. Passed by value for the same reason as
   * `stylePreprocessor`: the entries are separate bundles.
   */
  messageFormat?: MessageFormatEngine
  /**
   * Expression execution, for templates you trust:
   *  - 'compiled' (default) — one cached Function per expression
   *  - 'interpreted' — an AST walker that never builds a Function, for a
   *    CSP without `unsafe-eval`. CSP-safe, NOT a sandbox: a template run
   *    this way can still reach anything it can name a path to.
   */
  mode?: 'compiled' | 'interpreted'
  /**
   * Every template this instance renders is one you did not write
   * (RFC-007). It reaches only the data and functions it is handed, the
   * globals the policy offers, and its own subtree through the template
   * language; refusals are diagnostics.
   *
   *   import { untrusted, untrustedPolicy } from '@lipsjs/lips/untrusted'
   *   new Lips({ untrusted: untrusted() })
   *   new Lips({ untrusted: untrusted({ ...untrustedPolicy, url: sameOriginOnly }) })
   *
   * Passed by value, like `messageFormat`: an app that never renders an
   * untrusted template ships none of it. Runs interpreted — `mode:
   * 'compiled'` is refused. On `./runtime` templates must be precompiled;
   * their skeletons are checked when first used.
   */
  untrusted?: Untrusted
}

export type EventListener = ( ...args: any[] ) => void

// -------------------------------------------------------------- i18n types
/**
 * A Unicode MessageFormat 2 message: its source, or its data model as JSON
 * (what `parseMessage` makes of it, and what a server that parsed it once
 * serves).
 */
export type Message = string | Model.Message
/** `messageformat`'s formatter and the functions a message may call — what `@lipsjs/lips/i18n` exports as `messageFormat`. */
export type MessageFormatEngine = {
  MessageFormat: typeof MessageFormat
  functions: Record<string, MessageFunction<any, any>>
}
/** One language's messages, by stable key or by source text. */
export type Dictionary = Record<string, Message>
