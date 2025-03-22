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
      <user-profile user=state.user 
                    on-update(handleUserUpdate)/>
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
        <for [item] in=state.items.filter(item => 
          item.category === state.selectedCategory && 
          item.price > state.minPrice && 
          !item.isHidden
        )>
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
        <for [item] in=self.getFilteredItems()>
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
  <item-component item=item />
</for>

<!-- With keys (more efficient) -->
<for [item] in=state.items>
  <item-component item=item key=item.id />
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
      <button on-click(() => state.filter = 'all')>All</button>
      <button on-click(() => state.filter = 'active')>Active</button>
      
      <ul>
        <for [item] in=state.items.filter(i => state.filter === 'all' || i.status === state.filter )>
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
      <button on-click(() => state.filter = 'all')>All</button>
      <button on-click(() => state.filter = 'active')>Active</button>
      
      <ul>
        <for [item] in=self.getFilteredItems()>
          <li>{item.name}</li>
        </for>
      </ul>
    </div>
  `
};
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
  
  static: {
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
    message=state.error
    on-retry(handleRetry)
  />
</else-if>
<else>
  <data-display data=state.data/>
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
    <user-profile user=user/>
  </then>
  <catch [error]>
    <error-message message=error.message/>
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
      case 'active': return this.state.todos.filter(t => !t.completed);
      case 'completed': return this.state.todos.filter(t => t.completed);
      default: return this.state.todos;
    }
  }
};

export default `
  <div class="todo-list">
    <h2>{input.title || 'Todo List'}</h2>
    
    <div class="filters">
      <button class="{state.filter === 'all' && 'active'}" on-click(() => state.filter = 'all')>All</button>
      <button class="{state.filter === 'active' && 'active'}" on-click(() => state.filter = 'active')>Active</button>
      <button class="{state.filter === 'completed' && 'active'}" on-click(() => state.filter = 'completed')>Completed</button>
    </div>
    
    <ul>
      <for [todo] in=self.getFilteredTodos()>
        <li class="{todo.completed && 'completed'}>
          <input type="checkbox"
                  checked=todo.completed
                  on-change(() => self.toggleTodo(todo.id))/>
          <span>{todo.text}</span>
        </li>
      </for>
    </ul>
  </div>
`;
```

By following these best practices, you'll create Lips applications that are easier to maintain, perform better, and provide a better experience for both developers and users.
