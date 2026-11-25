import { defineConfig } from '@lynx-js/rspeedy'
import { pluginVanillaLynx } from '@lynx-js/vanilla-rsbuild-plugin'
import { pluginLips } from '@lipsjs/lips/lynx-plugin'

export default defineConfig({
  source: { entry: { lips: './src/lips/main-thread.ts' } },
  plugins: [ pluginVanillaLynx(), pluginLips() ],
  environments: { lynx: {} }
})
