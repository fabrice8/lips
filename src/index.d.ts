import type Lips from '.'
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

export type LanguageDictionary = Record<string, Record<string, string> | string>

export type DeclarationTagType = 'nexted' | 'child'
export type DeclarationTag = {
  type: DeclarationTagType
  many?: boolean
}
export type Declaration = {
  name: string
  syntax?: boolean
  iterator?: boolean
  contents?: boolean
  tags?: Record<string, DeclarationTag>
}

export interface Handler<MT extends Metavars> {
  onCreate?: ( this: Component<MT> ) => void
  onInput?: ( this: Component<MT>, input: MT['Input'] ) => void
  onMount?: ( this: Component<MT> ) => void
  onRender?: ( this: Component<MT> ) => void
  onUpdate?: ( this: Component<MT> ) => void
  onAttach?: ( this: Component<MT> ) => void
  onDetach?: ( this: Component<MT> ) => void
  onContext?: ( this: Component<MT> ) => void

  [method: string]: ( this: Component<MT>, ...args: any[] ) => void
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
export type ComponentOptions = {
  lips: Lips
  debug?: boolean
  prepath?: string
  enableTemplateCache?: boolean
  enableSmartDiff?: boolean
}
export type LipsConfig = {
  context?: any
  debug?: boolean
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
  literals: Record<string, any>,
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
export interface FGUSync {
  // $fragment?: Cash
  memo?: VariableSet
  cleanup?: () => void
}
export interface FGUDependency {
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
  mesh( argvalues?: VariableSet ): Cash
  update( deps: string[], argvalues: VariableSet, boundaries?: FragmentBoundaries ): Cash
}
export type MeshTemplate = Record<string, any> & {
  renderer: MeshRenderer
}
export interface MeshWireSetup {
  argv: string[] = []
  scope: VariableSet = {}
  declaration?: Declaration
  useAttributes: boolean
  xmlns?: boolean
  
  $node: Cash
  meshPath: string | null
  
  fragmentPath: string
  fragmentBoundaries: FragmentBoundaries
}