/**
 * Public types.
 *
 * Component authoring shape — the same plain object the framework has
 * always taken, and the serializable artifact a generator can emit:
 *
 *   { default, state, handler, _static, context, macros, stylesheet }
 */

export interface Metavars<
  Input extends Object = {},
  State extends Object = {},
  Static extends Object = {},
  Context extends Object = {}
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

  emit( event: string, ...args: any[] ): void
  on( event: string, fn: ( ...args: any[] ) => void ): ComponentSelf<MT>
  off( event: string ): ComponentSelf<MT>
  setContext( arg: string | Record<string, any>, value?: any ): void

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
  state?: MT['State']
  _static?: MT['Static']
  /** Context fields this component subscribes to (drives onContext) */
  context?: string[]
  /** `<macro [argv] name="X">…</macro>` definitions, inlined at compile time */
  macros?: string
  handler?: Handler<MT>
  stylesheet?: string
}

export type LipsConfig<Context extends Object = {}> = {
  debug?: boolean
  context?: Context
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
