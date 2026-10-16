# Lips on Lynx — renderer and styles (RFC-006 L1, L2)

One HTML-shaped Lips template, rendered natively by Lynx through the
two-thread binding in `src/lynx/`:

- `src/background.ts` runs Lips. It compiles the template from its source
  string, in interpreted mode, and renders it against the background host,
  which records changes as protocol ops.
- `src/main-thread.ts` creates the page and the applier. The applier is the
  only code that calls Element PAPI.

## Styles

`src/app.lips.css` is the component's sheet, in Lips syntax: `{state.x}`
binds a value. `lips-styles.ts` is an Rsbuild plugin that compiles it at
build time, because Lynx cannot add a stylesheet at runtime:

- `main-thread.ts` imports it, and the bundle gets flat CSS scoped by
  `.lips-app`. Lint errors (`LIPS-L…`) fail the build.
- `background.ts` imports it with `?raw` and gets the binds, which the
  runtime writes as variables on the root.
- The plugin sets the page config those rely on: inline variables,
  `@media` and CSS inheritance.

Import a Lips sheet from a script, not with `@import` from `style.css`:
css-loader sends an `@import` past every configured loader, so the sheet
would reach Lynx uncompiled.

## Run it

```bash
npm install
npx rspeedy build      # dist/main.web.bundle (Lynx for Web) + dist/main.lynx.bundle (native)
node e2e.mjs           # builds, serves, drives Lynx for Web in Chromium
```

`e2e.mjs` needs Playwright and a Chromium. Set `PLAYWRIGHT` to the
Playwright package path and `CHROMIUM` to the browser executable if they are
not resolvable from here.

## The real engine, headless (RFC-006 tier B)

```bash
native/run.sh
```

This needs git, curl, cargo and node, on Linux x86_64. It fetches
lynx-stack's headless runner crates at the commit RFC-006 pins, plus the Lynx
4.1 runtime and core script; both are checked against lynx-stack's pinned
SHA-256s. It then builds the bundle and runs `native/harness`:

- first render, taps and keyed moves are checked in the engine's own DOM;
- the sheet's computed styles are read from its native CSS engine, before
  and after a state change rewrites the binds;
- the frame is written to `dist/native.bmp`.

To explore instead of check, `probe` loads a bundle and runs steps in
order:

```bash
native/target/debug/lips-tierb probe dist/main.lynx.bundle tap=#theme 'style=#count:color,font-size' dom shot=/tmp/f.bmp
```

Any JS error the engine reports fails the run. If the demo's
`node_modules` is missing, it runs `npm ci` first.

CI runs it in `.github/workflows/lynx-native.yml` on every push or PR that
changes `src/` or `demos/lynx/`. The frame and logs are kept as the run's
`lynx-native` artifact.

## On a device

Open `dist/main.lynx.bundle` in Lynx Explorer (`npx rspeedy dev`
prints a QR code). That is test tier C in RFC-006 §6.
