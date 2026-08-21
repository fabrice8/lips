/**
 * Prints the language THIS component resolves to.
 *
 * Placed under `<i18n lang=…>` it reports the scoped language — that is the
 * half of RFC-005 §2 a same-template `<i18n>` block cannot show, because
 * `self` is one object per component.
 */
export const stylesheet = `
  /* Root-level: the element carrying rel= is not a descendant of itself */
  display: inline-block;
  font-family: var(--mono);
  font-size: .72rem;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  border-radius: 999px;
  padding: .05rem .45rem;
`

export default `<span>self.lang = <span @text=self.lang></span></span>`
