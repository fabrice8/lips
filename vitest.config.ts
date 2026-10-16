import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    /**
     * jsdom, not happy-dom: Lips relies on HTML-spec attribute-name leniency
     * (e.g. the `<for [item, i] ...>` iterator args). happy-dom's regex-based
     * parser drops comma-containing attribute names; jsdom (parse5) keeps them.
     */
    environment: 'jsdom',
    include: ['tests/**/*.spec.ts'],
    // Framework updates flow through microtask queues — generous but bounded
    testTimeout: 10000,
    /**
     * CSS imports are empty in tests by default, `?raw` included. Lips
     * sheets (`*.lips.css`, the Lynx demo's) are read as text by the specs.
     */
    css: { include: [ /\.lips\.css/ ] }
  }
})
