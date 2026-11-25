/**
 * Footer — registered as `site-footer`, NOT `footer`.
 *
 * `footer` is a standard HTML tag, and the compiler resolves known HTML
 * tags as elements before consulting the component registry, so
 * `lips.register('footer', …)` would compile to an empty `<footer>` and
 * the component would never run. The same trap waits for `header`,
 * `main`, `nav`, `section`, `dialog`, `menu` and `slot`.
 */
export const _static = {
  repo: 'github.com/fabrice8/lips',
  docs: 'lips-js.github.io'
}

export const stylesheet = `
  /* Root-level: the element carrying rel= is not a descendant of itself */
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-top: 2.5rem;
  padding: 1.1rem 0 2rem;
  border-top: 1px solid var(--border);
  color: var(--text-faint);
  font-size: .82rem;

  a {
    color: var(--text-dim);
    text-decoration: none;
    border-bottom: 1px dotted var(--border-2);
    &:hover { color: var(--accent); border-bottom-color: var(--accent) }
  }
  code { font-family: var(--mono) }
  .dot { opacity: .45; padding: 0 .35rem }
`

export default `
  <div class="foot">
    <span>
      Built with <a href="https://lips-js.github.io" target="_blank" rel="noreferrer">Lips</a>
      <span class="dot">·</span>
      every binding on this page is its own effect
    </span>
    <span>
      <a href="https://github.com/fabrice8/lips" target="_blank" rel="noreferrer"><code @text=static.repo></code></a>
    </span>
  </div>
`
