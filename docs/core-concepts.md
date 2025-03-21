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
<button disabled=!state.isValid>Submit</button>

<!-- Value attributes -->
<input value=state.searchQuery>

<!-- Class binding -->
<div class="card {state.isActive ? 'active' : ''}"></div>

<!-- Style binding -->
<div style="{{ color: state.textColor, fontSize: state.fontSize + 'px' }}"></div>

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
  <error-message error=state.error/>
</else-if>
<else>
  <user-data data=state.data/>
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
    <button class=(page === state.currentPage ? 'active' : '')>{page}</button>
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
