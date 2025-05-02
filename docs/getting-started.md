
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
  <script src="https://cdn.jsdelivr.net/npm/@lipsjs/lips"></script>
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
npm install @lipsjs/lips
```

Then import it into your project:

```javascript
import Lips from '@lipsjs/lips';
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
  <script src="https://cdn.jsdelivr.net/npm/@lipsjs/lips"></script>
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
├── main.css
├── components/
│   ├── Header/
│       ├── header.js
│       └── header.css
│   ├── Footer/
│       ├── footer.js
│       └── footer.css
│   └── TodoList/
│       ├── todoList.js
│       └── todoList.css
└── app.js
```

Example `app.js`:

```javascript
// Import Lips
import Lips from '@lipsjs/lips';

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
          <li class="todo-item {todo.completed ? 'completed' : ''}">
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
ES module approach of `TodoList.js` file:

This structured approachs helps keep your code organized and maintainable as your application grows.

```javascript
export const state = {
  todos: [
    { id: 1, text: 'Learn Lips', completed: false },
    { id: 2, text: 'Build an app', completed: false }
  ],
  newTodo: ''
}

export const handler = {
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
}
  
export default `
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
        <li class="todo-item {todo.completed ? 'completed' : ''}">
          <input type="checkbox" 
                  checked=todo.completed 
                  on-change(toggleTodo, todo.id)/>
          <span>{todo.text}</span>
        </li>
      </for>
    </ul>
  </div>
`
  
export const stylesheet = `
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
`;
```

Lips works well with this modular approach, making it easy to compose complex UIs from simple, reusable components.