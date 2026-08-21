/**
 * Language switch — `self.setLanguage()` is the single writer for the
 * active language and `self.lang` is the reactive reader. Nothing is
 * mirrored into state or context, so the two can never drift.
 */
import type { Handler, Metavars } from '../../../../src/types'

type Static = {
  langs: { code: string, flag: string, label: string }[]
}

export const _static: Static = {
  langs: [
    { code: 'en-US', flag: '🇺🇸', label: 'English' },
    { code: 'fr-FR', flag: '🇫🇷', label: 'Français' }
  ]
}

export const handler: Handler<Metavars<{}, {}, Static>> = {
  pick( code: string ){
    this.setLanguage( code )
    this.emit('language', code )
  }
}

export const stylesheet = `
  /* Root-level: the element carrying rel= is not a descendant of itself */
  display: inline-flex;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px;

  button {
    font: inherit;
    font-size: .82rem;
    font-weight: 550;
    color: var(--text-dim);
    background: transparent;
    border: 0;
    border-radius: 999px;
    padding: .2rem .6rem;
    cursor: pointer;
    transition: color .15s, background .15s;

    &:hover { color: var(--text) }
  }
  button.on {
    color: var(--accent-ink);
    background: var(--accent);
  }
`

export default `
  <div class="group">
    <for [lang] in=static.langs by="code">
      <button class="{self.lang === lang.code ? 'on' : ''}"
              title=lang.label
              on-click(pick, lang.code)>{lang.flag} {lang.code.slice(0, 2)}</button>
    </for>
  </div>
`
