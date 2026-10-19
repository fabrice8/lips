/** Vite's `?raw` imports: a file's text, as a string */
declare module '*?raw' {
  const text: string
  export default text
}

/** Vite's `import.meta.glob`, as the specs use it: each file's text, by path */
interface ImportMeta {
  glob( pattern: string, options: { query: '?raw', import: 'default', eager: true }): Record<string, string>
}
