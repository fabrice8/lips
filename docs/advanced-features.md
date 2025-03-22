## Advanced Features

### Context API

The Context API provides a way to share data across components without passing props. It's particularly useful for global application state, user information, themes, and other data that many components need to access.

#### Creating and Providing Context

```javascript
// Initialize Lips with context
const lips = new Lips({
  context: {
    theme: 'light',
    user: { id: 1, name: 'Guest' },
    language: 'en',
    permissions: ['read']
  }
});
```

#### Consuming Context in Components

Components must declare which context properties they want to observe:

```javascript
// Object style component
const component = {
  // Declare context dependencies
  context: ['theme', 'user', 'language'],
  
  default: `
    <div class="app theme-{context.theme}">
      <p>Welcome, {context.user.name}</p>
      <p>Language: {context.language}</p>
    </div>
  `,
  
  handler: {
    onContext() {
      // Called when any observed context property changes
      console.log('Context changed:', this.context);
      this.updateTranslations(this.context.language);
    }
  }
};

// ES Module style
export const context = ['theme', 'user', 'language'];

export const handler = {
  onContext() {
    console.log('Context changed:', this.context);
    this.updateTranslations(this.context.language);
  }
};
```

#### Updating Context

Context can be updated from anywhere:

```javascript
// Update a single context property
lips.setContext('theme', 'dark');

// Update multiple properties at once
lips.setContext({
  user: { id: 2, name: 'John' },
  language: 'fr'
});

// Update from within a component
this.setContext('theme', 'dark');
```

#### Context Reactivity

When context properties change, components that observe those properties will automatically update. Lips optimizes this process to only update the components that actually depend on the changed values.

### Macros

Macros allow you to define reusable template snippets with parameters. They're similar to components but are expanded inline during rendering, making them lightweight and efficient.

#### Defining Macros

```javascript
const component = {
  macros: `
    <macro [icon, text, onClick] name="button">
      <button class="custom-button" on-click(onClick)>
        <i class="icon-{icon}"></i>
        <span>{text}</span>
      </button>
    </macro>
    
    <macro [label, value, isRequired] name="form-field">
      <div class="form-field">
        <label>{label} {isRequired ? '*' : ''}</label>
        <input value=value required=isRequired />
      </div>
    </macro>
  `,
  
  default: `
    <div>
      <button icon="save" text="Save Changes" onClick(handleSave) />
      <button icon="cancel" text="Cancel" onClick(handleCancel) />
      
      <form-field label="Name" value=state.name isRequired />
      <form-field label="Email" value=state.email isRequired />
      <form-field label="Phone" value=state.phone !isRequired />
    </div>
  `
};
```

#### Macro Parameters

Macros can accept parameters using the square bracket syntax:

```html
<macro [name, age, ...rest] name="person-info">
  <div class="person">
    <h2>{name}, {age}</h2>
    <if(rest.bio)>
      <p>{rest.bio}</p>
    </if>
    <if(rest.address)>
      <address>{rest.address}</address>
    </if>
  </div>
</macro>
```

The `...rest` parameter captures all additional properties passed to the macro.

#### Using Macros

Macros are used like custom elements:

```html
<person-info
    name="John Doe" 
    age=42
    bio="Software developer"
    address="123 Main St"/>
```

### Reactive Updates

Lips uses a fine-grained reactivity system that tracks dependencies and updates only what has changed. This section explores how that system works in more detail.

#### Fine-Grained Updates (FGU)

Rather than using a Virtual DOM, Lips tracks dependencies between state properties and DOM elements. When a state property changes, only the DOM elements that depend on that property are updated.

```javascript
const todoList = {
  state: {
    todos: [
      { id: 1, text: 'Learn Lips', completed: false },
      { id: 2, text: 'Build an app', completed: false }
    ],
    filter: 'all'
  },
  
  default: `
    <div>
      <!-- Filter buttons -->
      <div class="filters">
        <button class=(state.filter === 'all' ? 'active' : '') on-click(() => state.filter = 'all')>All</button>
        <button class=(state.filter === 'active' ? 'active' : '') on-click(() => state.filter = 'active')>Active</button>
        <button class=(state.filter === 'completed' ? 'active' : '') on-click(() => state.filter = 'completed')>Completed</button>
      </div>
      
      <!-- Todo list -->
      <ul>
        <for [todo] in=self.getFilteredTodos()>
          <li class=(todo.completed && 'completed')>
            <input type="checkbox" checked=todo.completed on-change(() => self.toggleTodo(todo.id)) />
            <span>{todo.text}</span>
          </li>
        </for>
      </ul>
    </div>
  `,
  
  handler: {
    getFilteredTodos() {
      if (this.state.filter === 'active') {
        return this.state.todos.filter(todo => !todo.completed);
      }
      if (this.state.filter === 'completed') {
        return this.state.todos.filter(todo => todo.completed);
      }
      return this.state.todos;
    },
    
    toggleTodo(id) {
      const todo = this.state.todos.find(t => t.id === id);
      if (todo) {
        todo.completed = !todo.completed;
      }
    }
  }
};
```

In this example:
- When `state.filter` changes, only the filter buttons and the todo list are updated
- When a todo's `completed` status changes, only that specific todo item is updated
- Other parts of the DOM remain untouched

#### Batch Updates

Lips automatically batches updates to minimize DOM operations:

```javascript
this.state.count++;
this.state.message = 'Updated';
this.state.lastUpdated = new Date();
```

Instead of updating the DOM three times, Lips batches these changes and applies them in a single update cycle.

#### Deep Reactivity

Lips provides deep reactivity for objects and arrays:

```javascript
// All of these modifications are detected and trigger updates
this.state.user.address.street = '123 Main St';
this.state.items[0].name = 'Updated Item';
this.state.todos.push({ id: 3, text: 'New Todo', completed: false });
this.state.tags.delete('old-tag');
this.state.counts.set('visits', this.state.counts.get('visits') + 1);
```

### Performance Optimization

Lips provides several features to help optimize performance in your applications.

#### Memoization

For expensive computations, you can use memoization to avoid unnecessary recalculations:

```javascript
import { memo } from '@lipsjs/lips';

const component = {
  handler: {
    onCreate() {
      // Create a memoized calculation
      const [getFilteredItems, dispose] = memo(() => {
        return this.state.items.filter(item => {
          // Expensive filtering logic
          return item.price > this.state.minPrice && 
                 item.category === this.state.selectedCategory;
        });
      });
      
      // Store the getter and cleanup function
      this.getFilteredItems = getFilteredItems;
      this._disposeFilteredItems = dispose;
    },
    
    onDetach() {
      // Clean up the memo when component is detached
      this._disposeFilteredItems();
    }
  }
};
```

#### Component Preservation

By default, Lips preserves component instances when their inputs change, rather than recreating them. This preserves internal state and improves performance:

```html
<!-- Even as items change, component instances are preserved -->
<for [item] in=state.items>
  <item-card item=item key=item.id />
</for>
```

The `key` attribute helps Lips identify which components to preserve when arrays are reordered.

#### Dependency Tracking

Lips automatically tracks which parts of your template depend on specific state properties:

```html
<div>
  <h1>{state.title}</h1>
  <p>{state.description}</p>
  <span>{state.views} views</span>
</div>
```

In this example:
- The `<h1>` element depends only on `state.title`
- The `<p>` element depends only on `state.description`
- The `<span>` element depends only on `state.views`

If `state.title` changes, only the `<h1>` element will be updated. The other elements remain untouched.

#### Update Queue System (UQS)

For high-frequency updates, Lips uses an Update Queue System to batch and optimize DOM operations:

```javascript
const component = {
  handler: {
    startCounting() {
      // Even with rapid updates, the DOM updates efficiently
      this._interval = setInterval(() => {
        this.state.count++;
        this.state.totalUpdates++;
        this.state.lastUpdated = new Date();
      }, 16); // ~60fps
    }
  }
};
```

The UQS ensures that even with frequent state changes, DOM updates are batched and applied efficiently.

### Benchmarking

Lips includes built-in performance tracking to help you identify and resolve bottlenecks.

#### Performance Metrics

Every component has a `benchmark` property that tracks performance metrics:

```javascript
const component = {
  handler: {
    onRender() {
      // Log performance metrics after each render
      console.log('Render time:', this.benchmark.stats.renderTime, 'ms');
      console.log('DOM operations:', this.benchmark.stats.domOperations);
    }
  }
};
```

Available metrics include:

- **Rendering**: renderCount, elementCount, renderTime, avgRenderTime, maxRenderTime
- **Components**: componentCount, componentUpdateCount
- **DOM**: domOperations, domInsertsCount, domUpdatesCount, domRemovalsCount
- **Dependencies**: dependencyTrackCount, dependencyUpdateCount
- **Batching**: batchSize, batchCount
- **Memory**: memoryUsage (where available)

#### Debug Mode

Enable debug mode to automatically log performance metrics:

```javascript
const lips = new Lips({ debug: true });

// Components will automatically track and log performance
const app = lips.render('App', appComponent);
```

When debug mode is enabled, components will log detailed performance metrics during significant operations.

These advanced features make Lips not just powerful and flexible, but also highly performant for complex applications. The combination of fine-grained reactivity, efficient batching, and built-in performance tools helps you build fast, responsive UIs without sacrificing developer experience.
