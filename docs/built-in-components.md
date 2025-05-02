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
  <error-message error=state.error/>
</else-if>
<else-if(state.status === 'empty')>
  <empty-state message="No data found"/>
</else-if>
<else>
  <data-display data=state.data/>
</else>
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

#### Implementation Details

The `switch` component evaluates the expression and renders the first `case` that matches the result. If no case matches, it renders the `default` component if provided.

Each `case` can accept:
- A single value (`is="value"`)
- An array of values (`is=['value1', 'value2']`)

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
<router global routes=static.routes/>

<!-- With events -->
<router global
        routes=static.routes
        on-after(handleRouteChange)
        on-before(handleBeforeNavigate)
        on-not-found(handleNotFound)/>

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
<let total=(price * quantity)/>
<p>Total: ${total}</p>

<!-- Multiple variables -->
<let subtotal=(price * quantity)
      tax=(subtotal * 0.07)
      total=(subtotal + tax)/>
<p>Subtotal: ${subtotal}</p>
<p>Tax: ${tax}</p>
<p>Total: ${total}</p>

<!-- Constant variables (cannot be reassigned) -->
<const TAX_RATE=0.07 
        SHIPPING=10/>
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
