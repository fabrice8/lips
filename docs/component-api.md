## Component API

### Creating Components

In Lips, components are the fundamental building blocks of your application. They encapsulate UI elements, state, and behavior into reusable pieces.

#### Component Definition

A Lips component can be defined in two main ways:

**1. As a JavaScript object:**

```javascript
const counterComponent = {
  // Component state
  state: {
    count: 0
  },
  
  // Event handlers and methods
  handler: {
    increment() {
      this.state.count++;
    },
    
    decrement() {
      if (this.state.count > 0) {
        this.state.count--;
      }
    }
  },
  
  // Template HTML
  default: `
    <div class="counter">
      <h2>Count: {state.count}</h2>
      <button on-click(increment)>+</button>
      <button on-click(decrement)>-</button>
    </div>
  `,
  
  // CSS styles
  stylesheet: `
    .counter {
      padding: 1rem;
      border: 1px solid #eee;
      border-radius: 4px;
      text-align: center;
    }
    
    button {
      margin: 0 0.5rem;
      padding: 0.5rem 1rem;
    }
  `
};
```

**2. As ES modules with named exports:**

Lips supports a modular file architecture using standard JavaScript/TypeScript module syntax, making it ideal for larger applications:

```javascript
// Counter.js or Counter.ts

// State definition
export const state = {
  count: 0
};

// Event handlers
export const handler = {
  increment() {
    this.state.count++;
  },
  
  decrement() {
    if (this.state.count > 0) {
      this.state.count--;
    }
  }
};

// Component styles
export const stylesheet = `
  .counter {
    padding: 1rem;
    border: 1px solid #eee;
    border-radius: 4px;
    text-align: center;
  }
  
  button {
    margin: 0 0.5rem;
    padding: 0.5rem 1rem;
  }
`;

// Default export for the template
export default `
  <div class="counter">
    <h2>Count: {state.count}</h2>
    <button on-click(increment)>+</button>
    <button on-click(decrement)>-</button>
  </div>
`;
```

This modular approach offers several advantages:
- Better code organization with separate files for components
- TypeScript support for better type checking and IDE features
- Ability to import and reuse components across your application
- Cleaner separation of component parts (template, state, handlers, etc.)

#### Registering Components

Components must be registered with the Lips instance before they can be used:

```javascript
const lips = new Lips({ debug: true });

// Register a component defined as an object
lips.register('counter', counterComponent);

// Register a component from a module
import * as UserProfile from './components/UserProfile';
lips.register('user-profile', UserProfile);

// Check if a component is registered
if (lips.has('counter')) {
  console.log('Counter component is available');
}

// Unregister a component
lips.unregister('counter');
```

#### Rendering Components

There are several ways to render components in Lips:

```javascript
// Render a component to a specific element
const counter = lips.render('Counter', counterComponent);
counter.appendTo('#app');

// Alternative append methods
counter.prependTo('.container');
counter.replaceWith('#placeholder');

// Create a root component (main application entry point)
lips.root(appComponent, '#app');
```

### Component Properties

#### Input (Props)

Inputs are properties passed to a component from its parent:

```javascript
// Parent component template
const parentTemplate = `
  <div>
    <user-profile 
      name="John Doe" 
      email="john@example.com" 
      isAdmin=state.userIsAdmin
    />
  </div>
`;

// Child component accessing inputs
const userProfile = {
  default: `
    <div>
      <h2>{input.name}</h2>
      <p>{input.email}</p>
      <if(input.isAdmin)>
        <admin-badge/>
      </if>
    </div>
  `,
  
  handler: {
    onInput(input) {
      // React to input changes
      console.log('Received new inputs:', input);
    }
  }
};
```

Inputs can be updated using the `setInput` method:

```javascript
// Get a reference to the rendered component
const profileComponent = lips.render('UserProfile', userProfile);

// Update inputs
profileComponent.setInput({
  name: 'Jane Doe',
  email: 'jane@example.com',
  isAdmin: true
});

// Update a subset of inputs
profileComponent.subInput({
  isAdmin: false
});
```

#### State

State contains reactive data that drives the component. Changes to state trigger re-renders of the affected parts of the component:

```javascript
// Object style
const counter = {
  state: {
    count: 0,
    lastUpdated: null
  },
  
  handler: {
    increment() {
      // State updates are automatically detected
      this.state.count++;
      this.state.lastUpdated = new Date();
    },
    
    reset() {
      // Reset state to initial values
      this.state.reset();
    }
  }
};

// ES Module style
export const state = {
  count: 0,
  lastUpdated: null
};

export const handler = {
  increment() {
    this.state.count++;
    this.state.lastUpdated = new Date();
  },
  
  reset() {
    this.state.reset();
  }
};
```

State properties can be deeply nested:

```javascript
const todoApp = {
  state: {
    todos: [
      { id: 1, text: 'Learn Lips', completed: false },
      { id: 2, text: 'Build an app', completed: false }
    ],
    filter: 'all'
  },
  
  handler: {
    toggleTodo(id) {
      // Deep updates are automatically detected
      const todo = this.state.todos.find(t => t.id === id);
      todo.completed = !todo.completed;
    },
    
    addTodo(text) {
      // Array mutations are tracked
      this.state.todos.push({
        id: Date.now(),
        text,
        completed: false
      });
    }
  }
};
```

#### Static Properties

Static properties are similar to state but don't trigger re-renders when changed. They're useful for values that don't affect the UI:

```javascript
// Object style
const component = {
  _static: {
    api: {
      baseUrl: 'https://api.example.com',
      timeout: 5000
    },
    validators: {
      email: (value) => /^.+@.+\..+$/.test(value)
    }
  },
  
  handler: {
    async fetchData() {
      const response = await fetch(`${this.static.api.baseUrl}/data`);
      return await response.json();
    }
  }
};

// ES Module style
export const _static = {
  api: {
    baseUrl: 'https://api.example.com',
    timeout: 5000
  },
  validators: {
    email: (value) => /^.+@.+\..+$/.test(value)
  }
};

export const handler = {
  async fetchData() {
    const response = await fetch(`${this.static.api.baseUrl}/data`);
    return await response.json();
  }
};
```

#### Context

Context provides a way to share data across components without passing props. It's ideal for global settings, themes, or user data:

```javascript
// Initialize Lips with context
const lips = new Lips({
  context: {
    theme: 'light',
    user: { id: 1, name: 'Guest' },
    permissions: ['read']
  }
});

// Component using context (object style)
const component = {
  // Declare which context properties to observe
  context: ['theme', 'user'],
  
  default: `
    <div class="app theme-{context.theme}">
      <p>Welcome, {context.user.name}</p>
    </div>
  `,
  
  handler: {
    onContext() {
      // Called when observed context properties change
      console.log('Context changed:', this.context);
    }
  }
};

// ES Module style
export const context = ['theme', 'user'];

export const handler = {
  onContext() {
    console.log('Context changed:', this.context);
  }
};

export default `
  <div class="app theme-{context.theme}">
    <p>Welcome, {context.user.name}</p>
  </div>
`;

// Update context from anywhere
lips.setContext('theme', 'dark');
// or
lips.setContext({ user: { id: 2, name: 'John' } });
```

### Component Methods

#### Lifecycle Methods

```javascript
const component = {
  handler: {
    onCreate() {
      // Component instance created
    },
    
    onInput(input) {
      // Component received new input (props)
    },
    
    onMount() {
      // Component mounted to DOM (first render)
    },
    
    onRender() {
      // Component rendered (first time and updates)
    },
    
    onUpdate() {
      // Component updated due to state/input changes
    },
    
    onAttach() {
      // Component attached to DOM
    },
    
    onDetach() {
      // Component detached from DOM
    },
    
    onContext() {
      // Component received context changes
    }
  }
};

// ES Module style
export const handler = {
  onCreate() {
    // Component instance created
  },
  
  onMount() {
    // Component mounted to DOM
  },
  
  // Other lifecycle methods...
};
```

#### DOM Access Methods

Components provide methods to access the DOM:

```javascript
const component = {
  handler: {
    onMount() {
      // Access the component's root element(s)
      const root = this.node;
      
      // Find elements within the component
      const button = root.find('.submit-button');
      
      // Manipulate elements with Cash-DOM (jQuery-like API)
      button.addClass('active');
      button.css({ 'background-color': 'blue' });
    }
  }
};
```

#### Event Methods

```javascript
const component = {
  handler: {
    customAction() {
      // Emit an event with optional data
      this.emit('action-completed', { 
        timestamp: Date.now(),
        result: 'success'
      });
    },
    
    setupListeners() {
      // Listen for an event once
      this.once('special-event', data => {
        console.log('Special event occurred:', data);
      });
      
      // Listen for an event multiple times
      this.on('update', data => {
        console.log('Update event:', data);
      });
      
      // Remove event listener
      this.off('update');
    }
  }
};
```

### Component Lifecycle

The lifecycle of a Lips component flows through several distinct phases:

1. **Creation**
   - Component instance is created
   - `onCreate` handler is called
   - Initial state is set up

2. **Input Processing**
   - Initial inputs (props) are processed
   - `onInput` handler is called

3. **Mounting**
   - Component is rendered for the first time
   - DOM elements are created
   - `onMount` handler is called

4. **Attachment**
   - Component is attached to the DOM
   - `onAttach` handler is called
   - Good time to initialize third-party libraries that need DOM access

5. **Updates**
   - State or input changes trigger updates
   - Only affected DOM parts are re-rendered
   - `onUpdate` handler is called after each update
   - `onRender` handler is called after each render

6. **Detachment**
   - Component is removed from the DOM
   - `onDetach` handler is called
   - Good time to clean up resources

7. **Destruction**
   - Component is destroyed
   - `onDestroy` handler is called
   - Event listeners are removed
   - Resources are released

```javascript
// Full application lifecycle example (ES Module style)
export const handler = {
  onCreate() {
    console.log('1. Component created');
    this.initializeState();
  },
  
  onInput(input) {
    console.log('2. Input processed:', input);
  },
  
  onMount() {
    console.log('3. Component mounted');
    this.setupEventListeners();
  },
  
  onAttach() {
    console.log('4. Component attached to DOM');
    this.initializeThirdPartyPlugins();
  },
  
  onUpdate() {
    console.log('5. Component updated');
  },
  
  onDetach() {
    console.log('6. Component detached from DOM');
    this.cleanupPlugins();
  },
  
  destroy() {
    console.log('7. Component destroyed');
    this.releaseResources();
  },
  
  // Helper methods referenced above
  initializeState() { /* ... */ },
  setupEventListeners() { /* ... */ },
  initializeThirdPartyPlugins() { /* ... */ },
  cleanupPlugins() { /* ... */ },
  releaseResources() { /* ... */ }
};
```

This lifecycle system gives you fine-grained control over your components, allowing you to properly initialize resources, handle updates, and clean up when components are removed.