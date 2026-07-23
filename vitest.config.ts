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
    testTimeout: 10000
  }
})
