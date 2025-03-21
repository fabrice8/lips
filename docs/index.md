# Lips Framework Documentation

## Table of Contents

1. **Introduction**
   - What is Lips?
   - Key Features
   - Comparison with Other Frameworks
   - Browser Compatibility

2. **Getting Started**
   - Installation
   - Quick Start Example
   - Project Structure

3. **Core Concepts**
   - Component Architecture
   - Reactive State Management
   - Template Syntax
   - Lifecycle Methods
   - Event Handling

4. **Component API**
   - Creating Components
   - Component Properties (input, state, static, context)
   - Component Methods
   - Component Lifecycle

5. **Template Syntax**
   - Text Interpolation
   - Attributes Binding
   - Conditional Rendering
   - List Rendering
   - Event Binding
   - Component Composition

6. **Built-in Components**
   - `<if>`, `<else-if>`, `<else>`
   - `<for>`
   - `<switch>`, `<case>`
   - `<async>`, `<then>`, `<catch>`
   - `<router>`
   - `<let>` and `<const>`

7. **Advanced Features**
   - Context API
   - Macros
   - Reactive Updates
   - Performance Optimization
   - Fine-Grained Updates
   - Benchmarking

8. **Styling**
   - Component Styling
   - Stylesheet API

9. **Internationalization (i18n)**
   - Setting up Languages
   - Translating Content

10. **Best Practices**
    - Component Design
    - Performance Tips
    - Error Handling

11. **Examples**
    - Simple Components
    - Complex Applications
    - Animation Examples
    - Practical Use Cases

12. **API Reference**
    - Classes
    - Interfaces
    - Methods

## Introduction to Lips Framework

### What is Lips?

Lips is a lightweight, reactive UI framework that runs directly in the browser. It offers a component-based architecture with fine-grained reactivity, making it ideal for building dynamic web applications with minimal overhead.

Unlike heavier frameworks that require build steps, Lips can be used by simply importing the `lips.min.js` script, allowing you to start developing immediately without complex tooling.

### Key Features

- **Lightweight and Runtime-Based**: No build step required, just import and start using
- **Component-Based Architecture**: Create reusable, self-contained UI components
- **Fine-Grained Reactivity**: Efficient updates that only re-render what has changed
- **Rich Template Syntax**: Intuitive syntax for conditionals, loops, and component composition
- **Built-in Performance Tracking**: Monitor rendering performance with integrated benchmarking
- **DOM Watcher**: Automatically manages component lifecycle based on DOM presence
- **Context API**: Share state across components without prop drilling
- **Internationalization Support**: Built-in i18n features for multilingual applications
- **Macros System**: Create template shortcuts for common patterns
- **Async Component Support**: Handle asynchronous operations elegantly
- **SVG Support**: Create and manipulate SVG elements with ease

### Comparison with Other Frameworks

| Feature | Lips | React | Vue | Svelte |
|---------|------|-------|-----|--------|
| Runtime Only | <span style="color:#4CAF50">✓</span> | <span style="color:#F44336">✗</span> | <span style="color:#F44336">✗</span> | <span style="color:#F44336">✗</span> |
| No Build Step | <span style="color:#4CAF50">✓</span> | <span style="color:#F44336">✗</span> | <span style="color:#F44336">✗</span> | <span style="color:#F44336">✗</span> |
| Fine-Grained Updates | <span style="color:#4CAF50">✓</span> | <span style="color:#F44336">✗</span> | <span style="color:#4CAF50">✓</span> | <span style="color:#4CAF50">✓</span> |
| Virtual DOM | <span style="color:#F44336">✗</span> | <span style="color:#4CAF50">✓</span> | <span style="color:#4CAF50">✓</span> | <span style="color:#F44336">✗</span> |
| Built-in State Management | <span style="color:#4CAF50">✓</span> | <span style="color:#F44336">✗</span> | <span style="color:#4CAF50">✓</span> | <span style="color:#4CAF50">✓</span> |
| Built-in Routing | <span style="color:#4CAF50">✓</span> | <span style="color:#F44336">✗</span> | <span style="color:#F44336">✗</span> | <span style="color:#F44336">✗</span> |
| Performance Benchmarking | <span style="color:#4CAF50">✓</span> | <span style="color:#F44336">✗</span> | <span style="color:#F44336">✗</span> | <span style="color:#F44336">✗</span> |
| File Size | Small | Medium | Medium | Small |

### Browser Compatibility

Lips is designed to work in all modern browsers, including:
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Getting Started

### Installation

Getting started with Lips is as simple as including the script in your HTML file. Since Lips is a runtime framework with no build step required, you can start developing immediately.

#### Using via CDN (Recommended)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Lips App</title>
  <script src="https://cdn.jsdelivr.net/npm/lips/dist/lips.min.js"></script>
</head>
<body>
  <div id="app"></div>
  <script>
    // Your Lips code here
  </script>
</body>
</html>
```

#### Using npm (Optional)

If you prefer using npm for dependency management:

```bash
npm install lips
```

Then import it into your project:

```javascript
import Lips from 'lips';
```

### Quick Start Example

Let's create a simple counter component to get a feel for how Lips works:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lips Counter Example</title>
  <script src="https://cdn.jsdelivr.net/npm/lips/dist/lips.min.js"></script>
</head>
<body>
  <div id="app"></div>
  
  <script>
    // Initialize Lips with debug mode
    const lips = new Lips({ debug: true });
    
    // Define a counter component
    const counterTemplate = {
      // Component state
      state: {
        count: 0
      },
      
      // Event handlers
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
      
      // Component template
      default: `
        <div class="counter">
          <h2>Counter: {state.count}</h2>
          <button on-click(increment)>+</button>
          <button on-click(decrement)>-</button>
        </div>
      `,
      
      // Component styles
      stylesheet: `
        .counter {
          font-family: sans-serif;
          text-align: center;
          margin: 2rem auto;
          padding: 1rem;
          border: 1px solid #ccc;
          border-radius: 4px;
          max-width: 300px;
        }
        
        button {
          padding: 0.5rem 1rem;
          margin: 0 0.5rem;
          font-size: 1rem;
          cursor: pointer;
        }
      `
    };
    
    // Render the counter component to the DOM
    lips.render('Counter', counterTemplate).appendTo('#app');
  </script>
</body>
</html>
```

This simple example demonstrates several of Lips' core features:
- Component-based structure
- Reactive state management
- Event handling
- Template interpolation
- Scoped styling

### Project Structure

For larger applications, you might want to organize your code into separate files. Here's a recommended structure for a Lips project:

```
my-lips-app/
├── index.html
├── styles/
│   ├── main.css
│   └── components/
│       ├── header.css
│       └── footer.css
├── components/
│   ├── Header.js
│   ├── Footer.js
│   └── TodoList.js
└── app.js
```

Example `app.js`:

```javascript
// Import Lips
import Lips from 'lips';

// Import components
import Header from './components/Header.js';
import Footer from './components/Footer.js';
import TodoList from './components/TodoList.js';

// Initialize Lips
const lips = new Lips({
  debug: true,
  context: {
    theme: 'light',
    user: null
  }
});

// Register components
lips.register('header', Header);
lips.register('footer', Footer);
lips.register('todo-list', TodoList);

// Root component
const App = {
  default: `
    <div class="app">
      <header/>
      <main>
        <todo-list/>
      </main>
      <footer/>
    </div>
  `,
  stylesheet: `
    .app {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    
    main {
      flex: 1;
      padding: 1rem;
    }
  `
};

// Render the app
lips.root(App, '#app');
```

Example component file (`TodoList.js`):

```javascript
export default {
  state: {
    todos: [
      { id: 1, text: 'Learn Lips', completed: false },
      { id: 2, text: 'Build an app', completed: false }
    ],
    newTodo: ''
  },
  
  handler: {
    addTodo() {
      if (this.state.newTodo.trim()) {
        this.state.todos.push({
          id: Date.now(),
          text: this.state.newTodo,
          completed: false
        });
        this.state.newTodo = '';
      }
    },
    
    updateNewTodo(e) {
      this.state.newTodo = e.target.value;
    },
    
    toggleTodo(id) {
      const todo = this.state.todos.find(t => t.id === id);
      if (todo) {
        todo.completed = !todo.completed;
      }
    }
  },
  
  default: `
    <div class="todo-list">
      <h2>Todo List</h2>
      
      <div class="add-todo">
        <input type="text" 
                placeholder="Add new todo" 
                value=state.newTodo 
                on-input(updateNewTodo)/>
        <button on-click(addTodo)>Add</button>
      </div>
      
      <ul>
        <for [todo] in=state.todos>
          <li class=(todo-item '+(todo.completed ? 'completed' : ''))">
            <input type="checkbox" 
                    checked=todo.completed 
                    on-change(toggleTodo, todo.id)/>
            <span>{todo.text}</span>
          </li>
        </for>
      </ul>
    </div>
  `,
  
  stylesheet: `
    .todo-list {
      max-width: 500px;
      margin: 0 auto;
    }
    
    .add-todo {
      display: flex;
      margin-bottom: 1rem;
    }
    
    .add-todo input {
      flex: 1;
      padding: 0.5rem;
      margin-right: 0.5rem;
    }
    
    .todo-item {
      display: flex;
      align-items: center;
      padding: 0.5rem 0;
    }
    
    .todo-item.completed span {
      text-decoration: line-through;
      opacity: 0.6;
    }
    
    .todo-item input {
      margin-right: 0.5rem;
    }
  `
};
```

This structured approach helps keep your code organized and maintainable as your application grows. Lips works well with this modular approach, making it easy to compose complex UIs from simple, reusable components.

## Core Concepts

### Component Architecture

Lips is built around a component-based architecture, where UI elements are encapsulated into reusable components. Each component contains its own:

- **Template**: The HTML structure of the component
- **State**: Reactive data that drives the component
- **Handlers**: Methods that respond to events and manipulate state
- **Styles**: Scoped CSS styles that apply only to the component
- **Lifecycle Methods**: Hooks for responding to component events

Components can be composed together to create complex interfaces, with parent components passing data to child components through inputs.

```javascript
// A simple component definition
const userProfile = {
  // Component state (reactive data)
  state: {
    isEditing: false
  },
  
  // Component inputs (props)
  input: {
    user: {
      name: "John Doe",
      email: "john@example.com"
    }
  },
  
  // Event handlers and methods
  handler: {
    toggleEdit() {
      this.state.isEditing = !this.state.isEditing;
    },
    
    saveChanges() {
      // Save logic here
      this.state.isEditing = false;
      this.emit('save', this.input.user);
    }
  },
  
  // Component template
  default: `
    <div class="user-profile">
      <h2>{input.user.name}</h2>
      
      <if(state.isEditing)>
        <form on-submit(saveChanges)>
          <!-- Form fields here -->
          <button type="submit">Save</button>
        </form>
      </if>
      <else>
        <div class="user-info">
          <p>Email: {input.user.email}</p>
          <button on-click(toggleEdit)>Edit Profile</button>
        </div>
      </else>
    </div>
  `
};
```

### Reactive State Management

Lips uses a fine-grained reactivity system that automatically detects changes to state and updates only the affected parts of the DOM. This is achieved without a Virtual DOM, making updates efficient and predictable.

The reactivity system works by:

1. Creating reactive proxies for state objects
2. Tracking which parts of the DOM depend on specific state properties
3. Updating only those DOM elements when their dependencies change
4. Batching updates to minimize DOM operations

```javascript
// State is defined as a simple object
const counterComponent = {
  state: {
    count: 0,
    lastUpdated: null
  },
  
  handler: {
    increment() {
      // Updates are automatically detected
      this.state.count++;
      this.state.lastUpdated = new Date();
      
      // Only DOM elements that depend on count or lastUpdated will update
    }
  },
  
  default: `
    <div>
      <p>Count: {state.count}</p>
      <p>Last updated: {state.lastUpdated ? state.lastUpdated.toLocaleString() : 'Never'}</p>
      <button on-click(increment)>Increment</button>
    </div>
  `
};
```

#### Deep Reactivity

Lips provides deep reactivity for nested objects and arrays:

```javascript
const todoApp = {
  state: {
    todos: [
      { id: 1, text: 'Learn Lips', completed: false },
      { id: 2, text: 'Build an app', completed: false }
    ]
  },
  
  handler: {
    toggleTodo(id) {
      // Deep updates are automatically detected
      const todo = this.state.todos.find(t => t.id === id);
      todo.completed = !todo.completed;
      
      // Only the affected todo item will be re-rendered
    }
  }
};
```

### Template Syntax

Lips provides an intuitive and expressive template syntax that feels familiar to HTML but adds powerful reactive features.

#### Text Interpolation

```html
<!-- Basic interpolation -->
<p>Hello, {state.username}!</p>

<!-- Expression interpolation -->
<p>Total: {state.price * state.quantity}</p>

<!-- Method call interpolation -->
<p>Formatted date: {self.formatDate(state.timestamp)}</p>
```

#### Attribute Binding

```html
<!-- Boolean attributes -->
<button disabled={!state.isValid}>Submit</button>

<!-- Value attributes -->
<input value={state.searchQuery}>

<!-- Class binding -->
<div class="card {state.isActive ? 'active' : ''}"></div>

<!-- Style binding -->
<div style="{ color: state.textColor, fontSize: state.fontSize + 'px' }"></div>

<!-- Object spread for multiple attributes -->
<div ...state.attributes></div>
```

#### Conditional Rendering

```html
<!-- If/else-if/else blocks -->
<if(state.status === 'loading')>
  <loading-spinner/>
</if>
<else-if(state.status === 'error')>
  <error-message error={state.error}/>
</else-if>
<else>
  <user-data data={state.data}/>
</else>

<!-- Shorthand if syntax -->
<if(state.isAdmin)>
  <admin-panel/>
</if>
```

#### List Rendering

```html
<!-- Basic list rendering -->
<ul>
  <for [item] in=state.items>
    <li>{item.name}</li>
  </for>
</ul>

<!-- With item index -->
<ul>
  <for [item, index] in=state.items>
    <li>#{index + 1}: {item.name}</li>
  </for>
</ul>

<!-- Object iteration -->
<dl>
  <for [key, value] in=state.user>
    <dt>{key}</dt>
    <dd>{value}</dd>
  </for>
</dl>

<!-- Range iteration -->
<div class="pagination">
  <for [page] from=1 to=state.totalPages>
    <button class={page === state.currentPage ? 'active' : ''}>{page}</button>
  </for>
</div>
```

#### Event Binding

```html
<!-- Basic event binding -->
<button on-click(handleClick)>Click me</button>

<!-- With parameters -->
<button on-click(deleteItem, item.id)>Delete</button>

<!-- Inline handlers -->
<button on-click(() => state.count++)>Increment</button>

<!-- Form events -->
<form on-submit(handleSubmit)>
  <input on-input(e => state.name = e.target.value)>
  <button type="submit">Submit</button>
</form>
```

#### Component Composition

```html
<!-- Basic component usage -->
<user-profile user=state.currentUser/>

<!-- With event listeners -->
<user-form
  user=state.user
  on-save(handleSave)
  on-cancel(handleCancel)
/>

<!-- Slot content -->
<card>
  <h2>Card Title</h2>
  <p>Card content goes here...</p>
</card>

<!-- Dynamic components -->
<{state.currentView} props=state.viewProps/>
```

### Lifecycle Methods

Lips components have a rich set of lifecycle methods that allow you to hook into different stages of a component's life:

```javascript
const component = {
  handler: {
    // Called when component is first created
    onCreate() {
      console.log('Component created');
    },
    
    // Called when component receives input (props)
    onInput(input) {
      console.log('Input received:', input);
    },
    
    // Called when component is mounted to the DOM
    onMount() {
      console.log('Component mounted');
      // Good place to initialize external libraries
    },
    
    // Called after each render
    onRender() {
      console.log('Component rendered');
    },
    
    // Called when component updates due to state/input changes
    onUpdate() {
      console.log('Component updated');
    },
    
    // Called when component is attached to the DOM
    onAttach() {
      console.log('Component attached to DOM');
    },
    
    // Called when component is detached from the DOM
    onDetach() {
      console.log('Component detached from DOM');
      // Good place to clean up resources
    },
    
    // Called when component receives context changes
    onContext() {
      console.log('Context changed:', this.context);
    },
    
    // Called when component is destroyed
    onDestroy() {
      console.log('Component destroyed');
    }
  }
};
```

### Event Handling

Lips provides a flexible event system for both DOM events and custom component events.

#### DOM Events

```html
<!-- Basic event handling -->
<button on-click(handleClick)>Click me</button>

<!-- Passing parameters -->
<button on-click(deleteItem, item.id, $event)>Delete</button>

<!-- Modifier keys -->
<input on-keydown(handleKey)>
```

```javascript
const component = {
  handler: {
    handleClick(event) {
      console.log('Button clicked', event);
    },
    
    deleteItem(id, event) {
      console.log(`Delete item ${id}`);
      event.preventDefault();
    },
    
    handleKey(event) {
      if (event.key === 'Enter') {
        this.submitForm();
      }
    }
  }
};
```

#### Custom Component Events

Components can emit and listen for custom events:

```javascript
// Child component
const childComponent = {
  handler: {
    submitForm() {
      // Validate form
      if (this.validateForm()) {
        // Emit custom event with data
        this.emit('submit', {
          name: this.state.name,
          email: this.state.email
        });
      }
    }
  }
};

// Parent component
const parentComponent = {
  default: `
    <div>
      <child-component on-submit(handleSubmit)/>
    </div>
  `,
  
  handler: {
    handleSubmit(formData) {
      console.log('Form submitted:', formData);
      // Process form data
    }
  }
};
```

This event system allows for clean communication between components, following a unidirectional data flow pattern that makes applications easier to reason about and debug.

Let me revise the Component API section to maintain a better flow with the documentation and incorporate the ES modules approach in a more aligned way.

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
      const button = this.find('.submit-button');
      
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

## Template Syntax

Lips provides a powerful and intuitive template syntax that combines HTML-like structure with reactive expressions. This section covers the core template syntax features that allow you to build dynamic UIs.

### Text Interpolation

Text interpolation allows you to embed dynamic values directly in your templates:

```html
<!-- Basic interpolation -->
<p>Hello, {state.username}!</p>

<!-- Expression interpolation -->
<p>Total: ${state.price * state.quantity}</p>

<!-- Method call interpolation -->
<p>Formatted date: {self.formatDate(state.timestamp)}</p>

<!-- Conditional text -->
<p>Status: {state.isActive ? 'Active' : 'Inactive'}</p>

<!-- Object property access -->
<p>Address: {state.user.address.street}, {state.user.address.city}</p>
```

### Attributes Binding

Lips provides several ways to bind dynamic values to element attributes:

```html
<!-- Standard attribute binding -->
<input placeholder="{state.placeholderText}">

<!-- Boolean attributes -->
<button disabled={!state.isValid}>Submit</button>

<!-- Class binding -->
<div class="card {state.isActive ? 'active' : ''}"></div>

<!-- Style binding (object format) -->
<div style="{ color: state.textColor, fontSize: state.fontSize + 'px' }"></div>

<!-- Style binding (string format) -->
<div style="color: {state.textColor}; font-size: {state.fontSize}px"></div>

<!-- Spread attributes from an object -->
<div ...state.elementAttributes></div>
```

### Special Directives

Lips includes special directives for common DOM operations:

```html
<!-- HTML content injection (unescaped) -->
<div @html=state.richContent></div>

<!-- Text content injection (escaped) -->
<div @text=state.plainContent></div>

<!-- Function attributes (methods passed as values) -->
<custom-component fn:formatter=formatDate />
```

### Conditional Rendering

Lips provides several ways to conditionally render content:

#### If/Else Blocks

```html
<!-- Basic if block -->
<if(state.isLoading)>
  <loading-spinner/>
</if>

<!-- If/else block -->
<if(state.isLoggedIn)>
  <user-dashboard/>
</if>
<else>
  <login-form/>
</else>

<!-- If/else-if/else chain -->
<if(state.status === 'loading')>
  <loading-spinner/>
</if>
<else-if(state.status === 'error')>
  <error-message error={state.error}/>
</else-if>
<else-if(state.status === 'empty')>
  <empty-state message="No data available"/>
</else-if>
<else>
  <data-display data={state.data}/>
</else>

<!-- Shorthand if syntax -->
<if(state.isAdmin)><admin-panel/></if>

<!-- Parentheses syntax (alternative) -->
<if(state.count > 10)>
  <p>Count is greater than 10</p>
</if>
```

#### Switch/Case

The `switch` component provides an alternative to multiple `if`/`else-if` chains:

```html
<switch(state.role)>
  <case is="admin">
    <admin-panel/>
  </case>
  <case is="editor">
    <editor-panel/>
  </case>
  <case is="viewer">
    <viewer-panel/>
  </case>
  <default>
    <guest-panel/>
  </default>
</switch>

<!-- Multiple values per case -->
<switch(state.status)>
  <case is={['loading', 'processing']}>
    <loading-spinner/>
  </case>
  <case is={['error', 'failed']}>
    <error-message/>
  </case>
  <default>
    <content-view/>
  </default>
</switch>
```

### List Rendering

The `for` component allows you to render lists of items:

```html
<!-- Basic list rendering -->
<ul>
  <for [item] in=state.items>
    <li>{item.name}</li>
  </for>
</ul>

<!-- With index -->
<ul>
  <for [item, index] in=state.items>
    <li>#{index + 1}: {item.name}</li>
  </for>
</ul>

<!-- Object iteration -->
<dl>
  <for [key, value] in=state.user>
    <dt>{key}</dt>
    <dd>{value}</dd>
  </for>
</dl>

<!-- Numeric range iteration -->
<div class="pagination">
  <for [page] from=1 to=state.totalPages>
    <button class={page === state.currentPage ? 'active' : ''}>{page}</button>
  </for>
</div>

<!-- Empty state handling -->
<if(state.items.length)>
  <ul>
    <for [item] in=state.items>
      <li>{item.name}</li>
    </for>
  </ul>
</if>
<else>
  <p>No items found</p>
</else>
```

### Event Binding

Lips provides a simple syntax for binding event handlers:

```html
<!-- Basic event binding -->
<button on-click(handleClick)>Click me</button>

<!-- With parameters -->
<button on-click(deleteItem, item.id)>Delete</button>

<!-- Passing the event object -->
<input on-input(handleInput, $event)>

<!-- Inline handlers -->
<button on-click(() => state.count++)>Increment</button>

<!-- Multiple events on one element -->
<div
  on-mouseenter(handleMouseEnter)
  on-mouseleave(handleMouseLeave)
>
  Hover me
</div>

<!-- Form events -->
<form on-submit(handleSubmit)>
  <input on-input(e => state.name = e.target.value)>
  <button type="submit">Submit</button>
</form>
```

### Variable Declarations

Lips allows you to declare scoped variables within templates:

```html
<!-- Let variable (mutable) -->
<let total={state.price * state.quantity}/>
<p>Total: ${total}</p>

<!-- Const variable (immutable) -->
<const TAX_RATE=0.07/>
<p>Tax: ${state.price * TAX_RATE}</p>

<!-- Multiple variables -->
<let 
  subtotal={state.price * state.quantity}
  tax={subtotal * 0.07}
  total={subtotal + tax}
/>

<p>Subtotal: ${subtotal}</p>
<p>Tax: ${tax}</p>
<p>Total: ${total}</p>

<!-- Spread variables from an object -->
<let ...self.calculateTotals()/>
<p>Subtotal: ${subtotal}</p>
<p>Tax: ${tax}</p>
<p>Total: ${total}</p>
```

### Component Composition

Lips makes it easy to compose components together:

```html
<!-- Basic component usage -->
<user-profile user={state.currentUser}/>

<!-- With attributes and events -->
<user-form
  user={state.user}
  submitText="Save Changes"
  on-save(handleSave)
  on-cancel(handleCancel)
/>

<!-- Passing children (slot content) -->
<card title="User Profile">
  <h3>{state.user.name}</h3>
  <p>{state.user.bio}</p>
</card>

<!-- Dynamic components -->
<{state.currentView} props={state.viewProps}/>

<!-- Component with multiple named sections -->
<layout>
  <header>
    <h1>My App</h1>
  </header>
  <sidebar>
    <nav>...</nav>
  </sidebar>
  <content>
    <p>Main content here</p>
  </content>
  <footer>
    <p>Footer content</p>
  </footer>
</layout>
```

### Asynchronous Content

The `async` component handles asynchronous operations elegantly:

```html
<async await(fetchUserData, state.userId)>
  <loading>
    <p>Loading user data...</p>
  </loading>
  <then [user]>
    <div class="user-profile">
      <h2>{user.name}</h2>
      <p>{user.email}</p>
    </div>
  </then>
  <catch [error]>
    <div class="error">
      <p>Error loading user: {error.message}</p>
    </div>
  </catch>
</async>
```

### Template Fragments

Fragments allow you to group elements without adding extra DOM nodes:

```html
<!-- Fragment shorthand -->
<>
  <h1>Title</h1>
  <p>Paragraph 1</p>
  <p>Paragraph 2</p>
</>

<!-- Conditionally rendering multiple elements -->
<if(state.showHeader)>
  <>
    <header>
      <h1>My App</h1>
      <nav>...</nav>
    </header>
    <hr>
  </>
</if>
```

### Debugging Templates

Lips provides a `log` component to help debug template rendering:

```html
<!-- Log a variable -->
<log(state.user)/>

<!-- Log multiple values -->
<log('User data:', state.user, 'Permissions:', state.permissions)/>

<!-- Log within a loop -->
<for [item] in=state.items>
  <log('Processing item:', item)/>
  <div>{item.name}</div>
</for>
```

### Dynamic Tag Names

Lips allows you to dynamically select which HTML element to render:

```html
<!-- Dynamic tag name based on state -->
<{state.headingLevel}>Title</{state.headingLevel}>

<!-- With attributes -->
<{state.containerType} class="wrapper" id="main">
  Content goes here
</{state.containerType}>
```

This rich template syntax gives you the power to create dynamic, reactive UIs with a clean, declarative syntax that feels natural to HTML developers while providing the reactivity needed for modern web applications.

## Built-in Components

Lips provides several built-in components that handle common UI patterns and make building applications easier. These components are available by default without requiring registration.

### `<if>`, `<else-if>`, `<else>`

The `if` component family provides conditional rendering:

```html
<!-- Basic usage -->
<if(condition)>
  <!-- Content to show when condition is true -->
</if>

<!-- With else clause -->
<if(state.isLoggedIn)>
  <user-dashboard/>
</if>
<else>
  <login-form/>
</else>

<!-- Complete if/else-if/else chain -->
<if(state.status === 'loading')>
  <loading-spinner/>
</if>
<else-if(state.status === 'error')>
  <error-message error={state.error}/>
</else-if>
<else-if(state.status === 'empty')>
  <empty-state message="No data found"/>
</else-if>
<else>
  <data-display data={state.data}/>
</else>

<!-- Alternative syntax with @by attribute -->
<if @by="state.isAdmin">
  <admin-panel/>
</if>
```

#### Implementation Details

The `if` component only renders its content when the condition evaluates to a truthy value. When used with `else-if` and `else`, only one branch will be rendered at a time.

### `<for>`

The `for` component provides list rendering with several iteration modes:

```html
<!-- Array iteration -->
<for [item] in=state.items>
  <div>{item.name}</div>
</for>

<!-- With index -->
<for [item, index] in=state.items>
  <div>#{index + 1}: {item.name}</div>
</for>

<!-- Object iteration -->
<for [key, value] in=state.user>
  <div>{key}: {value}</div>
</for>

<!-- Map iteration -->
<for [key, value, index] in=state.dataMap>
  <div>Entry {index}: {key} = {value}</div>
</for>

<!-- Numeric range -->
<for [num] from=1 to=5>
  <div>Item {num}</div>
</for>
```

#### Implementation Details

The `for` component uses optimized rendering that only updates items that have changed, rather than re-rendering the entire list. This provides better performance for large lists or frequently changing data.

For array iterations, you can access:
- The item value as the first argument
- The index as the second argument (optional)

For object iterations, you can access:
- The key as the first argument
- The value as the second argument
- The index as the third argument (optional)

For range iterations, you specify:
- A variable name as the argument
- A `from` value (inclusive)
- A `to` value (inclusive)

### `<switch>`, `<case>`

The `switch` component provides an alternative to multiple if/else-if chains:

```html
<!-- Basic usage -->
<switch(state.role)>
  <case is="admin">
    <admin-panel/>
  </case>
  <case is="editor">
    <editor-panel/>
  </case>
  <case is="viewer">
    <viewer-panel/>
  </case>
  <default>
    <guest-panel/>
  </default>
</switch>

<!-- Multiple values per case -->
<switch(state.status)>
  <case is={['loading', 'processing']}>
    <loading-spinner/>
  </case>
  <case is={['error', 'failed']}>
    <error-message/>
  </case>
  <default>
    <content-view/>
  </default>
</switch>

<!-- Alternative syntax with @by attribute -->
<switch @by="state.role">
  <case is="admin">
    <admin-panel/>
  </case>
  <!-- Other cases... -->
</switch>
```

#### Implementation Details

The `switch` component evaluates the expression and renders the first `case` that matches the result. If no case matches, it renders the `default` component if provided.

Each `case` can accept:
- A single value (`is="value"`)
- An array of values (`is={['value1', 'value2']}`)

### `<async>`, `<then>`, `<catch>`

The `async` component helps manage asynchronous operations:

```html
<!-- Basic usage -->
<async await(fetchData)>
  <loading>
    <p>Loading data...</p>
  </loading>
  <then [response]>
    <div>
      <h2>Data Loaded</h2>
      <pre>{JSON.stringify(response, null, 2)}</pre>
    </div>
  </then>
  <catch [error]>
    <div class="error">
      <h2>Error</h2>
      <p>{error.message}</p>
    </div>
  </catch>
</async>

<!-- With parameters -->
<async await(fetchUserData, state.userId)>
  <!-- Content... -->
</async>

<!-- With function expression -->
<async await(() => api.getUser(state.userId))>
  <!-- Content... -->
</async>
```

#### Implementation Details

The `async` component manages the lifecycle of asynchronous operations:

1. It initially renders the `loading` component (if provided)
2. It executes the provided function and awaits its result
3. On success, it renders the `then` component with the result value
4. On error, it renders the `catch` component with the error object

The `then` component receives the resolved value as its first argument, and the `catch` component receives the error as its first argument.

### `<router>`

The `router` component provides client-side routing capabilities:

```html
<!-- Basic usage -->
<router routes=static.routes/>

<!-- With global flag (affects browser URL) -->
<router 
  routes=static.routes 
  global
/>

<!-- With events -->
<router
  routes=static.routes
  global
  on-after(handleRouteChange)
  on-before(handleBeforeNavigate)
  on-not-found(handleNotFound)
/>

<!-- Routes definition example -->
export const _static = {
  routes: [
    { path: '/', template: Home, default: true },
    { path: '/about', template: About },
    { path: '/users', template: UserList },
    { path: '/users/:id', template: UserDetail },
    { path: '/blog/:category/:slug', template: BlogPost }
  ]
};
```

#### Implementation Details

The `router` component:
- Matches the current URL against the provided routes
- Renders the template of the matching route
- Passes route parameters to the template
- Provides navigation methods via context

Route paths can include dynamic segments marked with a colon (`:id`) which become available as parameters in the rendered component.

When using the `global` flag, the router will:
- Update the browser URL when navigating
- Listen for browser history changes
- Provide a `navigate` function in the global context

The router provides several event hooks:
- `on-before`: Called before navigation occurs
- `on-after`: Called after navigation completes
- `on-not-found`: Called when no route matches the URL

### `<let>` and `<const>`

The `let` and `const` components allow you to declare variables in your templates:

```html
<!-- Basic usage -->
<let count=5/>
<p>Count: {count}</p>

<!-- With expressions -->
<let total={price * quantity}/>
<p>Total: ${total}</p>

<!-- Multiple variables -->
<let
  subtotal={price * quantity}
  tax={subtotal * 0.07}
  total={subtotal + tax}
/>
<p>Subtotal: ${subtotal}</p>
<p>Tax: ${tax}</p>
<p>Total: ${total}</p>

<!-- Spread operator -->
<let ...self.calculateTotals()/>

<!-- Constant variables (cannot be reassigned) -->
<const
  TAX_RATE=0.07
  SHIPPING=10
/>
<p>Tax: ${subtotal * TAX_RATE}</p>
<p>Shipping: ${SHIPPING}</p>
```

#### Implementation Details

The `let` component declares mutable variables that can be used in subsequent template code. These variables:
- Are reactive and update when their dependencies change
- Are scoped to the current template context
- Are available to child components

The `const` component declares immutable variables that cannot be reassigned. They're useful for constants and configuration values.

Both components support:
- Literal values
- Expressions
- The spread operator to unfold object properties into variables

### `<log>`

The `log` component allows you to log values during template rendering:

```html
<!-- Basic usage -->
<log(state.user)/>

<!-- With multiple values -->
<log('User data:', state.user, 'Permissions:', state.permissions)/>

<!-- With expression -->
<log(state.items.length > 0 ? 'Items found' : 'No items')/>
```

#### Implementation Details

The `log` component calls `console.log` with the provided arguments during template rendering. It's a helpful utility for debugging without adding any visible elements to the UI.

Using these built-in components, you can handle common UI patterns with declarative syntax rather than writing imperative code. They form the foundation of Lips applications and make complex UIs easier to build and maintain.

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
        <input value={value} required={isRequired} />
      </div>
    </macro>
  `,
  
  default: `
    <div>
      <button icon="save" text="Save Changes" onClick={handleSave} />
      <button icon="cancel" text="Cancel" onClick={handleCancel} />
      
      <form-field label="Name" value={state.name} isRequired={true} />
      <form-field label="Email" value={state.email} isRequired={true} />
      <form-field label="Phone" value={state.phone} isRequired={false} />
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
  age={42}
  bio="Software developer"
  address="123 Main St"
/>
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
        <button class={state.filter === 'all' ? 'active' : ''} on-click={() => state.filter = 'all'}>All</button>
        <button class={state.filter === 'active' ? 'active' : ''} on-click={() => state.filter = 'active'}>Active</button>
        <button class={state.filter === 'completed' ? 'active' : ''} on-click={() => state.filter = 'completed'}>Completed</button>
      </div>
      
      <!-- Todo list -->
      <ul>
        <for [todo] in={self.getFilteredTodos()}>
          <li class={todo.completed ? 'completed' : ''}>
            <input type="checkbox" checked={todo.completed} on-change={() => self.toggleTodo(todo.id)} />
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

You can also explicitly batch updates:

```javascript
import { batch } from 'lips';

batch(() => {
  this.state.count++;
  this.state.message = 'Updated';
  this.state.lastUpdated = new Date();
});
```

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
import { memo } from 'lips';

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
  <item-card item={item} key={item.id} />
</for>
```

The `key` attribute helps Lips identify which components to preserve when arrays are reordered.

#### Signal API

For more control over reactivity, Lips provides a low-level Signal API:

```javascript
import { signal, effect } from 'lips';

// Create a signal with initial value
const [getCount, setCount] = signal(0);

// Create an effect that runs when the signal changes
const { dispose } = effect(() => {
  console.log('Count changed:', getCount());
});

// Update the signal
setCount(1); // Logs: "Count changed: 1"

// Clean up the effect
dispose();
```

### Fine-Grained Updates

Lips' Fine-Grained Updates (FGU) system is a core performance feature that deserves a deeper look.

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

#### Performance API Integration

Lips integrates with the browser's Performance API for more detailed measurements:

```javascript
const component = {
  handler: {
    onMount() {
      // Mark the start of a critical operation
      performance.mark('operation-start');
      
      // Perform operation
      this.processBigData();
      
      // Mark the end
      performance.mark('operation-end');
      
      // Measure and log
      performance.measure('operation', 'operation-start', 'operation-end');
      console.log(performance.getEntriesByName('operation')[0].duration);
      
      // Clear marks
      performance.clearMarks();
    }
  }
};
```

These advanced features make Lips not just powerful and flexible, but also highly performant for complex applications. The combination of fine-grained reactivity, efficient batching, and built-in performance tools helps you build fast, responsive UIs without sacrificing developer experience.

## Styling

Lips provides a flexible and powerful styling system that allows you to create scoped styles for components, manage global styles, and dynamically adjust styles based on state.

### Component Styling

Each component can define its own scoped styles using the `stylesheet` property:

```javascript
// Object style
const component = {
  default: `
    <div class="card">
      <h2 class="card-title">{state.title}</h2>
      <div class="card-content">{state.content}</div>
    </div>
  `,
  
  stylesheet: `
    .card {
      border: 1px solid #eee;
      border-radius: 4px;
      padding: 1rem;
      margin-bottom: 1rem;
    }
    
    .card-title {
      font-size: 1.2rem;
      margin-bottom: 0.5rem;
      color: #333;
    }
    
    .card-content {
      color: #666;
    }
  `
};

// ES Module style
export const stylesheet = `
  .card {
    border: 1px solid #eee;
    border-radius: 4px;
    padding: 1rem;
    margin-bottom: 1rem;
  }
  
  .card-title {
    font-size: 1.2rem;
    margin-bottom: 0.5rem;
    color: #333;
  }
  
  .card-content {
    color: #666;
  }
`;
```

#### Scoped Styles

Lips automatically scopes component styles to prevent them from affecting other parts of the application. This is done by adding a unique attribute to component elements and using CSS attribute selectors:

```html
<!-- Rendered HTML -->
<div rel="card" class="card">
  <h2 rel="card" class="card-title">Card Title</h2>
  <div rel="card" class="card-content">Card content goes here...</div>
</div>
```

```css
/* Compiled CSS */
[rel="card"] .card {
  border: 1px solid #eee;
  border-radius: 4px;
  padding: 1rem;
  margin-bottom: 1rem;
}

[rel="card"] .card-title {
  font-size: 1.2rem;
  margin-bottom: 0.5rem;
  color: #333;
}

[rel="card"] .card-content {
  color: #666;
}
```

This scoping ensures that styles from one component don't leak into other components, even if they use the same class names.

### Dynamic Styling

Lips makes it easy to apply dynamic styles based on component state:

```html
<!-- Class binding -->
<div class="item {state.isActive ? 'active' : ''}">
  Item Content
</div>

<!-- Style object binding -->
<div style="{ 
  color: state.textColor, 
  backgroundColor: state.bgColor,
  fontSize: state.fontSize + 'px'
}">
  Styled Text
</div>

<!-- Inline style binding -->
<div style="color: {state.textColor}; background-color: {state.bgColor};">
  Styled Text
</div>

<!-- Conditional attribute -->
<button disabled={!state.isValid}>Submit</button>
```

You can also compute styles in methods:

```javascript
const component = {
  state: {
    importance: 'high'
  },
  
  handler: {
    getImportanceStyle() {
      switch (this.state.importance) {
        case 'high':
          return { color: 'red', fontWeight: 'bold' };
        case 'medium':
          return { color: 'orange' };
        default:
          return { color: 'green' };
      }
    }
  },
  
  default: `
    <div style={self.getImportanceStyle()}>
      Important notice
    </div>
  `
};
```

### Stylesheet API

For more advanced styling needs, Lips provides a Stylesheet API.

#### Component Stylesheet Management

Each component has a `__stylesheet__` property that provides methods for managing styles:

```javascript
const component = {
  handler: {
    onMount() {
      // Get the component's stylesheet
      const stylesheet = this.__stylesheet__;
      
      // Load additional styles dynamically
      stylesheet.load({
        sheet: `
          .dynamic-content {
            animation: fadeIn 0.3s ease-in;
          }
          
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `
      });
    },
    
    onDetach() {
      // Clean up styles when component is removed
      this.__stylesheet__.clear();
    }
  }
};
```

#### Global Styles

You can define global styles for the root component:

```javascript
const app = {
  // Component styles (scoped)
  stylesheet: `
    .app-container {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
  `
};

// Initialize with global styles
const lips = new Lips({
  styles: {
    global: `
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      
      body {
        font-family: sans-serif;
        line-height: 1.6;
        color: #333;
      }
      
      a {
        color: #0066cc;
        text-decoration: none;
      }
      
      a:hover {
        text-decoration: underline;
      }
    `
  }
});

// Render the app
lips.root(app, '#app');
```

#### CSS Custom Properties

Lips makes it easy to use CSS custom properties (variables) for theming:

```javascript
const app = {
  stylesheet: `
    :root {
      --primary-color: #4a5bf7;
      --secondary-color: #f7564a;
      --text-color: #333;
      --background-color: #fff;
    }
    
    /* Dark theme */
    .dark-theme {
      --primary-color: #6979ff;
      --secondary-color: #ff7979;
      --text-color: #eee;
      --background-color: #222;
    }
    
    .app {
      color: var(--text-color);
      background-color: var(--background-color);
    }
    
    .button {
      background-color: var(--primary-color);
      color: white;
    }
  `,
  
  state: {
    darkMode: false
  },
  
  default: `
    <div class="app {state.darkMode ? 'dark-theme' : ''}">
      <!-- App content -->
      <button on-click={() => state.darkMode = !state.darkMode}>
        Toggle Theme
      </button>
    </div>
  `
};
```

### Style Preprocessing

Lips includes the Stylis CSS preprocessor, giving you access to nesting and other CSS preprocessing features:

```javascript
const component = {
  stylesheet: `
    .card {
      border: 1px solid #eee;
      border-radius: 4px;
      padding: 1rem;
      
      /* Nesting */
      .card-title {
        font-size: 1.2rem;
        margin-bottom: 0.5rem;
        
        /* More nesting */
        &.highlighted {
          color: #4a5bf7;
        }
      }
      
      .card-content {
        color: #666;
      }
      
      /* State variations */
      &.active {
        border-color: #4a5bf7;
      }
      
      &:hover {
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      }
    }
    
    /* Media queries */
    @media (max-width: 768px) {
      .card {
        padding: 0.5rem;
      }
    }
  `
};
```

### External Stylesheets

For larger applications, you may want to keep styles in separate files:

```javascript
// Import styles from a CSS file
import cardStyles from './styles/card.css';

const Card = {
  stylesheet: cardStyles,
  
  default: `
    <div class="card">
      <!-- Card content -->
    </div>
  `
};
```

### Style Encapsulation

Lips' styling system ensures that component styles don't leak into other components, while still giving you the flexibility to define global styles when needed. This helps you maintain a clean and organized codebase, especially in larger applications.

## Internationalization (i18n)

Lips includes built-in support for internationalization, making it easy to create multilingual applications.

### Setting up Languages

Initialize Lips with a default language and set up dictionaries for each supported language:

```javascript
// Create dictionaries for each language
const englishDictionary = {
  'Welcome': 'Welcome',
  'Hello, {name}': 'Hello, {name}',
  'items_count': '{count} items',
  'submit_button': 'Submit'
};

const frenchDictionary = {
  'Welcome': 'Bienvenue',
  'Hello, {name}': 'Bonjour, {name}',
  'items_count': '{count} éléments',
  'submit_button': 'Soumettre'
};

const spanishDictionary = {
  'Welcome': 'Bienvenido',
  'Hello, {name}': 'Hola, {name}',
  'items_count': '{count} elementos',
  'submit_button': 'Enviar'
};

// Initialize Lips with i18n support
const lips = new Lips({ debug: true });

// Set dictionaries
lips.i18n.setDictionary('en', englishDictionary);
lips.i18n.setDictionary('fr', frenchDictionary);
lips.i18n.setDictionary('es', spanishDictionary);
```

### Changing Languages

You can change the current language at any time:

```javascript
// Switch to French
lips.language('fr');

// Switch to Spanish
lips.language('es-ES');

// Switch back to English
lips.language('en');
```

When the language changes, all components that display translated content will automatically update.

### Using Translations

Translations are automatically applied to text content in your templates:

```html
<h1>Welcome</h1>
<p>Hello, {state.name}</p>
<span>{state.items.length} items</span>
<button>Submit</button>
```

If the current language is French, this would render as:

```html
<h1>Bienvenue</h1>
<p>Bonjour, John</p>
<span>5 éléments</span>
<button>Soumettre</button>
```

### Translation with Variables

You can include variables in translation strings:

```javascript
// Dictionary entry
{
  'items_count': '{count} items|{count} item|No items',
  'welcome_user': 'Welcome back, {name}!'
}

// Template usage
<p>items_count.format({ count: state.items.length })</p>
<p>welcome_user.format({ name: state.user.name })</p>
```

### Handling Plurals

You can define different translations based on numeric values:

```javascript
// Dictionary entry with plural forms
{
  'items_count': {
    '*': '{count} items',    // Default (plurals)
    '1': '{count} item',     // Exactly 1
    '0': 'No items'          // Zero
  }
}

// Template usage
<p>items_count.format({ count: state.items.length })</p>
```

### Language Variants

You can define variants for regional differences:

```javascript
const englishDictionary = {
  'color': {
    '*': 'color',      // Default (US English)
    'GB': 'colour',    // British English
    'CA': 'colour'     // Canadian English
  }
};

// Set the dictionary
lips.i18n.setDictionary('en', englishDictionary);

// Switch to British English
lips.language('en-GB');
```

### Excluding Content from Translation

Sometimes you may want to exclude specific content from translation:

```html
<div no-translate>This text will not be translated</div>

<div>
  <span no-translate>Untranslated</span>
  <span>Translated</span>
</div>
```

### Manual Translation

You can also use the translation API directly:

```javascript
const component = {
  handler: {
    getLocalizedMessage(key, params) {
      const { text } = this.lips.i18n.translate(key);
      
      // Replace parameters
      return text.replace(/{(\w+)}/g, (_, name) => params[name] || '');
    }
  },
  
  default: `
    <div>
      <p>{self.getLocalizedMessage('welcome_user', { name: state.user.name })}</p>
    </div>
  `
};
```

The built-in i18n support makes it easy to create multilingual applications with Lips, without requiring external libraries or complex setup.

## Best Practices

Following these best practices will help you build efficient, maintainable, and scalable applications with Lips.

### Component Design

#### Keep Components Focused

Components should have a single responsibility. Instead of creating large, complex components, break them down into smaller, more focused ones:

```javascript
// Instead of one large component
const userDashboard = {
  default: `
    <div>
      <header><!-- Complex header --></header>
      <sidebar><!-- Complex sidebar --></sidebar>
      <main><!-- Complex content --></main>
    </div>
  `
};

// Break it into smaller components
const header = { /* ... */ };
const sidebar = { /* ... */ };
const content = { /* ... */ };

const userDashboard = {
  default: `
    <div>
      <app-header/>
      <app-sidebar/>
      <main-content/>
    </div>
  `
};
```

#### Use Proper Data Flow

Follow a unidirectional data flow pattern:
- Pass data down to child components via inputs (props)
- Communicate up to parent components via events
- Use context for global state that many components need

```javascript
// Parent component passing data down
const parent = {
  state: {
    user: { id: 1, name: 'John' }
  },
  
  handler: {
    handleUserUpdate(updatedUser) {
      // Update state when child emits event
      this.state.user = updatedUser;
    }
  },
  
  default: `
    <div>
      <user-profile 
        user={state.user} 
        on-update={handleUserUpdate}
      />
    </div>
  `
};

// Child component receiving data and emitting events
const userProfile = {
  handler: {
    saveChanges() {
      // Emit event to parent
      this.emit('update', {
        ...this.input.user,
        name: this.state.editedName
      });
    }
  }
};
```

#### Separate Logic from Templates

Keep complex logic in handler methods rather than embedding it in templates:

```javascript
// Avoid complex logic in templates
const badComponent = {
  default: `
    <div>
      <ul>
        <for [item] in={state.items.filter(item => 
          item.category === state.selectedCategory && 
          item.price > state.minPrice && 
          !item.isHidden
        )}>
          <li>{item.name}</li>
        </for>
      </ul>
    </div>
  `
};

// Better: Move logic to handler methods
const goodComponent = {
  handler: {
    getFilteredItems() {
      return this.state.items.filter(item => 
        item.category === this.state.selectedCategory && 
        item.price > this.state.minPrice && 
        !item.isHidden
      );
    }
  },
  
  default: `
    <div>
      <ul>
        <for [item] in={self.getFilteredItems()}>
          <li>{item.name}</li>
        </for>
      </ul>
    </div>
  `
};
```

### Performance Tips

#### Use Keys for Lists

When rendering lists, always use a unique key for each item:

```html
<!-- Without keys (less efficient) -->
<for [item] in=state.items>
  <item-component item={item} />
</for>

<!-- With keys (more efficient) -->
<for [item] in=state.items>
  <item-component item={item} key={item.id} />
</for>
```

Keys help Lips efficiently update lists when items are added, removed, or reordered.

#### Optimize Renders

Avoid unnecessary re-renders by structuring your state carefully:

```javascript
// Less efficient: Entire list re-renders when filter changes
const lessEfficient = {
  state: {
    items: [],
    filter: 'all'
  },
  
  default: `
    <div>
      <button on-click={() => state.filter = 'all'}>All</button>
      <button on-click={() => state.filter = 'active'}>Active</button>
      
      <ul>
        <for [item] in={state.items.filter(i => 
          state.filter === 'all' || i.status === state.filter
        )}>
          <li>{item.name}</li>
        </for>
      </ul>
    </div>
  `
};

// More efficient: Filter logic in handler method
const moreEfficient = {
  state: {
    items: [],
    filter: 'all'
  },
  
  handler: {
    getFilteredItems() {
      if (this.state.filter === 'all') {
        return this.state.items;
      }
      return this.state.items.filter(i => i.status === this.state.filter);
    }
  },
  
  default: `
    <div>
      <button on-click={() => state.filter = 'all'}>All</button>
      <button on-click={() => state.filter = 'active'}>Active</button>
      
      <ul>
        <for [item] in={self.getFilteredItems()}>
          <li>{item.name}</li>
        </for>
      </ul>
    </div>
  `
};
```

#### Batch Updates

For multiple state changes, batch them together:

```javascript
import { batch } from 'lips';

// Without batching (triggers multiple updates)
updateUserData() {
  this.state.user.name = 'John';
  this.state.user.email = 'john@example.com';
  this.state.lastUpdated = new Date();
}

// With batching (triggers a single update)
updateUserData() {
  batch(() => {
    this.state.user.name = 'John';
    this.state.user.email = 'john@example.com';
    this.state.lastUpdated = new Date();
  });
}
```

#### Use Static Properties for Constants

For values that don't change, use static properties instead of state:

```javascript
// Less efficient: Constants in state
const lessEfficient = {
  state: {
    items: [],
    pageSize: 10,      // Doesn't change
    maxItems: 100,     // Doesn't change
    validCategories: ['A', 'B', 'C']  // Doesn't change
  }
};

// More efficient: Constants in static
const moreEfficient = {
  state: {
    items: []      // Only reactive data in state
  },
  
  _static: {
    pageSize: 10,
    maxItems: 100,
    validCategories: ['A', 'B', 'C']
  }
};
```

#### Reuse Component Instances

When possible, update existing component instances rather than destroying and recreating them:

```javascript
const component = {
  handler: {
    switchView() {
      // Instead of:
      // this.state.view = newViewComponent;
      
      // Update inputs to existing component:
      this.state.viewProps = newViewProps;
    }
  },
  
  default: `
    <div>
      <{state.currentView} ...state.viewProps />
    </div>
  `
};
```

### Error Handling

#### Component-Level Error Handling

Use lifecycle methods to handle errors within components:

```javascript
const component = {
  handler: {
    onMount() {
      try {
        this.loadData();
      } catch (error) {
        this.state.error = error.message;
        this.state.status = 'error';
      }
    },
    
    async loadData() {
      try {
        this.state.status = 'loading';
        const response = await fetch('/api/data');
        
        if (!response.ok) {
          throw new Error('Failed to load data');
        }
        
        this.state.data = await response.json();
        this.state.status = 'success';
      } catch (error) {
        this.state.error = error.message;
        this.state.status = 'error';
        
        // Log to monitoring system
        this.logError(error);
      }
    },
    
    logError(error) {
      console.error('Component error:', error);
      // Send to error tracking service
    }
  }
};
```

#### Fallback UI for Errors

Provide graceful fallbacks when errors occur:

```html
<if(state.status === 'loading')>
  <loading-spinner/>
</if>
<else-if(state.status === 'error')>
  <error-message 
    message={state.error}
    on-retry={handleRetry}
  />
</else-if>
<else>
  <data-display data={state.data}/>
</else>
```

#### Async Component Error Handling

Use the `async` component to handle asynchronous errors:

```html
<async await(fetchUserData, state.userId)>
  <loading>
    <loading-spinner/>
  </loading>
  <then [user]>
    <user-profile user={user}/>
  </then>
  <catch [error]>
    <error-message message={error.message}/>
  </catch>
</async>
```

### Code Organization

#### Modular File Structure

Organize your code into logical modules:

```
src/
├── components/
│   ├── common/
│   │   ├── Button.js
│   │   ├── Card.js
│   │   └── Input.js
│   ├── layout/
│   │   ├── Header.js
│   │   ├── Sidebar.js
│   │   └── Footer.js
│   └── features/
│       ├── user/
│       │   ├── UserProfile.js
│       │   └── UserSettings.js
│       └── products/
│           ├── ProductList.js
│           └── ProductDetail.js
├── services/
│   ├── api.js
│   └── auth.js
├── styles/
│   ├── theme.js
│   └── global.css
└── app.js
```

#### Component Composition

Build complex UIs by composing smaller components:

```javascript
// Button component
export const Button = {
  default: `<button class="btn {input.variant}">{input.children}</button>`,
  stylesheet: `/* Button styles */`
};

// Card component
export const Card = {
  default: `
    <div class="card">
      <if(input.title)>
        <div class="card-header">{input.title}</div>
      </if>
      <div class="card-body">{input.children}</div>
    </div>
  `,
  stylesheet: `/* Card styles */`
};

// Feature component using both
export const UserCard = {
  default: `
    <card title="User Profile">
      <div class="user-info">
        <h3>{input.user.name}</h3>
        <p>{input.user.email}</p>
      </div>
      <button variant="primary" on-click(handleEdit)>Edit Profile</button>
    </card>
  `,
  
  handler: {
    handleEdit() {
      // Handle edit action
    }
  }
};
```

### TypeScript Integration

Use TypeScript for better type safety and developer experience:

```typescript
// Define component types
interface TodoItem {
  id: number;
  text: string;
  completed: boolean;
}

interface TodoListState {
  todos: TodoItem[];
  filter: 'all' | 'active' | 'completed';
}

interface TodoListInput {
  title?: string;
  initialTodos?: TodoItem[];
}

// Define component with types
export const state: TodoListState = {
  todos: [],
  filter: 'all'
};

export const handler = {
  onInput(input: TodoListInput) {
    if (input.initialTodos) {
      this.state.todos = [...input.initialTodos];
    }
  },
  
  addTodo(text: string): void {
    if (!text.trim()) return;
    
    this.state.todos.push({
      id: Date.now(),
      text,
      completed: false
    });
  },
  
  toggleTodo(id: number): void {
    const todo = this.state.todos.find(t => t.id === id);
    if (todo) {
      todo.completed = !todo.completed;
    }
  },
  
  getFilteredTodos(): TodoItem[] {
    switch (this.state.filter) {
      case 'active':
        return this.state.todos.filter(t => !t.completed);
      case 'completed':
        return this.state.todos.filter(t => t.completed);
      default:
        return this.state.todos;
    }
  }
};

export default `
  <div class="todo-list">
    <h2>{input.title || 'Todo List'}</h2>
    
    <div class="filters">
      <button class={state.filter === 'all' ? 'active' : ''} on-click={() => state.filter = 'all'}>All</button>
      <button class={state.filter === 'active' ? 'active' : ''} on-click={() => state.filter = 'active'}>Active</button>
      <button class={state.filter === 'completed' ? 'active' : ''} on-click={() => state.filter = 'completed'}>Completed</button>
    </div>
    
    <ul>
      <for [todo] in={self.getFilteredTodos()}>
        <li class={todo.completed ? 'completed' : ''}>
          <input 
            type="checkbox" 
            checked={todo.completed} 
            on-change={() => self.toggleTodo(todo.id)} 
          />
          <span>{todo.text}</span>
        </li>
      </for>
    </ul>
  </div>
`;
```

By following these best practices, you'll create Lips applications that are easier to maintain, perform better, and provide a better experience for both developers and users.

## Examples

This section provides real-world examples to help you understand how to use Lips for different scenarios.

### Simple Components

#### Toggle Switch

A reusable toggle switch component:

```javascript
// ToggleSwitch.js
export const state = {
  isOn: false
};

export const handler = {
  onInput(input) {
    // Initialize state from input
    if (input.initialValue !== undefined) {
      this.state.isOn = input.initialValue;
    }
  },
  
  toggle() {
    this.state.isOn = !this.state.isOn;
    this.emit('change', this.state.isOn);
  }
};

export const stylesheet = `
  .toggle {
    position: relative;
    display: inline-block;
    width: 60px;
    height: 34px;
  }
  
  .toggle input {
    opacity: 0;
    width: 0;
    height: 0;
  }
  
  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #ccc;
    transition: .4s;
    border-radius: 34px;
  }
  
  .slider:before {
    position: absolute;
    content: "";
    height: 26px;
    width: 26px;
    left: 4px;
    bottom: 4px;
    background-color: white;
    transition: .4s;
    border-radius: 50%;
  }
  
  input:checked + .slider {
    background-color: #2196F3;
  }
  
  input:checked + .slider:before {
    transform: translateX(26px);
  }
`;

export default `
  <label class="toggle">
    <input type="checkbox" checked={state.isOn} on-change(toggle)>
    <span class="slider"></span>
  </label>
`;

// Usage example
const app = {
  state: {
    darkMode: false,
    notifications: true
  },
  
  handler: {
    handleDarkModeChange(isOn) {
      this.state.darkMode = isOn;
      document.body.classList.toggle('dark-theme', isOn);
    },
    
    handleNotificationsChange(isOn) {
      this.state.notifications = isOn;
    }
  },
  
  default: `
    <div>
      <div class="setting">
        <span>Dark Mode</span>
        <toggle-switch 
          initialValue={state.darkMode} 
          on-change(handleDarkModeChange)
        />
      </div>
      
      <div class="setting">
        <span>Notifications</span>
        <toggle-switch 
          initialValue={state.notifications} 
          on-change(handleNotificationsChange)
        />
      </div>
    </div>
  `
};
```

#### Tabs Component

A reusable tabs component:

```javascript
// Tabs.js
export const state = {
  activeTab: 0
};

export const handler = {
  onInput(input) {
    if (input.defaultTab !== undefined) {
      this.state.activeTab = input.defaultTab;
    }
  },
  
  setActiveTab(index) {
    this.state.activeTab = index;
    this.emit('change', index);
  }
};

export const stylesheet = `
  .tabs {
    border-bottom: 1px solid #ccc;
  }
  
  .tab-list {
    display: flex;
    list-style: none;
    padding: 0;
    margin: 0;
  }
  
  .tab {
    padding: 10px 15px;
    cursor: pointer;
    border-bottom: 2px solid transparent;
  }
  
  .tab.active {
    border-bottom-color: #2196F3;
    font-weight: bold;
  }
  
  .tab-content {
    padding: 15px 0;
  }
`;

export default `
  <div class="tabs-component">
    <div class="tabs">
      <ul class="tab-list">
        <for [tab, index] in=input.tabs>
          <li 
            class="tab {index === state.activeTab ? 'active' : ''}"
            on-click(() => self.setActiveTab(index))
          >
            {tab.label}
          </li>
        </for>
      </ul>
    </div>
    
    <div class="tab-content">
      <for [tab, index] in=input.tabs>
        <if(index === state.activeTab)>
          <div class="tab-pane">
            <{tab.component} ...tab.props />
          </div>
        </if>
      </for>
    </div>
  </div>
`;

// Usage example
const app = {
  _static: {
    tabs: [
      {
        label: 'Profile',
        component: 'user-profile',
        props: { userId: 123 }
      },
      {
        label: 'Settings',
        component: 'user-settings',
        props: { userId: 123 }
      },
      {
        label: 'Activity',
        component: 'user-activity',
        props: { userId: 123 }
      }
    ]
  },
  
  default: `
    <div class="user-dashboard">
      <h1>User Dashboard</h1>
      <tabs tabs={static.tabs} defaultTab={0} />
    </div>
  `
};
```

### Complex Applications

#### Todo Application

A complete todo application with filtering, adding, and completing tasks:

```javascript
// TodoApp.js
export const state = {
  newTodo: '',
  todos: [
    { id: 1, text: 'Learn Lips', completed: false },
    { id: 2, text: 'Build a todo app', completed: true }
  ],
  filter: 'all'
};

export const handler = {
  addTodo(e) {
    e.preventDefault();
    
    if (!this.state.newTodo.trim()) return;
    
    this.state.todos.push({
      id: Date.now(),
      text: this.state.newTodo,
      completed: false
    });
    
    this.state.newTodo = '';
  },
  
  toggleTodo(id) {
    const todo = this.state.todos.find(t => t.id === id);
    if (todo) {
      todo.completed = !todo.completed;
    }
  },
  
  removeTodo(id) {
    this.state.todos = this.state.todos.filter(t => t.id !== id);
  },
  
  clearCompleted() {
    this.state.todos = this.state.todos.filter(t => !t.completed);
  },
  
  updateNewTodo(e) {
    this.state.newTodo = e.target.value;
  },
  
  setFilter(filter) {
    this.state.filter = filter;
  },
  
  getFilteredTodos() {
    switch (this.state.filter) {
      case 'active':
        return this.state.todos.filter(t => !t.completed);
      case 'completed':
        return this.state.todos.filter(t => t.completed);
      default:
        return this.state.todos;
    }
  },
  
  getActiveTodoCount() {
    return this.state.todos.filter(t => !t.completed).length;
  },
  
  getCompletedTodoCount() {
    return this.state.todos.filter(t => t.completed).length;
  }
};

export const stylesheet = `
  .todo-app {
    max-width: 500px;
    margin: 0 auto;
    padding: 20px;
    font-family: Arial, sans-serif;
  }
  
  .todo-form {
    display: flex;
    margin-bottom: 20px;
  }
  
  .todo-input {
    flex: 1;
    padding: 10px;
    font-size: 16px;
    border: 1px solid #ddd;
    border-radius: 4px 0 0 4px;
  }
  
  .add-button {
    padding: 10px 15px;
    background-color: #4CAF50;
    color: white;
    border: none;
    border-radius: 0 4px 4px 0;
    cursor: pointer;
  }
  
  .todo-list {
    list-style-type: none;
    padding: 0;
  }
  
  .todo-item {
    display: flex;
    align-items: center;
    padding: 10px;
    border-bottom: 1px solid #eee;
  }
  
  .todo-item.completed span {
    text-decoration: line-through;
    color: #888;
  }
  
  .todo-item span {
    flex: 1;
    margin-left: 10px;
  }
  
  .delete-button {
    background-color: #f44336;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 5px 10px;
    cursor: pointer;
  }
  
  .filters {
    display: flex;
    justify-content: space-between;
    margin-top: 20px;
    padding: 10px 0;
    border-top: 1px solid #eee;
  }
  
  .filter-buttons {
    display: flex;
    gap: 10px;
  }
  
  .filter-button {
    padding: 5px 10px;
    background-color: transparent;
    border: 1px solid #ddd;
    border-radius: 4px;
    cursor: pointer;
  }
  
  .filter-button.active {
    background-color: #2196F3;
    color: white;
    border-color: #2196F3;
  }
  
  .clear-button {
    background-color: transparent;
    border: none;
    color: #888;
    cursor: pointer;
  }
  
  .clear-button:hover {
    text-decoration: underline;
  }
  
  .todo-count {
    margin-right: 10px;
  }
`;

export default `
  <div class="todo-app">
    <h1>Todo List</h1>
    
    <form class="todo-form" on-submit(addTodo)>
      <input 
        class="todo-input" 
        type="text" 
        placeholder="What needs to be done?"
        value={state.newTodo}
        on-input(updateNewTodo)
      />
      <button class="add-button" type="submit">Add</button>
    </form>
    
    <if(state.todos.length > 0)>
      <ul class="todo-list">
        <for [todo] in={self.getFilteredTodos()}>
          <li class="todo-item {todo.completed ? 'completed' : ''}">
            <input 
              type="checkbox" 
              checked={todo.completed} 
              on-change(() => self.toggleTodo(todo.id))
            />
            <span>{todo.text}</span>
            <button 
              class="delete-button"
              on-click(() => self.removeTodo(todo.id))
            >
              Delete
            </button>
          </li>
        </for>
      </ul>
      
      <div class="filters">
        <span class="todo-count">
          {self.getActiveTodoCount()} items left
        </span>
        
        <div class="filter-buttons">
          <button 
            class="filter-button {state.filter === 'all' ? 'active' : ''}"
            on-click={() => self.setFilter('all')}
          >
            All
          </button>
          <button 
            class="filter-button {state.filter === 'active' ? 'active' : ''}"
            on-click={() => self.setFilter('active')}
          >
            Active
          </button>
          <button 
            class="filter-button {state.filter === 'completed' ? 'active' : ''}"
            on-click={() => self.setFilter('completed')}
          >
            Completed
          </button>
        </div>
        
        <if(self.getCompletedTodoCount() > 0)>
          <button class="clear-button" on-click(clearCompleted)>
            Clear completed
          </button>
        </if>
      </div>
    </if>
    <else>
      <p>No todos yet. Add some!</p>
    </else>
  </div>
`;
```

#### Data Dashboard

A data visualization dashboard with charts:

```javascript
// Dashboard.js
export const state = {
  data: null,
  loading: true,
  error: null,
  interval: null,
  selectedMetric: 'users',
  timeRange: 'week'
};

export const handler = {
  async onMount() {
    try {
      await this.fetchData();
      
      // Set up auto-refresh
      this.state.interval = setInterval(() => {
        this.fetchData();
      }, 60000); // Refresh every minute
    } catch (error) {
      this.state.error = error.message;
    } finally {
      this.state.loading = false;
    }
  },
  
  onDetach() {
    // Clear interval when component is removed
    if (this.state.interval) {
      clearInterval(this.state.interval);
    }
  },
  
  async fetchData() {
    try {
      this.state.loading = true;
      
      const response = await fetch(`/api/metrics?range=${this.state.timeRange}`);
      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }
      
      this.state.data = await response.json();
      this.state.error = null;
    } catch (error) {
      this.state.error = error.message;
    } finally {
      this.state.loading = false;
    }
  },
  
  setTimeRange(range) {
    this.state.timeRange = range;
    this.fetchData();
  },
  
  setSelectedMetric(metric) {
    this.state.selectedMetric = metric;
  },
  
  getChartData() {
    if (!this.state.data) return null;
    
    return {
      labels: this.state.data.timestamps,
      datasets: [
        {
          label: this.state.selectedMetric.toUpperCase(),
          data: this.state.data[this.state.selectedMetric],
          fill: false,
          borderColor: '#2196F3',
          tension: 0.1
        }
      ]
    };
  },
  
  getSummaryStats() {
    if (!this.state.data) return null;
    
    const values = this.state.data[this.state.selectedMetric];
    
    return {
      current: values[values.length - 1],
      total: values.reduce((sum, value) => sum + value, 0),
      average: values.reduce((sum, value) => sum + value, 0) / values.length,
      max: Math.max(...values),
      min: Math.min(...values)
    };
  }
};

export const stylesheet = `
  .dashboard {
    padding: 20px;
    font-family: Arial, sans-serif;
  }
  
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }
  
  .controls {
    display: flex;
    gap: 10px;
  }
  
  .metric-selector, .range-selector {
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    background-color: white;
  }
  
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 20px;
    margin-bottom: 20px;
  }
  
  .stat-card {
    padding: 20px;
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
  
  .stat-value {
    font-size: 24px;
    font-weight: bold;
    margin-top: 10px;
  }
  
  .chart-container {
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    padding: 20px;
  }
  
  .loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(255,255,255,0.7);
    display: flex;
    justify-content: center;
    align-items: center;
  }
  
  .error-message {
    color: #f44336;
    padding: 20px;
    text-align: center;
    background-color: #ffebee;
    border-radius: 4px;
    margin-bottom: 20px;
  }
`;

export default `
  <div class="dashboard">
    <div class="header">
      <h1>Analytics Dashboard</h1>
      
      <div class="controls">
        <select 
          class="metric-selector"
          value={state.selectedMetric}
          on-change={e => self.setSelectedMetric(e.target.value)}
        >
          <option value="users">Users</option>
          <option value="pageviews">Pageviews</option>
          <option value="conversions">Conversions</option>
          <option value="revenue">Revenue</option>
        </select>
        
        <select 
          class="range-selector"
          value={state.timeRange}
          on-change={e => self.setTimeRange(e.target.value)}
        >
          <option value="day">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
        </select>
      </div>
    </div>
    
    <if(state.error)>
      <div class="error-message">
        <p>{state.error}</p>
        <button on-click(fetchData)>Retry</button>
      </div>
    </if>
    
    <if(state.data)>
      <div class="card-grid">
        <const stats=self.getSummaryStats()/>
        
        <div class="stat-card">
          <h3>Current</h3>
          <div class="stat-value">{stats.current}</div>
        </div>
        
        <div class="stat-card">
          <h3>Total</h3>
          <div class="stat-value">{stats.total}</div>
        </div>
        
        <div class="stat-card">
          <h3>Average</h3>
          <div class="stat-value">{stats.average.toFixed(2)}</div>
        </div>
        
        <div class="stat-card">
          <h3>Maximum</h3>
          <div class="stat-value">{stats.max}</div>
        </div>
      </div>
      
      <div class="chart-container">
        <h2>{state.selectedMetric.toUpperCase()} over time</h2>
        <line-chart data={self.getChartData()} />
      </div>
    </if>
    
    <if(state.loading)>
      <div class="loading-overlay">
        <loading-spinner/>
      </div>
    </if>
  </div>
`;
```

### Animation Examples

#### Animated Counter

A counter with animated number transitions:

```javascript
// AnimatedCounter.js
export const state = {
  currentValue: 0,
  targetValue: 0,
  animationActive: false
};

export const handler = {
  onInput(input) {
    if (input.value !== undefined) {
      // Initialize with starting value
      this.state.currentValue = input.value;
      this.state.targetValue = input.value;
    }
  },
  
  updateValue(newValue) {
    if (newValue === this.state.targetValue) return;
    
    this.state.targetValue = newValue;
    
    if (!this.state.animationActive) {
      this.animateToTarget();
    }
  },
  
  animateToTarget() {
    if (this.state.currentValue === this.state.targetValue) {
      this.state.animationActive = false;
      return;
    }
    
    this.state.animationActive = true;
    
    // Determine increment direction and speed
    const diff = this.state.targetValue - this.state.currentValue;
    const absDiff = Math.abs(diff);
    
    // Adjust increment based on difference size
    let increment = Math.max(1, Math.floor(absDiff / 20));
    
    // Make sure increment doesn't exceed the difference
    increment = Math.min(absDiff, increment);
    
    // Apply direction
    if (diff < 0) increment = -increment;
    
    // Update current value
    this.state.currentValue += increment;
    
    // Schedule next animation frame
    requestAnimationFrame(() => this.animateToTarget());
  },
  
  formatNumber(num) {
    return num.toLocaleString();
  }
};

export const stylesheet = `
  .counter {
    font-size: 3rem;
    font-weight: bold;
    font-family: sans-serif;
    color: #2196F3;
    text-align: center;
    transition: color 0.3s;
  }
  
  .counter.increasing {
    color: #4CAF50;
  }
  
  .counter.decreasing {
    color: #F44336;
  }
`;

export default `
  <div 
    class="counter {state.currentValue > state.targetValue ? 'decreasing' : 
                      state.currentValue < state.targetValue ? 'increasing' : ''}"
  >
    {self.formatNumber(state.currentValue)}
  </div>
`;

// Usage example
const statsApp = {
  state: {
    userCount: 0,
    viewCount: 0,
    interval: null
  },
  
  handler: {
    onMount() {
      this.fetchStats();
      
      // Update stats every 5 seconds
      this.state.interval = setInterval(() => {
        this.fetchStats();
      }, 5000);
    },
    
    onDetach() {
      clearInterval(this.state.interval);
    },
    
    fetchStats() {
      // Simulate API call
      const newUserCount = Math.floor(Math.random() * 10000);
      const newViewCount = Math.floor(Math.random() * 1000000);
      
      this.state.userCount = newUserCount;
      this.state.viewCount = newViewCount;
    }
  },
  
  default: `
    <div class="stats-dashboard">
      <div class="stat-card">
        <h2>Users</h2>
        <animated-counter value={state.userCount} />
      </div>
      
      <div class="stat-card">
        <h2>Page Views</h2>
        <animated-counter value={state.viewCount} />
      </div>
    </div>
  `
};
```

#### Image Carousel

An animated image carousel:

```javascript
// ImageCarousel.js
export const state = {
  currentIndex: 0,
  isTransitioning: false,
  autoplay: false,
  autoplayInterval: null
};

export const handler = {
  onInput(input) {
    if (input.initialIndex !== undefined) {
      this.state.currentIndex = input.initialIndex;
    }
    
    if (input.autoplay) {
      this.state.autoplay = true;
      this.startAutoplay();
    }
  },
  
  onMount() {
    if (this.state.autoplay) {
      this.startAutoplay();
    }
  },
  
  onDetach() {
    this.stopAutoplay();
  },
  
  startAutoplay() {
    if (this.state.autoplayInterval) return;
    
    this.state.autoplayInterval = setInterval(() => {
      this.next();
    }, 5000); // Change slide every 5 seconds
  },
  
  stopAutoplay() {
    if (this.state.autoplayInterval) {
      clearInterval(this.state.autoplayInterval);
      this.state.autoplayInterval = null;
    }
  },
  
  previous() {
    if (this.state.isTransitioning) return;
    
    const newIndex = this.state.currentIndex === 0 
      ? this.input.images.length - 1 
      : this.state.currentIndex - 1;
      
    this.goToSlide(newIndex);
  },
  
  next() {
    if (this.state.isTransitioning) return;
    
    const newIndex = (this.state.currentIndex + 1) % this.input.images.length;
    this.goToSlide(newIndex);
  },
  
  goToSlide(index) {
    this.state.isTransitioning = true;
    this.state.currentIndex = index;
    
    // Reset transition state after animation completes
    setTimeout(() => {
      this.state.isTransitioning = false;
    }, 500); // Match with CSS transition duration
    
    this.emit('change', index);
  }
};

export const stylesheet = `
  .carousel {
    position: relative;
    width: 100%;
    overflow: hidden;
    border-radius: 8px;
  }
  
  .carousel-track {
    display: flex;
    transition: transform 0.5s ease-in-out;
  }
  
  .carousel-slide {
    min-width: 100%;
    position: relative;
  }
  
  .carousel-image {
    width: 100%;
    display: block;
    height: auto;
  }
  
  .carousel-caption {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background-color: rgba(0, 0, 0, 0.5);
    color: white;
    padding: 15px;
  }
  
  .carousel-controls {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .carousel-button {
    background-color: rgba(0, 0, 0, 0.3);
    color: white;
    border: none;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    font-size: 20px;
    cursor: pointer;
    margin: 0 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.3s;
  }
  
  .carousel-button:hover {
    background-color: rgba(0, 0, 0, 0.6);
  }
  
  .carousel-indicators {
    position: absolute;
    bottom: 10px;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    gap: 8px;
  }
  
  .carousel-indicator {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background-color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    transition: background-color 0.3s;
  }
  
  .carousel-indicator.active {
    background-color: white;
  }
`;

export default `
  <div class="carousel">
    <div 
      class="carousel-track" 
      style="{ transform: 'translateX(-' + (state.currentIndex * 100) + '%)' }"
    >
      <for [image, index] in=input.images>
        <div class="carousel-slide">
          <img 
            class="carousel-image" 
            src=image.src 
            alt=image.alt 
          />
          <if(image.caption)>
            <div class="carousel-caption">{image.caption}</div>
          </if>
        </div>
      </for>
    </div>
    
    <div class="carousel-controls">
      <button 
        class="carousel-button prev" 
        on-click(previous)
        aria-label="Previous slide"
      >
        ‹
      </button>
      
      <button 
        class="carousel-button next" 
        on-click(next)
        aria-label="Next slide"
      >
        ›
      </button>
    </div>
    
    <div class="carousel-indicators">
      <for [_, index] in=input.images>
        <div 
          class="carousel-indicator {index === state.currentIndex ? 'active' : ''}"
          on-click={() => self.goToSlide(index)}
        ></div>
      </for>
    </div>
  </div>
`;
```

### Practical Use Cases

#### Form Validation

A form with validation:

```javascript
// Form.js
export const state = {
  form: {
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  },
  touched: {
    name: false,
    email: false,
    password: false,
    confirmPassword: false
  },
  errors: {},
  isSubmitting: false,
  submitSuccess: false
};

export const handler = {
  updateField(field, value) {
    this.state.form[field] = value;
    this.state.touched[field] = true;
    
    // Validate as user types
    this.validateField(field);
  },
  
  validateField(field) {
    const { form } = this.state;
    const errors = { ...this.state.errors };
    
    switch (field) {
      case 'name':
        if (!form.name.trim()) {
          errors.name = 'Name is required';
        } else if (form.name.length < 2) {
          errors.name = 'Name must be at least 2 characters';
        } else {
          delete errors.name;
        }
        break;
        
      case 'email':
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!form.email.trim()) {
          errors.email = 'Email is required';
        } else if (!emailRegex.test(form.email)) {
          errors.email = 'Please enter a valid email';
        } else {
          delete errors.email;
        }
        break;
        
      case 'password':
        if (!form.password) {
          errors.password = 'Password is required';
        } else if (form.password.length < 8) {
          errors.password = 'Password must be at least 8 characters';
        } else {
          delete errors.password;
        }
        
        // Also validate confirm password if it's been touched
        Let me continue with the Form Validation example that was cut off:

```javascript
      case 'confirmPassword':
        if (!form.confirmPassword) {
          errors.confirmPassword = 'Please confirm your password';
        } else if (form.confirmPassword !== form.password) {
          errors.confirmPassword = 'Passwords do not match';
        } else {
          delete errors.confirmPassword;
        }
        break;
    }
    
    this.state.errors = errors;
    return Object.keys(errors).length === 0;
  },
  
  validateForm() {
    const fields = ['name', 'email', 'password', 'confirmPassword'];
    let isValid = true;
    
    fields.forEach(field => {
      // Mark all fields as touched
      this.state.touched[field] = true;
      
      // Validate each field
      const fieldValid = this.validateField(field);
      isValid = isValid && fieldValid;
    });
    
    return isValid;
  },
  
  async handleSubmit(e) {
    e.preventDefault();
    
    // Validate all fields
    const isValid = this.validateForm();
    
    if (!isValid) {
      return;
    }
    
    try {
      this.state.isSubmitting = true;
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Success state
      this.state.submitSuccess = true;
      this.emit('submit', this.state.form);
      
    } catch (error) {
      this.state.errors.form = 'Failed to submit form. Please try again.';
    } finally {
      this.state.isSubmitting = false;
    }
  },
  
  resetForm() {
    this.state.form = {
      name: '',
      email: '',
      password: '',
      confirmPassword: ''
    };
    this.state.touched = {
      name: false,
      email: false,
      password: false,
      confirmPassword: false
    };
    this.state.errors = {};
    this.state.submitSuccess = false;
  }
};

export const stylesheet = `
  .form-container {
    max-width: 500px;
    margin: 0 auto;
    padding: 20px;
    background-color: #f9f9f9;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  
  .form-group {
    margin-bottom: 20px;
  }
  
  .form-label {
    display: block;
    margin-bottom: 5px;
    font-weight: bold;
  }
  
  .form-input {
    width: 100%;
    padding: 10px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 16px;
  }
  
  .form-input.error {
    border-color: #f44336;
  }
  
  .error-message {
    color: #f44336;
    font-size: 14px;
    margin-top: 5px;
  }
  
  .submit-button {
    width: 100%;
    padding: 12px;
    background-color: #4CAF50;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 16px;
    cursor: pointer;
    transition: background-color 0.3s;
  }
  
  .submit-button:hover {
    background-color: #45a049;
  }
  
  .submit-button:disabled {
    background-color: #cccccc;
    cursor: not-allowed;
  }
  
  .form-success {
    text-align: center;
    padding: 20px;
  }
  
  .form-success h2 {
    color: #4CAF50;
    margin-bottom: 15px;
  }
  
  .reset-button {
    background-color: #2196F3;
    color: white;
    border: none;
    padding: 10px 15px;
    border-radius: 4px;
    cursor: pointer;
  }
`;

export default `
  <div class="form-container">
    <if(state.submitSuccess)>
      <div class="form-success">
        <h2>Registration Successful!</h2>
        <p>Thank you for registering, {state.form.name}!</p>
        <button class="reset-button" on-click(resetForm)>Register Another Account</button>
      </div>
    </if>
    <else>
      <h2>Create an Account</h2>
      
      <form on-submit(handleSubmit)>
        <div class="form-group">
          <label class="form-label" for="name">Name</label>
          <input
            id="name"
            class="form-input {state.touched.name && state.errors.name ? 'error' : ''}"
            type="text"
            value={state.form.name}
            on-input={e => self.updateField('name', e.target.value)}
          />
          <if(state.touched.name && state.errors.name)>
            <div class="error-message">{state.errors.name}</div>
          </if>
        </div>
        
        <div class="form-group">
          <label class="form-label" for="email">Email</label>
          <input
            id="email"
            class="form-input {state.touched.email && state.errors.email ? 'error' : ''}"
            type="email"
            value={state.form.email}
            on-input={e => self.updateField('email', e.target.value)}
          />
          <if(state.touched.email && state.errors.email)>
            <div class="error-message">{state.errors.email}</div>
          </if>
        </div>
        
        <div class="form-group">
          <label class="form-label" for="password">Password</label>
          <input
            id="password"
            class="form-input {state.touched.password && state.errors.password ? 'error' : ''}"
            type="password"
            value={state.form.password}
            on-input={e => self.updateField('password', e.target.value)}
          />
          <if(state.touched.password && state.errors.password)>
            <div class="error-message">{state.errors.password}</div>
          </if>
        </div>
        
        <div class="form-group">
          <label class="form-label" for="confirmPassword">Confirm Password</label>
          <input
            id="confirmPassword"
            class="form-input {state.touched.confirmPassword && state.errors.confirmPassword ? 'error' : ''}"
            type="password"
            value={state.form.confirmPassword}
            on-input={e => self.updateField('confirmPassword', e.target.value)}
          />
          <if(state.touched.confirmPassword && state.errors.confirmPassword)>
            <div class="error-message">{state.errors.confirmPassword}</div>
          </if>
        </div>
        
        <if(state.errors.form)>
          <div class="error-message">{state.errors.form}</div>
        </if>
        
        <button 
          class="submit-button" 
          type="submit"
          disabled={state.isSubmitting}
        >
          {state.isSubmitting ? 'Registering...' : 'Register'}
        </button>
      </form>
    </else>
  </div>
`;
```

#### Data Table with Sorting and Filtering

A reusable data table component:

```javascript
// DataTable.js
export const state = {
  sortField: '',
  sortDirection: 'asc',
  filterText: '',
  currentPage: 1,
  itemsPerPage: 10
};

export const handler = {
  onInput(input) {
    if (input.defaultSort) {
      this.state.sortField = input.defaultSort.field;
      this.state.sortDirection = input.defaultSort.direction || 'asc';
    }
    
    if (input.itemsPerPage) {
      this.state.itemsPerPage = input.itemsPerPage;
    }
  },
  
  sort(field) {
    // If clicking the same field, toggle direction
    if (field === this.state.sortField) {
      this.state.sortDirection = this.state.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.state.sortField = field;
      this.state.sortDirection = 'asc';
    }
    
    this.emit('sort', {
      field: this.state.sortField,
      direction: this.state.sortDirection
    });
  },
  
  updateFilter(e) {
    this.state.filterText = e.target.value;
    this.state.currentPage = 1; // Reset to first page on filter
    
    this.emit('filter', this.state.filterText);
  },
  
  clearFilter() {
    this.state.filterText = '';
    this.emit('filter', '');
  },
  
  setPage(page) {
    this.state.currentPage = page;
    this.emit('page', page);
  },
  
  nextPage() {
    if (this.state.currentPage < this.getTotalPages()) {
      this.setPage(this.state.currentPage + 1);
    }
  },
  
  prevPage() {
    if (this.state.currentPage > 1) {
      this.setPage(this.state.currentPage - 1);
    }
  },
  
  getFilteredData() {
    if (!this.input.data) return [];
    
    let filteredData = [...this.input.data];
    
    // Apply filter
    if (this.state.filterText) {
      const filterLower = this.state.filterText.toLowerCase();
      filteredData = filteredData.filter(item => {
        return Object.values(item).some(value => {
          return String(value).toLowerCase().includes(filterLower);
        });
      });
    }
    
    // Apply sort
    if (this.state.sortField) {
      filteredData.sort((a, b) => {
        let aValue = a[this.state.sortField];
        let bValue = b[this.state.sortField];
        
        // Handle strings and numbers differently
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          aValue = aValue.toLowerCase();
          bValue = bValue.toLowerCase();
        }
        
        if (aValue < bValue) return this.state.sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return this.state.sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }
    
    return filteredData;
  },
  
  getPaginatedData() {
    const filteredData = this.getFilteredData();
    
    // Apply pagination
    const startIndex = (this.state.currentPage - 1) * this.state.itemsPerPage;
    return filteredData.slice(startIndex, startIndex + this.state.itemsPerPage);
  },
  
  getTotalPages() {
    return Math.ceil(this.getFilteredData().length / this.state.itemsPerPage);
  }
};

export const stylesheet = `
  .data-table-container {
    width: 100%;
    overflow-x: auto;
  }
  
  .table-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
  }
  
  .search-container {
    position: relative;
  }
  
  .search-input {
    padding: 8px 30px 8px 10px;
    border: 1px solid #ddd;
    border-radius: 4px;
    width: 200px;
  }
  
  .clear-search {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    border: none;
    background: none;
    cursor: pointer;
    color: #888;
  }
  
  .data-table {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid #ddd;
  }
  
  .data-table th, .data-table td {
    padding: 12px 15px;
    text-align: left;
    border-bottom: 1px solid #ddd;
  }
  
  .data-table th {
    background-color: #f5f5f5;
    font-weight: bold;
    cursor: pointer;
  }
  
  .data-table th:hover {
    background-color: #ebebeb;
  }
  
  .sort-icon {
    margin-left: 5px;
  }
  
  .data-table tr:nth-child(even) {
    background-color: #f9f9f9;
  }
  
  .data-table tr:hover {
    background-color: #f1f1f1;
  }
  
  .pagination {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 15px;
  }
  
  .page-info {
    color: #666;
  }
  
  .page-controls {
    display: flex;
    gap: 5px;
  }
  
  .page-button {
    padding: 5px 10px;
    border: 1px solid #ddd;
    background-color: white;
    cursor: pointer;
  }
  
  .page-button.active {
    background-color: #2196F3;
    color: white;
    border-color: #2196F3;
  }
  
  .page-button:hover:not(.active) {
    background-color: #f1f1f1;
  }
  
  .page-button:disabled {
    color: #ccc;
    cursor: not-allowed;
  }
  
  .empty-message {
    text-align: center;
    padding: 20px;
    color: #888;
  }
`;

export default `
  <div class="data-table-container">
    <div class="table-controls">
      <div class="search-container">
        <input 
          class="search-input" 
          type="text" 
          placeholder="Search..." 
          value={state.filterText}
          on-input={updateFilter}
        />
        <if(state.filterText)>
          <button class="clear-search" on-click={clearFilter}>×</button>
        </if>
      </div>
      
      <div class="items-per-page">
        <select 
          value={state.itemsPerPage}
          on-change={e => self.state.itemsPerPage = parseInt(e.target.value, 10)}
        >
          <option value="5">5 per page</option>
          <option value="10">10 per page</option>
          <option value="25">25 per page</option>
          <option value="50">50 per page</option>
        </select>
      </div>
    </div>
    
    <table class="data-table">
      <thead>
        <tr>
          <for [column] in=input.columns>
            <th 
              on-click={() => self.sort(column.field)}
              class={state.sortField === column.field ? 'sorted' : ''}
            >
              {column.label}
              <if(state.sortField === column.field)>
                <span class="sort-icon">
                  {state.sortDirection === 'asc' ? '↑' : '↓'}
                </span>
              </if>
            </th>
          </for>
        </tr>
      </thead>
      <tbody>
        <if(self.getFilteredData().length === 0)>
          <tr>
            <td colspan={input.columns.length} class="empty-message">
              <if(state.filterText)>
                No data found matching "{state.filterText}"
              </if>
              <else>
                No data available
              </else>
            </td>
          </tr>
        </if>
        <else>
          <for [item] in={self.getPaginatedData()}>
            <tr>
              <for [column] in=input.columns>
                <td>
                  <if(column.render)>
                    <{column.render} value={item[column.field]} row={item} />
                  </if>
                  <else>
                    {item[column.field]}
                  </else>
                </td>
              </for>
            </tr>
          </for>
        </else>
      </tbody>
    </table>
    
    <if(self.getTotalPages() > 1)>
      <div class="pagination">
        <div class="page-info">
          Showing {(state.currentPage - 1) * state.itemsPerPage + 1} - 
          {Math.min(state.currentPage * state.itemsPerPage, self.getFilteredData().length)} 
          of {self.getFilteredData().length} items
        </div>
        
        <div class="page-controls">
          <button 
            class="page-button prev" 
            on-click={prevPage}
            disabled={state.currentPage === 1}
          >
            Previous
          </button>
          
          <for [page] from=1 to={self.getTotalPages()}>
            <button 
              class="page-button {page === state.currentPage ? 'active' : ''}"
              on-click={() => self.setPage(page)}
            >
              {page}
            </button>
          </for>
          
          <button 
            class="page-button next" 
            on-click={nextPage}
            disabled={state.currentPage === self.getTotalPages()}
          >
            Next
          </button>
        </div>
      </div>
    </if>
  </div>
`;
```

These examples demonstrate how Lips can be used to build a wide range of UI components and applications, from simple interactive elements to complex data-driven interfaces. By combining the core concepts and features of Lips, you can create rich, responsive, and maintainable web applications.

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
  useContext<P extends Context>(fields: (keyof Context)[], fn: (context: P) => void): void;
  
  // Internationalization
  language(lang: string): void;
  
  // Properties
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
  
  // DOM Methods
  node: Cash;
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
  setLang(lang: string): boolean;
  setDictionary(id: string, dico: LanguageDictionary): void;
  translate(text: string, lang?: string): { text: string, lang: string };
  propagate($node: Cash): Cash;
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

### Utils

Utility functions for common operations.

```typescript
// Deep comparison
function isDiff(a: any, b: any): boolean;
function isEqual(a: any, b: any): boolean;

// Deep cloning
function deepClone<T>(obj: T, seen?: WeakMap<any, any>): T;

// Object manipulation
function deepAssign<T>(original: T, toSet: Record<string, any>): T;
```

### Reactivity API

Low-level API for fine-grained reactivity control.

```typescript
// Create a reactive signal
function signal<T>(value: T, options?: { maxSize: number }): [
  read: () => T,
  write: (nextValue: T, metadata?: Record<string, unknown>) => void,
  history: {
    undo: () => void;
    redo: () => void;
    jumpTo: (index: number) => void;
    getHistory: () => HistoryEntry<T>[];
    getCurrentIndex: () => number;
    canUndo: () => boolean;
    canRedo: () => boolean;
    clear: () => void;
  }
];

// Create an effect that reacts to signal changes
function effect(fn: () => unknown): EffectControl;

// Create a memoized value that updates when its dependencies change
function memo(fn: () => any): [read: () => any, dispose: () => void];

// Batch multiple state updates
function batch<T>(fn: () => T): T;
```

### Interfaces

#### LipsConfig

Configuration options for initializing Lips.

```typescript
interface LipsConfig {
  context?: any;
  debug?: boolean;
}
```

#### ComponentOptions

Options for component initialization.

```typescript
interface ComponentOptions {
  lips: Lips;
  debug?: boolean;
  prepath?: string;
  enableTemplateCache?: boolean;
  enableSmartDiff?: boolean;
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
  onInput?: (this: Component<MT>, input: MT['Input']) => void;
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
import { Metavars } from 'lips';

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
    <span class={state.isActive ? 'active' : 'inactive'}>
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

This concludes the comprehensive documentation for Lips Framework. By following this guide, developers can leverage the power of Lips to build efficient, reactive web applications with minimal overhead.