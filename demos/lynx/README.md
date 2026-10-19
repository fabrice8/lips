# Lips on Lynx — renderer, styles, inputs and lists (RFC-006 L1–L3)

One HTML-shaped Lips template, rendered natively by Lynx through the
two-thread binding in `src/lynx/`:

- `src/background.ts` runs Lips. It compiles the template from its source
  string with `compileLynxTemplate`, in interpreted mode, and renders it
  against the background host, which records changes as protocol ops.
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

## Inputs, scrolling and lists

- The input's `value` is bound to state. Its `input` handler reads
  `e.target.value`, as on the DOM. The `fill` button sets the value from
  state, which reaches the native input through `setValue`.
- `<scroll-view scroll-y>` reports where it is through `scroll`.
- `<list>` holds 40 `<list-item>`s, and Lynx asks for each one as it
  scrolls into view. `shuffle` reverses them.
- The `fill` and `shuffle` labels and the cells' text are bare text in
  elements that are not text. `compileLynxTemplate` wraps each in one
  `text`, without which Lynx would render nothing.

## Run it

| Tier (RFC-006 §6) | Command, from `demos/lynx` | What it proves |
|---|---|---|
| A, unit | `bun run test` (repo root) | The binding, the style pipeline and the vocabulary pass, both threads in Node |
| A, web | `npm run e2e` | The real bundle in Lynx for Web, driven in Chromium, including real typing |
| B | `npm run native` | The real Lynx engine, headless: native CSS, the input, the scroll view and the list |
| C | `npm run ios` / `npm run android` | Lynx Explorer on a simulator, live from the dev server |

`npm run build` writes `dist/main.web.bundle` and `dist/main.lynx.bundle`.
`npm run dev` serves both and rebuilds on every edit. Lynx for Web
previews at <http://localhost:3000/__web_preview?casename=main.web.bundle>.

## On a Mac (Apple Silicon)

Once:

```bash
# Node 22+, bun (https://bun.sh), Rust (https://rustup.rs), Xcode with an
# iPhone simulator, Android Studio with an emulator. Then:
export PATH="$PATH:$HOME/Library/Android/sdk/platform-tools:$HOME/Library/Android/sdk/emulator"

bun install                        # repo root
cd demos/lynx && npm ci
npx playwright install chromium    # for npm run e2e
```

Then every tier runs locally:

- `npm run native` is tier B. It fetches the engine's macOS build and
  ad-hoc signs a copy, which Apple Silicon requires. The first run also
  builds the Rust runner, in about two minutes.
- `npm run ios` boots the first iPhone simulator, unless one is already
  booted. It installs Lynx Explorer 4.1.0 if it is missing and opens the
  demo in it.
- `npm run android` does the same on the first emulator. It maps the
  emulator's port 3000 back to your Mac with `adb reverse`.

`ios` and `android` start the dev server unless one is already running on
port 3000, so `npm run dev` in another terminal serves both platforms at
once. Lynx Explorer is the release asset from lynx-family/lynx, checked
against a pinned SHA-256 and kept in `native/.cache/explorer`. That is the
engine tier B runs.

What only a simulator or a device shows: real keyboard and IME input,
native scroll and fling feel, and, on a mid-range phone, the L4
measurements.

## The real engine, headless (RFC-006 tier B)

```bash
native/run.sh          # or: npm run native
```

This needs git, curl, cargo and node, on Linux x86_64 or macOS on Apple
Silicon. It fetches lynx-stack's headless runner crates at the commit
RFC-006 pins, then the runtime and the core script. The runtime is Lynx 4.1
on Linux and lynx-stack's macOS build on a Mac. Both are checked against
lynx-stack's pinned SHA-256s on every run. It then builds the bundle and
runs `native/harness`:

- first render, taps and keyed moves are checked in the engine's own DOM;
- the sheet's computed styles are read from its native CSS engine, before
  and after a state change rewrites the binds;
- the input, the scroll view and the list are driven with taps and finger
  drags;
- the frame is written to `dist/native.bmp`.

The runner has no public drag, so `run.sh` applies `native/runner.patch`,
which exposes its native view.

To explore instead of check, `probe` loads a bundle and runs steps in
order. Run it from `native/.cache`: the engine writes a `quickjs_cache/`
into the working directory.

```bash
cd native/.cache
../target/debug/lips-tierb probe ../../dist/main.lynx.bundle tap=#theme 'style=#count:color,font-size' dom shot=/tmp/f.bmp
../target/debug/lips-tierb probe ../../dist/main.lynx.bundle box=#feed drag=#feed:-200 dom
```

Steps: `tap=`, `touch=` (a hit-tested finger tap, which focuses inputs),
`drag=<selector>:<dy>`, `style=<selector>[:props]`, `box=`, `dom` and
`shot=`.

Any JS error the engine reports fails the run. If the demo's
`node_modules` is missing, it runs `npm ci` first.

CI runs it on Linux and on macOS in `.github/workflows/lynx-native.yml`,
on every push or PR that changes `src/` or `demos/lynx/`. The frames and
logs are kept as the `lynx-native` and `lynx-native-macos` artifacts.

## On a phone

`npm run dev` prints the bundle's URL. Open it in Lynx Explorer on the
phone, or scan the QR code Lynx Explorer offers. The phone must reach your
machine on port 3000. iOS needs Lynx Explorer built from source, or the
community App Store build. That is tier C in RFC-006 §6.
