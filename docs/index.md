# Lips Framework Documentation

## Table of Contents

1. [**Introduction**](#introduction)
   - [What is Lips?](#what-is-lips)
   - [Key Features](#key-features)
   - [Comparison with Other Frameworks](#comparison-with-other-frameworks)
   - [Browser Compatibility](#browser-compatibility)

2. [**Getting Started**](./getting-started.md)
   - [Installation](./getting-started.md#intallation)
   - [Quick Start Example](./getting-started.md#quick-start-example)
   - [Project Structure](./getting-started.md#project-structure)

3. [**Core Concepts**](./core-concepts.md)
   - [Component Architecture](./core-concepts.md#component-architecture)
   - [Reactive State Management](./core-concepts.md#reactive-state-management)
   - [Template Syntax](./core-concepts.md#template-syntax)
   - [Lifecycle Methods](./core-concepts.md#lifecycle-methods)
   - [Event Handling](./core-concepts.md#event-handling)

4. [**Component API**](./component-api.md)
   - [Creating Components](./component-api.md#creating-components)
   - [Component Properties (input, state, static, context)](./component-api.md#component-properties)
   - [Component Methods](./component-api.md#component-methods)
   - [Component Lifecycle](./component-api.md#component-lifecycle)

5. [**Template Syntax**](./template-syntax.md)
   - [Text Interpolation](./template-syntax.md#text-interpolation)
   - [Attributes Binding](./template-syntax.md#attributes-binding)
   - [Conditional Rendering](./template-syntax.md#conditional-rendering)
   - [List Rendering](./template-syntax.md#list-rendering)
   - [Event Binding](./template-syntax.md#event-binding)
   - [Component Composition](./template-syntax.md#component-composition)

6. [**Built-in Components**](./built-in-components.md)
   - `<if>`, `<else-if>`, `<else>`
   - `<for>`
   - `<switch>`, `<case>`
   - `<async>`, `<then>`, `<catch>`
   - `<router>`
   - `<let>` and `<const>`

7. [**Advanced Features**](./advanced-features.md)
   - [Context API](./advanced-features.md#contex-api)
   - [Macros](./advanced-features.md#macros)
   - [Reactive Updates](./advanced-features.md#reactive-update)
   - [Performance Optimization](./advanced-features.md#performance-optimization)
   - [Fine-Grained Updates](./advanced-features.md#fine-grained-updates)
   - [Metrics](./advanced-features.md#metrics)

8. [**Styling**](./styling.md)
   - [Component Styling](./styling.md#component-styling)
   - [Stylesheet API](./styling.md#stylesheet-api)

9. [**Internationalization (i18n)**](./i18n.md)
   - [Setting up Languages](./i18n.md#setting-up-languages)
   - [Translating Content](./i18n.md#translation-content)

10. [**Best Practices**](./best-practices.md)
    - [Component Design](./best-practices.md#component-design)
    - [Performance Tips](./best-practices.md#performance-tips)
    - [Error Handling](./best-practices.md#error-handling)

11. [**Examples**](./examples.md)
    - [Simple Components](./examples.md#simple-components)
    - [Complex Applications](./examples.md#complex-applications)
    - [Animation Examples](./examples.md#animation-examples)
    - [Practical Use Cases](./examples.md#practical-use-cases)

12. [**API Reference**](./api-reference.md)
    - [Classes](./api-reference.md#classes)
    - [Interfaces](./api-reference.md#interfaces)
    - [Methods](./api-reference.md#methods)

## Introduction to Lips Framework

### What is Lips?

Lips is a lightweight, reactive UI framework that runs directly in the browser. It offers a component-based architecture with fine-grained reactivity, making it ideal for building dynamic web applications with minimal overhead.

Unlike heavier frameworks that require build steps, Lips can be used by simply importing a script, allowing you to start developing immediately without complex tooling.

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