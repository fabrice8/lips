# Lips: Fast, Lightweight Reactive UI Framework

Lips is a modern, runtime-based UI framework that brings fine-grained reactivity without the need for build steps. Create dynamic web applications with a simple, declarative syntax that feels familiar to HTML developers while providing powerful reactive capabilities.

## ✨ Key Features

- **Zero Build Step**: Just import the script and start building
- **Fine-Grained Reactivity**: Only updates what changed, not the entire component
- **Intuitive Template Syntax**: Simple yet powerful templating that's familiar to HTML developers
- **TypeScript Support**: Full type definitions for better developer experience
- **Built-in Performance Monitoring**: Track rendering performance with integrated benchmarking
- **Flexible Component Architecture**: Object-based or ES Module syntax for your components
- **Context API**: Share state across components without prop drilling
- **Lifecycle Hooks**: Fine-grained control over component behavior
- **Built-in Routing & i18n**: Everything you need in a single package

## 🚀 Quick Start

```html
<!DOCTYPE html>
<html>
<head>
  <title>My Lips App</title>
  <script src="https://cdn.jsdelivr.net/npm/@fabrice8/lips/dist/lips.min.js"></script>
</head>
<body>
  <div id="app"></div>
  
  <script>
    const lips = new Lips();
    
    // <counter/> component
    const counter = {
      state: { count: 0 },
      handler: {
        increment() { this.state.count++; }
      },
      default: `
        <div>
          <h2>Count: {state.count}</h2>
          <button on-click(increment)>Increment</button>
        </div>
      `
    };
    
    lips.root(counter, '#app');
  </script>
</body>
</html>
```

## 📦 Installation

### Via NPM

```bash
npm install @lipsjs/lips
```

### Via CDN

```html
<script src="https://cdn.jsdelivr.net/npm/@lipsjs/lips/dist/lips.min.js"></script>
```

## 📖 Documentation

For comprehensive documentation, examples, and API reference, visit:

[Full Lips Documentation](https://github.com/fabrice8/lips/blob/master/docs/index.md)

## 🏗️ Building from Source

Lips is developed using [Bun](https://bun.sh) runtime environment.

```bash
# Clone the repository
git clone https://github.com/fabrice8/lips.git
cd lips

# Install dependencies
npm install

# Make sure you have Bun installed
# If not: curl -fsSL https://bun.sh/install | bash

# Development with watch mode
bun run dev

# Build for production
bun run compile

# Build type declarations
bun run build:declaration
```

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. **Fork the repository**
2. **Create a feature branch**:
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Commit your changes**:
   ```bash
   git commit -m 'Add some amazing feature'
   ```
4. **Push to the branch**:
   ```bash
   git push origin feature/amazing-feature
   ```
5. **Open a Pull Request**

Please ensure your code follows the existing style and includes appropriate tests.

### Development Guidelines

- Ensure you have [Bun](https://bun.sh) installed for development
- Follow the TypeScript coding style
- Add unit tests for new features
- Maintain the zero-build philosophy for runtime usage
- Update documentation for any new features or changes

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgements

- [Bun](https://bun.sh) for the fast JavaScript runtime and bundler
- [Cash-DOM](https://github.com/fabiospampinato/cash) for the lightweight jQuery alternative
- [Stylis](https://github.com/thysultan/stylis) for the CSS preprocessor
- [MarkoJS](https://github.com/marko-js/marko) for their inspiring syntax declaration struture.
- [SolidJS](https://github.com/solidjs/solid) for the signal based reactivity concept.
- All contributors who have helped make Lips better

---

Lips - Reactive UI without the complexity. Created with ❤️ by [Fabrice K.E.M](https://github.com/fabrice8)