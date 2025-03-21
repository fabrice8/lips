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
<input placeholder=state.placeholderText">

<!-- Boolean attributes -->
<button disabled=!state.isValid>Submit</button>

<!-- Class binding -->
<div class="card {state.isActive ? 'active' : ''}"></div>

<!-- Style binding (object format) -->
<div style="{{ color: state.textColor, fontSize: state.fontSize + 'px' }}"></div>

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
  <error-message error=state.error/>
</else-if>
<else-if(state.status === 'empty')>
  <empty-state message="No data available"/>
</else-if>
<else>
  <data-display data=state.data/>
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
  <case is=['loading', 'processing']>
    <loading-spinner/>
  </case>
  <case is=['error', 'failed']>
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
    <button class=(page === state.currentPage ? 'active' : '')>{page}</button>
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
<input on-input(handleInput)>

<!-- Inline handlers -->
<button on-click(() => state.count++)>Increment</button>

<!-- Multiple events on one element -->
<div on-mouseenter(handleMouseEnter)
      on-mouseleave(handleMouseLeave)>
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
<let total=(state.price * state.quantity)/>
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
<user-profile user=state.currentUser/>

<!-- With attributes and events -->
<user-form
  user=state.user
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
<{state.currentView} props=state.viewProps/>

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
