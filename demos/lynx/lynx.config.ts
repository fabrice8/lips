import { defineConfig } from '@lynx-js/rspeedy'
import { pluginVanillaLynx } from '@lynx-js/vanilla-rsbuild-plugin'

/**
 * `src/main-thread.ts` is the entry; the plugin picks up the sibling
 * `background.ts` and `style.css`. `web` builds the Lynx for Web bundle
 * the e2e run loads; `lynx` builds the native one for Lynx Explorer.
 */
export default defineConfig({
  source: { entry: './src/main-thread.ts' },
  plugins: [ pluginVanillaLynx() ],
  environments: { web: {}, lynx: {} }
})
