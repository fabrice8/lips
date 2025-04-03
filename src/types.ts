import type { Cash } from 'cash-dom'
import type Lips from './lips'
import type Component from './component'

export interface Metavars<Input extends Object = {}, State extends Object = {}, Static extends Object = {}, Context extends Object = {}> {
  Input: Input
  State: State
  Static: Static
  Context: Context
}
export interface InteractiveMetavars<MT extends Metavars = Metavars> {
  input: MT['Input']
  state: MT['State']
  context: MT['Context']
}
export type Variable = {
  value: any
  type: 'let' | 'const' | 'arg'
}
export type VariableSet = Record<string, Variable>

export type I18nVariant = Record<string, string>
export type I18nFormat = {
  type: string
  value: string | I18nVariant | Record<string, string | I18nVariant>
}
export type Dictionary = Record<string, string | I18nFormat | I18nVariant>

export type DeclarationTagType = 'nexted' | 'child'
export type DeclarationTag = {
  type: DeclarationTagType
  many?: boolean
  optional?: boolean
}
export type Declaration = {
  name: string
  syntax?: boolean
  iterator?: boolean
  contents?: boolean
  tags?: Record<string, DeclarationTag>
}

export type LifeCycleEventTypes = 'onCreate'
                                  | 'onInput'
                                  | 'onMount'
                                  | 'onRender'
                                  | 'onUpdate'
                                  | 'onAttach'
                                  | 'onDetach'
                                  | 'onContext'
                                  | 'onDestroy'
export interface LifecycleEvents<MT extends Metavars> {
  onCreate: ( this: Component<MT> ) => void
  onInput: ( this: Component<MT>, input: MT['Input'] ) => void
  onMount: ( this: Component<MT> ) => void
  onRender: ( this: Component<MT> ) => void
  onUpdate: ( this: Component<MT> ) => void
  onAttach: ( this: Component<MT> ) => void
  onDetach: ( this: Component<MT> ) => void
  onContext: ( this: Component<MT> ) => void
  onDestroy: ( this: Component<MT> ) => void
}
export type Handler<MT extends Metavars> = Partial<LifecycleEvents<MT>> & {
  /**
   * This mapped type creates a type for all string 
   * keys EXCEPT those that are lifecycle event names
   */
  [ K in string as K extends keyof LifecycleEvents<MT> ? never : K]?: (this: Component<MT>, ...args: any[]) => void;
}
export type Template<MT extends Metavars> = {
  default?: string
  state?: MT['State']
  _static?: MT['Static']
  context?: string[]
  macros?: string
  handler?: Handler<MT>
  stylesheet?: string
  declaration?: Declaration
}
export type DynamicTemplate<MT extends Metavars> = {
  name?: string,
  template?: Template<MT>
}
export type ComponentScope<MT extends Metavars> = {
  input?: MT['Input']
  state?: MT['State']
  context?: MT['Context']
  _static?: MT['Static']
  macros?: string
  handler?: Handler<MT>
  stylesheet?: string
  declaration?: Declaration
}
export type ComponentOptions<Context extends Object> = {
  lips: Lips<Context>
  debug?: boolean
  prepath?: string
}
export type LipsConfig<Context extends Object> = {
  debug?: boolean
  context?: Context
  stylesheets?: string[]
}
export type StyleSettings = {
  sheet?: string
  meta?: boolean
  custom?: {
    enabled: boolean
    allowedRules: string[]
    allowedProperties: string[]
  }
}
export type EventListener = ( ...args: any[] ) => void

export type Macro = {
  argv: string[]
  $node: Cash
}

export type SyntaxAttributes = {
  literals: Record<string, any>
  functions: Record<string, any>
  expressions: Record<string, any>
}

export type VirtualEvent = {
  $fragment: Cash
  _event: string
  instruction: string
  scope?: Record<string, any>
}
export type VirtualEventsRegistry<T> = {
  element: Cash | T
  _event: string
}

/**
 * (FGU) Fine-Grain Update Dependencies
 */
export type NodeType = 'component'
                        | 'dynamic'
                        | 'element'
                        | 'macro'
                        | 'text'
                        | 'let'
                        | 'log'
export type FGUDTarget = 'spread-attr'
                          | 'meta-attr'
                          | 'argument'
                          | 'value'
                          | 'attr'
                          | 'dtag'
export interface FGUSync {
  memo?: VariableSet
  cleanup?: () => void
}
export interface I18nDependency {
  nodetype: NodeType
  target: FGUDTarget
  path: string
  $fragment: Cash
  memo: VariableSet
  update: ( memo: VariableSet, by?: string ) => FGUSync | void
}
export interface FGUDependency {
  nodetype: NodeType
  target: FGUDTarget
  path: string
  $fragment: Cash | null
  boundaries?: FragmentBoundaries
  haslet?: boolean
  batch?: boolean
  syntax?: boolean
  partial?: string[]
  memo: VariableSet
  update: ( memo: VariableSet, by?: string ) => FGUSync | void
}
export type FGUDependencies = Map<string, Map<string, FGUDependency>>
export type FGUDBatchEntry = {
  dep: string
  dependent: FGUDependency
}

export type RenderedNode = {
  $log: Cash
  dependencies: FGUDependencies
  events?: VirtualEvent[]
}
export type FragmentBoundaries = {
  start: Comment
  end: Comment
}

export interface MeshRenderer {
  path: string | null
  argv: string[]
  mesh( argvalues?: VariableSet ): Cash | null
  update( deps: string[], argvalues: VariableSet, boundaries?: FragmentBoundaries ): void
}
export type MeshTemplate = Record<string, any> & {
  renderer: MeshRenderer
}
export interface MeshWireSetup {
  argv: string[]
  scope: VariableSet
  declaration?: Declaration
  useAttributes: boolean
  xmlns?: boolean
  
  $node: Cash
  meshPath: string | null
  
  fragmentPath: string
  fragmentBoundaries: FragmentBoundaries
}