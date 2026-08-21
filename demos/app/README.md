# Lips feature tour

Every panel in this demo **is** the feature it describes, running — not a
screenshot of it. It doubles as the executable check that the documented
syntax actually does what the docs claim.

```bash
bun install          # from the repo root
cd demos/app
bun run start        # compile + serve on http://localhost:3210
```

| script | what it does |
|---|---|
| `bun run compile` | bundle `client/index.ts` → `build/index.js` |
| `bun run dev` | the same, in watch mode |
| `bun run serve` | dev server with the SPA fallback the router needs |
| `bun run typecheck` | `tsc --noEmit` over `client/` |

Imports resolve to `../../src`, not to `dist/`, so the demo typechecks and
runs straight from source with no build of the library first. A published
consumer writes `from '@lipsjs/lips'`.

## What each route exercises

| route | features |
|---|---|
| `/` | context reads, keyed `<for>`, static data, navigation |
| `/reactivity` | per-key signals, nested writes, keyed list with node identity, component events, slots, `<let>` |
| `/control-flow` | `<if>/<else-if>/<else>`, `<switch>` with array `is`, `<for in>` and `<for from-to>`, dynamic tags |
| `/async` | `<async>` with all three arms, retry as a state write |
| `/compose` | macros, slot scope, `<const>`, spreads, inputs, scoped `<context>`, the root event bus |
| `/styles` | reactive declarations inside `:hover`, `@keyframes`, `@media`; author-named custom properties |
| `/i18n` | stable keys, source-text keys, `@format` plurals, `<i18n lang>` scoping, `self.lang` |
| `/product/:id`, `/account` | route params and query |
| anything else | the router's `not-found` |

## Four traps this demo is shaped around

Each of these is silent — the app runs, and the feature just does not happen.
`tests/demo-app.spec.ts` fails if any of them comes back.

1. **`style=` takes CSS text.** `{…}` in an attribute value is an
   interpolation slot, so `style="{ margin: '3rem' }"` is dead code (now
   `LIPS-C019`). Reactive styling belongs in a `stylesheet`.
2. **A component may not be named after an HTML tag.** Known tags resolve as
   elements before the registry is consulted, so `register('footer', …)`
   renders an empty `<footer>`. See `client/registry.ts`.
3. **A route page needs an exported `name`.** It is the page's style
   namespace; two nameless pages share one injected `<style>` and the second
   one's CSS never appears.
4. **A sheet cannot style its own root by class.** Rules are wrapped as
   `[rel="<name>"] { … }`, making every selector a descendant selector —
   the root is what carries `rel`. Root styling goes in top-level
   declarations, as in every component here.
