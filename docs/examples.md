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
    <input type="checkbox" checked=state.isOn on-change(toggle)>
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
          initialValue=state.darkMode 
          on-change(handleDarkModeChange)/>
      </div>
      
      <div class="setting">
        <span>Notifications</span>
        <toggle-switch
          initialValue=state.notifications 
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
          <li class="tab {index === state.activeTab ? 'active' : ''}"
              on-click(() => self.setActiveTab(index))>
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
      <tabs tabs=static.tabs defaultTab=0 />
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
        value=state.newTodo
        on-input(updateNewTodo)/>
      <button class="add-button" type="submit">Add</button>
    </form>
    
    <if(state.todos.length > 0)>
      <ul class="todo-list">
        <for [todo] in=self.getFilteredTodos()>
          <li class="todo-item {todo.completed ? 'completed' : ''}">
            <input 
              type="checkbox" 
              checked=todo.completed 
              on-change(() => self.toggleTodo(todo.id))/>
            <span>{todo.text}</span>
            <button class="delete-button" on-click(() => self.removeTodo(todo.id))>
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
            on-click(() => self.setFilter('all'))>
            All
          </button>
          <button 
            class="filter-button {state.filter === 'active' ? 'active' : ''}"
            on-click(() => self.setFilter('active'))>
            Active
          </button>
          <button 
            class="filter-button {state.filter === 'completed' ? 'active' : ''}"
            on-click(() => self.setFilter('completed'))>
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
        <select class="metric-selector"
                value=state.selectedMetric
                on-change(e => self.setSelectedMetric(e.target.value))>
          <option value="users">Users</option>
          <option value="pageviews">Pageviews</option>
          <option value="conversions">Conversions</option>
          <option value="revenue">Revenue</option>
        </select>
        
        <select class="range-selector"
                value=state.timeRange
                on-change(e => self.setTimeRange(e.target.value))>
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
        <line-chart data=self.getChartData() />
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
  <div class="counter {state.currentValue > state.targetValue ? 'decreasing' : state.currentValue < state.targetValue ? 'increasing' : ''}">
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
        <animated-counter value=state.userCount />
      </div>
      
      <div class="stat-card">
        <h2>Page Views</h2>
        <animated-counter value=state.viewCount />
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
      style="transform: translateX(-{state.currentIndex * 100}%)">
      <for [image, index] in=input.images>
        <div class="carousel-slide">
          <img class="carousel-image" 
                src=image.src 
                alt=image.alt/>
          <if(image.caption)>
            <div class="carousel-caption">{image.caption}</div>
          </if>
        </div>
      </for>
    </div>
    
    <div class="carousel-controls">
      <button class="carousel-button prev" 
              on-click(previous)
              aria-label="Previous slide">‹</button>
      
      <button class="carousel-button next" 
              on-click(next)
              aria-label="Next slide">›</button>
    </div>
    
    <div class="carousel-indicators">
      <for [_, index] in=input.images>
        <div class="carousel-indicator {index === state.currentIndex ? 'active' : ''}"
              on-click(() => self.goToSlide(index))/>
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
          <input id="name"
                  class="form-input {state.touched.name && state.errors.name ? 'error' : ''}"
                  type="text"
                  value=state.form.name
                  on-input(e => self.updateField('name', e.target.value))/>
          <if(state.touched.name && state.errors.name)>
            <div class="error-message">{state.errors.name}</div>
          </if>
        </div>
        
        <div class="form-group">
          <label class="form-label" for="email">Email</label>
          <input id="email"
                  class="form-input {state.touched.email && state.errors.email ? 'error' : ''}"
                  type="email"
                  value=state.form.email
                  on-input(e => self.updateField('email', e.target.value))/>
          <if(state.touched.email && state.errors.email)>
            <div class="error-message">{state.errors.email}</div>
          </if>
        </div>
        
        <div class="form-group">
          <label class="form-label" for="password">Password</label>
          <input id="password"
                  class="form-input {state.touched.password && state.errors.password ? 'error' : ''}"
                  type="password"
                  value=state.form.password
                  on-input(e => self.updateField('password', e.target.value))/>
          <if(state.touched.password && state.errors.password)>
            <div class="error-message">{state.errors.password}</div>
          </if>
        </div>
        
        <div class="form-group">
          <label class="form-label" for="confirmPassword">Confirm Password</label>
          <input id="confirmPassword"
                  class="form-input {state.touched.confirmPassword && state.errors.confirmPassword ? 'error' : ''}"
                  type="password"
                  value=state.form.confirmPassword
                  on-input(e => self.updateField('confirmPassword', e.target.value))/>
          <if(state.touched.confirmPassword && state.errors.confirmPassword)>
            <div class="error-message">{state.errors.confirmPassword}</div>
          </if>
        </div>
        
        <if(state.errors.form)>
          <div class="error-message">{state.errors.form}</div>
        </if>
        
        <button class="submit-button" 
                type="submit"
                disabled=state.isSubmitting>
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
        <input class="search-input" 
                type="text" 
                placeholder="Search..." 
                value=state.filterText
                on-input(updateFilter)/>
        <if(state.filterText)>
          <button class="clear-search" on-click(clearFilter)>×</button>
        </if>
      </div>
      
      <div class="items-per-page">
        <select value=state.itemsPerPage
                on-change(e => self.state.itemsPerPage = parseInt(e.target.value, 10))>
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
            <th class={state.sortField === column.field ? 'sorted' : ''}
                on-click(() => self.sort(column.field))>
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
            <td colspan=input.columns.length class="empty-message">
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
          <for [item] in=self.getPaginatedData()>
            <tr>
              <for [column] in=input.columns>
                <td>
                  <if(column.render)>
                    <{column.render} value=item[column.field] row=item />
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
          <button class="page-button prev"
                  on-click=prevPage
                  disabled={state.currentPage === 1}>
            Previous
          </button>
          
          <for [page] from=1 to=self.getTotalPages()>
            <button class="page-button {page === state.currentPage ? 'active' : ''}"
                    on-click(() => self.setPage(page))>
              {page}
            </button>
          </for>
          
          <button class="page-button next" 
                  on-click=nextPage
                  disabled={state.currentPage === self.getTotalPages()}>
            Next
          </button>
        </div>
      </div>
    </if>
  </div>
`;
```

These examples demonstrate how Lips can be used to build a wide range of UI components and applications, from simple interactive elements to complex data-driven interfaces. By combining the core concepts and features of Lips, you can create rich, responsive, and maintainable web applications.
