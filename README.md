# Lips — Fast, Lightweight Reactive UI Framework

Lips is a runtime, fine-grained reactive UI framework with an HTML-native template
syntax. Import it and build — **no build step required** — or precompile your templates
ahead of time for CSP-safe, parse-free startup.

Under the hood a template compiles to a small **IR** (intermediate representation): the
DOM is cloned from static skeletons and each binding is its own effect over per-key
signals, so a state change updates only what actually read it — no virtual DOM, no diffing.

```
template string ──parse──▶ AST ──compile──▶ IR ──render──▶ DOM
```

## ✨ Highlights

- **Zero build step** — import and go; templates render at runtime
- **Fine-grained reactivity** — per-key signals; updates are O(bindings that changed)
- **HTML-native syntax** — element-shaped control flow (`<if>`, `<for>`, `<switch>`, `<async>`), not an attribute DSL
- **Tiny** — ~21 KB gzip full, ~12 KB gzip precompiled-only, one dependency
- **Serializable components** — a template is a plain object; the compiled IR is JSON
- **Precompile + CSP mode** — build templates to IR; run with no `eval`/`Function` under a strict CSP
- **Hot-swap** — `instance.swap(newIR)` re-renders only what changed, preserving state
- **Batteries included** — router, i18n, macros, scoped styles, slots, component events
- **TypeScript** — full type definitions

## 🚀 Quick start

```html
<!DOCTYPE html>
<html>
<body>
  <div id="app"></div>

  <script type="module">
    import Lips from 'https://cdn.jsdelivr.net/npm/@lipsjs/lips'

    const lips = new Lips()

    lips.root({
      state: { count: 0 },
      handler: {
        increment(){ this.state.count++ }
      },
      default: `
        <div>
          <h2>Count: {state.count}</h2>
          <button on-click(increment)>Increment</button>
        </div>`
    }, '#app')
  </script>
</body>
</html>
```

## 📦 Installation

```bash
npm install @lipsjs/lips
```

```js
import Lips from '@lipsjs/lips'
```

### Entry points

| Import | Contents | gzip |
|---|---|---|
| `@lipsjs/lips` | full: runtime + parser/compiler + styles + router | ~21 KB |
| `@lipsjs/lips/runtime` | precompiled-only: no parser/compiler (CSP-friendly) | ~12 KB |
| `@lipsjs/lips/precompile` | build-time helpers + Vite/Rollup plugin | — |
| `@lipsjs/lips/dev` | unminified full build | — |

## 🧩 Template syntax

```html
<!-- interpolation & attributes -->
<p title=state.title>Hello {state.name}!</p>

<!-- events: named handler (+args) or inline arrow -->
<button on-click(select, item.id)>pick</button>
<button on-click(() => state.count++)>+</button>

<!-- conditionals -->
<if(state.ready)>…</if>
<else-if(state.loading)>…</else-if>
<else>…</else>

<!-- keyed lists: node identity & child state survive reorders -->
<for [item, i] in=state.items by="id">
  <li>{i}: {item.label}</li>
</for>

<!-- switch, async, scoped vars, dynamic tags -->
<switch(state.tab)><case is="a">…</case><default>…</default></switch>
<async await(context.load())><loading>…</loading><then [data]>…</then><catch [e]>…</catch></async>
<let doubled={ state.n * 2 }/>
<{state.page} params=state.params/>
```

Components compose with **slots** (`<{input.renderer}/>`) and **events**
(`this.emit('picked', …)` → parent `on-picked(...)`). Full lifecycle:
`onCreate · onInput · onMount · onRender · onUpdate · onAttach · onDetach · onContext ·
onError · onDestroy`.

### The component bus runs both ways

A rendered component's bus is bidirectional, so the handle you hold can send
commands in, not just receive events out:

```js
const editor = lips.render('editor', template).appendTo('#app')

// out — the component reports
editor.on('saved', doc => console.log( doc.id ))

// in — the holder commands
editor.emit('reset')
editor.emit('focus', 'title')
```

```js
handler: {
  onCreate(){
    this.on('reset', () => this.state.draft = '')
    this.on('focus', field => this.node[0].querySelector(`[name="${field}"]`)?.focus() )
  }
}
```

Inbound events reach listeners the component registered with `this.on(…)` —
**not** handler methods by name, so what a component accepts stays an explicit
contract. This is the way to drive a component imperatively; its internals are
deliberately not exposed.

## ⚡ Precompile & CSP

Compile templates to IR at build time — no runtime parsing, and with
`mode: 'interpreted'` no `eval`/`Function`, so the app runs under `script-src` without
`unsafe-eval`.

```js
import { precompile } from '@lipsjs/lips/precompile'
const card = precompile({ state: {/*…*/}, default: `<div>…</div>` }).template // { ir, state, … }
```

Or let the bundler do it (Vite/Rollup) for `.lips` single-file components:

```js
// vite.config.js
import { lipsPlugin } from '@lipsjs/lips/precompile'
export default { plugins: [ lipsPlugin() ] }
```

```js
import Card from './card.lips'   // already-compiled IR
lips.register('card', Card)
```

## 🔥 Hot-swap

Re-render a live component against a revised template, keeping component state:

```js
const app = lips.render('editor', template).appendTo('#app')
const { changes } = app.swap(newIR)   // patches only what differs
```

## 📖 Documentation

[Full Lips documentation](https://lips-js.github.io)

## 🏗️ Building from source

Developed with [Bun](https://bun.sh).

```bash
git clone https://github.com/fabrice8/lips.git
cd lips
bun install

bun run dev      # watch build
bun run build    # production bundles
bun run test     # test suite
bun run size     # size-budget check
```

## 🤝 Contributing

Contributions welcome — fork, branch, and open a PR. Please keep the runtime dependency
footprint small, add tests for new behavior, and run `bun run test` before submitting.

## 📄 License

MIT — see [LICENSE](LICENSE).

## 🙏 Acknowledgements

- [Bun](https://bun.sh) — runtime & bundler
- [Stylis](https://github.com/thysultan/stylis) — CSS preprocessor
- [MarkoJS](https://github.com/marko-js/marko) — inspiring template syntax
- [SolidJS](https://github.com/solidjs/solid) — signal-based fine-grained reactivity

---

Lips — reactive UI without the complexity. Created with ❤️ by [Fabrice K.E.M](https://github.com/fabrice8)
