# Lips on Lynx — renderer spike (RFC-006 L1)

One HTML-shaped Lips template, rendered natively by Lynx through the
two-thread binding in `src/lynx/`:

- `src/background.ts` runs Lips. It compiles the template from its source
  string, in interpreted mode, and renders it against the background host,
  which records changes as protocol ops.
- `src/main-thread.ts` creates the page and the applier. The applier is the
  only code that calls Element PAPI.

## Run it

```bash
npm install
npx rspeedy build      # dist/main.web.bundle (Lynx for Web) + dist/main.lynx.bundle (native)
node e2e.mjs           # builds, serves, drives Lynx for Web in Chromium
```

`e2e.mjs` needs Playwright and a Chromium. Set `PLAYWRIGHT` to the
Playwright package path and `CHROMIUM` to the browser executable if they are
not resolvable from here.

On a device, open `dist/main.lynx.bundle` in Lynx Explorer (`npx rspeedy dev`
prints a QR code). That is test tier C in RFC-006 §6.
