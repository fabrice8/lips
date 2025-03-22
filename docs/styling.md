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
<div style="color: {state.textColor}; backgroundColor: {state.bgColor}; fontSize: {state.fontSize}px">
  Styled Text
</div>

<!-- Inline style binding -->
<div style="color: {state.textColor}; background-color: {state.bgColor};">
  Styled Text
</div>

<!-- Conditional attribute -->
<button disabled=!state.isValid>Submit</button>
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
        case 'high': return { color: 'red', fontWeight: 'bold' };
        case 'medium': return { color: 'orange' };
        default: return { color: 'green' };
      }
    }
  },
  
  default: `
    <div style=self.getImportanceStyle()>
      Important notice
    </div>
  `
};
```

### Stylesheet API

For more advanced styling needs, Lips provides a Stylesheet API.

#### Component Stylesheet Management

Each component has a `stylesheet` property that provides methods for managing styles:

```javascript
const component = {
  handler: {
    onMount() {
      // Load additional styles dynamically
      this.stylesheet.load({
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
      this.stylesheet.clear();
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

// Or initialize with global stylesheets
import BootstrapCSS from 'bootstrap.min.css'

const lips = new Lips({
  stylesheets: [
    BootstrapCSS,
    `
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
  ]
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
      <button on-click(() => state.darkMode = !state.darkMode)>
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
ES module approach

```javascript
// Import styles from a CSS file
export cardStyles as stylesheet from './styles/card.css';

export default default `
  <div class="card">
    <!-- Card content -->
  </div>
`
```

### Style Encapsulation

Lips' styling system ensures that component styles don't leak into other components, while still giving you the flexibility to define global styles when needed. This helps you maintain a clean and organized codebase, especially in larger applications.
