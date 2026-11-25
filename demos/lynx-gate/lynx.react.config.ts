import { defineConfig } from '@lynx-js/rspeedy'
import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin'

export default defineConfig({
  source: { entry: { react: './src/react/index.tsx' } },
  plugins: [ pluginReactLynx() ],
  environments: { lynx: {} },
  output: { cleanDistPath: false }
})
