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