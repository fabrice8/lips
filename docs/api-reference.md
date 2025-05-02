
## API Reference

This section provides a comprehensive reference for Lips' classes, interfaces, and methods. Use this as a detailed guide when developing with Lips.

### Classes

#### Lips

The main framework class that initializes and manages the application.

```typescript
class Lips<Context = any> {
  constructor(config?: LipsConfig);
  
  // Component Registration
  register<MT extends Metavars>(name: string, template: Template<MT>): Lips;
  unregister(name: string): Lips;
  has(name: string): boolean;
  import<MT extends Metavars>(pathname: string): Template<MT>;
  
  // Rendering
  render<MT extends Metavars>(name: string, template: Template<MT>, input?: MT['Input']): Component<MT>;
  root<MT extends Metavars>(template: Template<MT>, selector: string): Component<MT>;
  
  // Context Management
  setContext(arg: Context | string, value?: any): void;
  getContext(): Context;
  // For component to subscribe to context updates
  useContext<P extends Context>(fields: (keyof Context)[], fn: (context: P) => void): void;

  
  // Internationalization
  setLanguage(lang: string): void;
  getLanguage(): string;
  // For component to subscribe to i18n global updates
  useTranslator( support: string | string[], fn: ( lang: string ) => void ): void;
  
  // Properties
  debug: boolean;
  stylesheets: Stylesheet[];
  i18n: I18N;
  watcher: DWS<any>;
  IUC: IUC;
  
  // Cleanup
  dispose(): void;
}
```

#### Component

The core component class that manages the lifecycle and rendering of UI elements.

```typescript
class Component<MT extends Metavars> {
  constructor(name: string, template: string, scope: ComponentScope<MT>, options: ComponentOptions);
  
  // Properties
  input: MT['Input'];
  state: MT['State'] & { toJSON(): MT['State'], reset(): void };
  static: MT['Static'];
  context: MT['Context'];
  
  // DOM getter Methods
  node: Cash;
  boundaries: FragmentBoundaries;

  // DOM operation methods
  find(selector: string): Cash;
  appendTo(arg: Cash | string): Component<MT>;
  prependTo(arg: Cash | string): Component<MT>;
  replaceWith(arg: Cash | string): Component<MT>;
  
  // State Management
  setInput(input: MT['Input']): void;
  subInput(data: Record<string, any>): Component<MT>;
  setContext(arg: Context | string, value?: any): void;
  
  // Component Configuration
  setHandler(list: Handler<MT>): void;
  setStylesheet(sheet?: string): void;
  setMacros(template: string): void;
  
  // Rendering
  render(inpath: string, $nodes?: Cash, scope?: VariableSet, sharedDeps?: FGUDependencies, xmlns?: boolean): RenderedNode;
  
  // Event Handling
  on(event: string, fn: EventListener): Component<MT>;
  once(event: string, fn: EventListener): Component<MT>;
  off(event: string): Component<MT>;
  emit(event: string, ...params: any[]): void;
  
  // Cleanup
  destroy(): void;
}
```

#### I18N

Handles internationalization for multilingual applications.

```typescript
class I18N {
  get lang(): string;
  set lang(lang: string): void;
  setDictionary(id: string, dico: LanguageDictionary): void;
  translate(text: string, lang?: string): { text: string, lang: string };
  format(text: string, params: Record<string, any>, lang?: string): string;
}
```

#### Benchmark

Tracks performance metrics for component rendering.

```typescript
class Benchmark {
  constructor(debug?: boolean);
  
  // Properties
  stats: BenchmarkMetrics;
  
  // Methods
  startRender(): void;
  endRender(): void;
  inc(metric: keyof BenchmarkMetrics): void;
  dec(metric: keyof BenchmarkMetrics): void;
  record(metric: keyof BenchmarkMetrics, value: number): void;
  add(metric: keyof BenchmarkMetrics, value: number): void;
  reset(): BenchmarkMetrics;
  log(): void;
  trackMemory(): void;
  trackBatch(size: number): void;
  trackError(error: Error): void;
  setLoggingInterval(interval: number): void;
  getSnapshot(): BenchmarkMetrics;
  dispose(): void;
}
```

#### Stylesheet

Manages component styles and their scoping.

```typescript
class Stylesheet {
  constructor(nsp: string, settings?: StyleSettings);
  
  // Methods
  compile(str: string): string;
  load(settings: StyleSettings): Promise<void>;
  get(): any;
  clear(): Promise<void>;
  custom(): Promise<Record<string, string>>;
  style(): Promise<Record<string, string>>;
}
```

### Interfaces

#### LipsConfig

Configuration options for initializing Lips.

```typescript
interface LipsConfig<Context> {
  debug?: boolean;
  context?: Context;
  stylesheets?: string[];
}
```

#### ComponentOptions

Options for component initialization.

```typescript
interface ComponentOptions {
  lips: Lips;
  debug?: boolean;
  prepath?: string;
  boundaries?: FragmentBoundaries
  enableTemplateCache?: boolean;
}
```

#### Metavars

Generic interface for component's meta variables.

```typescript
interface Metavars<Input extends Object = {}, State extends Object = {}, Static extends Object = {}, Context extends Object = {}> {
  Input: Input;
  State: State;
  Static: Static;
  Context: Context;
}
```

#### Handler

Interface for component lifecycle and event handlers.

```typescript
interface Handler<MT extends Metavars> {
  onCreate?: (this: Component<MT>) => void;
  onInput?: (this: Component<MT>, memo: VariableSet) => void;
  onMount?: (this: Component<MT>) => void;
  onRender?: (this: Component<MT>) => void;
  onUpdate?: (this: Component<MT>) => void;
  onAttach?: (this: Component<MT>) => void;
  onDetach?: (this: Component<MT>) => void;
  onContext?: (this: Component<MT>) => void;
  
  [method: string]: (this: Component<MT>, ...args: any[]) => void;
}
```

#### Template

Interface for component templates.

```typescript
interface Template<MT extends Metavars> {
  default?: string;
  state?: MT['State'];
  _static?: MT['Static'];
  context?: string[];
  macros?: string;
  handler?: Handler<MT>;
  stylesheet?: string;
  declaration?: Declaration;
}
```

#### BenchmarkMetrics

Performance metrics collected by the Benchmark class.

```typescript
interface BenchmarkMetrics {
  // Rendering metrics
  renderCount: number;
  elementCount: number;
  renderTime: number;
  avgRenderTime: number;
  maxRenderTime: number;

  // Component metrics
  componentCount: number;
  componentUpdateCount: number;
  
  // Partial metrics
  partialCount: number;
  partialUpdateCount: number;
  
  // Memory metrics
  memoryUsage?: number;
  
  // DOM operations
  domOperations: number;
  domInsertsCount: number;
  domUpdatesCount: number;
  domRemovalsCount: number;
  
  // Dependency tracking
  dependencyTrackCount: number;
  dependencyUpdateCount: number;
  
  // Batch update metrics
  batchSize: number;
  batchCount: number;
  
  // Error tracking
  errorCount: number;
}
```

### TypeScript Support

Lips includes comprehensive TypeScript definitions that provide type checking and IDE assistance.

#### Using TypeScript with Lips

Define your component types for better type safety:

```typescript
// Define types for your component
interface UserState {
  name: string;
  email: string;
  isActive: boolean;
}

interface UserInput {
  userId: number;
  showDetails: boolean;
}

interface UserContext {
  permissions: string[];
}

interface UserStatic {
  roles: string[];
}

// Import Metavars type from Lips
import { Metavars } from '@lipsjs/lips';

// Create a typed component
type UserComponent = Metavars<UserInput, UserState, UserStatic, UserContext>;

// ES Module style with types
export const state: UserState = {
  name: '',
  email: '',
  isActive: false
};

export const handler = {
  async onInput(input: UserInput) {
    if (input.userId) {
      await this.loadUser(input.userId);
    }
  },
  
  async loadUser(id: number): Promise<void> {
    // TypeScript knows `this.state` has the UserState type
    this.state.name = 'John Doe';
    this.state.email = 'john@example.com';
    this.state.isActive = true;
  }
};

export default `
  <div class="user-profile">
    <h2>{state.name}</h2>
    <p>{state.email}</p>
    <span class=(state.isActive ? 'active' : 'inactive')>
      {state.isActive ? 'Active' : 'Inactive'}
    </span>
    
    <if(input.showDetails)>
      <div class="details">
        <!-- Details content -->
      </div>
    </if>
  </div>
`;
```

By following this guide, developers can leverage the power of Lips to build efficient, reactive web applications with minimal overhead.