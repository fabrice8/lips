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
  _static?: MT['Static']
  /** Context fields this component subscribes to (drives onContext) */
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
