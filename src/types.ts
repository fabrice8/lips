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
import type { TemplateIR } from './ir/compiler'
import type { StyleIR } from './ir/style'

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
   * Constants — read as `this.static` in a handler and `static.x` in a
   * template. `_static` is the same field: a NAMED MODULE EXPORT cannot
   * be called `static` (it is reserved in strict mode, and ES modules
   * are always strict), so the underscore exists for that form only.
   * Object literals should use `static`.
   */
  static?: MT['Static']
  _static?: MT['Static']
  /**
   * Context fields this component subscribes to. NB: this drives
   * `onContext` ONLY — bindings that read `context.x` update whether or
   * not `x` is listed here (RFC-005 §6).
   */
  context?: string[]
  /** `<macro [argv] name="X">…</macro>` definitions, inlined at compile time */
  macros?: string
  handler?: Handler<MT>
  /** Scoped CSS — declaration values may be `{expr}` (RFC-004) */
  stylesheet?: string
  /** Precompiled StyleIR — used instead of `stylesheet` (see `precompile`) */
  style?: StyleIR
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
   * Expression execution:
   *  - 'compiled' (default) — one cached Function per expression
   *  - 'interpreted' — sandboxed AST walker, required under a CSP
   *    without `unsafe-eval`
   */
  mode?: 'compiled' | 'interpreted'
}

export type EventListener = ( ...args: any[] ) => void

// -------------------------------------------------------------- i18n types
export type I18nVariant = Record<string, string>
export type I18nFormat = {
  type: string
  value: string | I18nVariant | Record<string, string | I18nVariant>
}
export type Dictionary = Record<string, string | I18nFormat | I18nVariant>
