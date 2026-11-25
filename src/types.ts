/**
 * Public types.
 *
 * A component is a plain object — the same one the framework has always
 * taken, and the serializable artifact a generator can emit:
 *
 *   { name, default, state, static, handler, watchContext, macros, stylesheet }
 *
 * `component()` writes one with its types inferred: `state` and `static`
 * from their values, the handlers from themselves, `this` in each of them
 * from all three. What no value can show, the `input` a parent hands it,
 * it is told by name:
 *
 *   const counter = component<{ input: { initial?: number } }>()({
 *     state: { count: 0 },
 *     handler: {
 *       onInput(){ this.state.count = this.input.initial ?? 0 },
 *       step( by: number ){ this.state.count += by }
 *     },
 *     default: `<button on-click(step, 1)>{state.count}</button>`
 *   })
 *
 *   lips.render('counter', counter, { initial: 2 }).state.count   // number
 *
 * The context is the app's, so it is typed once for every component, by
 * augmenting `SharedContext`. What the template strings read is not
 * checked: their expressions are not TypeScript.
 */
import type { MessageFormat, Model } from 'messageformat'
import type { MessageFunction } from 'messageformat/functions'
import type { TemplateIR } from './ir/compiler'
import type { StyleIR } from './ir/style'
import type { Untrusted } from './ir/policy'
import type { IRLips, RESERVED } from './ir/facade'

// ------------------------------------------------------------------ shape
/**
 * What every component of an app reads as `context`. Empty here, so an
 * app types it once, for every component and for `new Lips()`:
 *
 *   declare module '@lipsjs/lips' {
 *     interface SharedContext { theme: 'dark' | 'light' }
 *   }
 *
 * Left empty, `context` reads as `Record<string, any>`.
 */
export interface SharedContext {}

type Shared = keyof SharedContext extends never ? Record<string, any> : SharedContext

/** The parts a component names; any it leaves out */
export type Parts = {
  input?: object
  state?: object
  static?: object
  context?: object
}
/** A part `P` names, or `Else` */
type Part<P, K extends keyof Parts, Else> = P extends { [ k in K ]: infer X extends object } ? X : Else

/**
 * The four typed parts of a component, by name: what a parent hands it
 * (`input`), what it changes (`state`), what never re-renders (`static`)
 * and what the app shares (`context`).
 *
 *   Shape<{ input: { tone: string }, state: { count: number } }>
 *
 * A part it names is exact, a part it leaves out is empty, and `context`
 * is the app's `SharedContext` unless named. Bare, `Shape` reads every
 * part as `any`: the shape of a component nothing typed, and one every
 * typed component is assignable to.
 */
export type Shape<P extends Parts = { input: any, state: any, static: any, context: any }> = {
  input   : Part<P, 'input', {}>
  state   : Part<P, 'state', {}>
  static  : Part<P, 'static', {}>
  context : Part<P, 'context', Shared>
}

// ------------------------------------------------------------------- self
/** The lifecycle, in the order it runs (`onError` and `onContext` when they occur) */
export interface Hooks {
  onCreate(): void
  onInput(): void
  onMount(): void
  onRender(): void
  onUpdate(): void
  onAttach(): void
  onDetach(): void
  onContext(): void
  onError( error: Error ): void
  onDestroy(): void
}
export type HookName = keyof Hooks

/** Names a handler cannot take: the component's own members */
export type ReservedName = typeof RESERVED[ number ]

/** The component's own members, in `this` beside its handlers */
export interface Members<S extends Shape = Shape> {
  state   : S['state']
  input   : S['input']
  context : S['context']
  static  : S['static']

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
  on( event: string, fn: ( ...args: any[] ) => void ): this
  once( event: string, fn: ( ...args: any[] ) => void ): this
  off( event: string, fn?: ( ...args: any[] ) => void ): this
  setContext( arg: string | Record<string, any>, value?: any ): void
}

/**
 * `this` in a handler: the component's members and its other handlers.
 * `Methods` are the handlers `component()` saw, so a sibling it does not
 * have is an error; left out, any name reads as `any`.
 */
export type Self<S extends Shape = Shape, Methods = Record<string, any>> = Members<S> & Methods

/**
 * A component's `handler` object, typed by hand: for a component written
 * as module exports (`export const handler: Handlers<S> = { … }`), which
 * `component()` cannot see whole. Its `this` reads siblings as `any`.
 */
export type Handlers<S extends Shape = Shape> = {
  [ K in HookName ]?: ( this: Self<S>, ...args: Parameters<Hooks[ K ]> ) => void
} & {
  /** Any other key is a method bound to the component */
  [ K in string as K extends HookName | ReservedName ? never : K ]?:
    ( this: Self<S>, ...args: any[] ) => any
}

// -------------------------------------------------------------- component
/** What `register`, `render`, `root` and a route take */
export type Component<S extends Shape = Shape> = {
  /**
   * The scope of a component placed by value — a route page, or
   * `<{state.view}/>` — that no `register()` names: its stylesheet's
   * `rel`. Left out, each such object gets one of its own.
   */
  name?: string
  /** Template source — the component's markup */
  default?: string
  /**
   * Template source for Lynx, where the markup differs by host: a part
   * that renders Lynx's own `list` on Lynx and windowed rows on the web.
   * `lynxComponents()` (`./lynx`) compiles it in place of `default`. Left
   * out, `default` serves both hosts, as it should wherever it can.
   */
  lynx?: string
  /** Precompiled template IR — used instead of `default` (see `precompile`) */
  ir?: TemplateIR
  state?: S['state']
  /**
   * Variables that never re-render — read and written as `this.static` in
   * a handler, read as `static.x` in a template, which subscribes to none
   * of them. Each instance has its own copy, as it has of `state`: what
   * the component declares is where each starts. `_static` is the same
   * field: a NAMED MODULE EXPORT cannot be called `static` (it is reserved
   * in strict mode, and ES modules are always strict), so the underscore
   * exists for that form only. Object literals use `static`.
   */
  static?: S['static']
  _static?: S['static']
  /**
   * Context fields whose change fires this component's `onContext`.
   *
   * It does NOT declare what the component reads: bindings that read
   * `context.x` are tracked individually and update whether or not `x`
   * is listed here.
   */
  watchContext?: string[]
  /** `<macro [argv] name="X">…</macro>` definitions, inlined at compile time */
  macros?: string
  handler?: Handlers<S>
  /** Scoped CSS — declaration values may be `{expr}` (RFC-004) */
  stylesheet?: string
  /** Precompiled StyleIR — used instead of `stylesheet` (see `precompile`) */
  style?: StyleIR
}

/** Marks a component that carries its shape; type-only, never set */
declare const SHAPE: unique symbol

/**
 * A component whose shape is known, so `render()` reads it back: what
 * `component()` and `precompile()` return.
 */
export type TypedComponent<S extends Shape = Shape> = Component<S> & { readonly [ SHAPE ]: S }

/**
 * A component being written, its state, static and handlers inferred:
 * what `component()` takes, and what `register`, `render` and `root` take
 * written in the call. Each handler's `this` is the component's members
 * and every handler beside it. A `TypedComponent` is not one: its shape is
 * already known.
 */
export type Definition<S extends Shape, Methods> = Omit<Component<S>, 'handler'> & {
  readonly [ SHAPE ]?: never
  handler?: Methods
            & Partial<Hooks>
            & { [ K in ReservedName ]?: never }
            & ThisType<Self<S, Methods>>
}

/**
 * The shape a `Definition` gives: what `P` names, else what was inferred.
 * Written in a `register`, `render` or `root` call, nothing names `input`,
 * so it reads as `Record<string, any>` there (or as what `render()` is
 * handed).
 */
export type Inferred<P extends Parts, State, Static> = {
  input   : Part<P, 'input', {}>
  state   : Part<P, 'state', State>
  static  : Part<P, 'static', Static>
  context : Part<P, 'context', Shared>
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
  readonly components?: Readonly<Record<string, Component<any>>>
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
   * Plugins' components as a build compiled them (`precompilePlugins()`
   * from `@lipsjs/lips/precompile`), by name: `use()` registers each
   * component of a plugin with the IR made for its name, so a plugin's
   * source templates run on `./runtime`, which has no compiler (RFC-008
   * §4). A component with none here is registered as it is.
   */
  precompiled?: Readonly<Record<string, { ir: TemplateIR, style?: StyleIR }>>
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
