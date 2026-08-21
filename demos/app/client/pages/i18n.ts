/**
 * i18n page — stable keys, `@format` params, and `<i18n lang=…>` scoping.
 */
import type { Handler, Metavars } from '../../../../src/types'

export const name = 'page-i18n'

type State = {
  items: number
  preview: string
}

export const state: State = {
  items: 3,
  preview: 'fr-FR'
}

export const handler: Handler<Metavars<{}, State>> = {
  onItems( e: any ){ this.state.items = Number( e.target.value ) }
}

export const stylesheet = `
  .pair { display: grid; gap: .9rem; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)) }
  .box {
    padding: .8rem .9rem;
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
  .box h2 { font-size: .82rem; text-transform: uppercase; letter-spacing: .05em; color: var(--text-faint) }
  .line { font-size: 1.02rem; font-weight: 550 }
  input[type="range"] { accent-color: var(--accent); width: 100%; max-width: 18rem }
  select {
    font: inherit;
    font-size: .88rem;
    color: var(--text);
    background: var(--panel-2);
    border: 1px solid var(--border-2);
    border-radius: var(--radius-sm);
    padding: .3rem .5rem;
  }
`

export default `
  <div>
    <h1>Internationalisation</h1>
    <p class="lede">
      A key ids one fixed string, so rewording the source text keeps the translation.
      The switcher in the header is the single writer; <code>self.lang</code> is the reader.
    </p>

    <section class="panel">
      <header>
        <h2>Keyed text vs. source text</h2>
        <!-- Braces in TEXT are interpolation too, so literal ones ship as a string -->
        <span class="tag">{'i18n="key" · @format="key, { … }"'}</span>
      </header>

      <div class="pair">
        <div class="box">
          <h2>Keyed</h2>
          <p class="line" i18n="nav.overview">Overview</p>
          <p class="line" i18n="counter.reset">Reset</p>
          <p class="faint">The key survives an English rewrite.</p>
        </div>

        <div class="box">
          <h2>Source-text keyed</h2>
          <p class="line" i18n>Settings</p>
          <p class="line" i18n>Undo</p>
          <p class="faint">Bare <code>i18n</code> keeps the gettext model — the text IS the key.</p>
        </div>
      </div>
    </section>

    <section class="panel">
      <header>
        <h2>Plurals through @format</h2>
        <span class="tag">{'@format="cart.items, { count: … }"'}</span>
      </header>

      <input type="range" min="0" max="6" value=state.items on-input(onItems)>
      <p class="line" @format="cart.items, { count: state.items }"></p>
      <p class="faint">
        A key alone would resolve the whole entry and drop the value; <code>@format</code>
        takes a reference AND params, which is what picks the 0 / 1 / * variant.
      </p>
    </section>

    <section class="panel">
      <header>
        <h2>Scoped language</h2>
        <span class="tag">&lt;i18n lang=state.preview&gt;</span>
      </header>

      <div class="row" style="margin-bottom: .8rem">
        <span class="faint">preview subtree in</span>
        <select on-change(( e ) => state.preview = e.target.value)>
          <option value="fr-FR">fr-FR</option>
          <option value="en-US">en-US</option>
        </select>
      </div>

      <div class="pair">
        <div class="box">
          <h2>App language</h2>
          <p class="line" i18n="nav.overview">Overview</p>
          <p class="line" @format="cart.items, { count: state.items }"></p>
          <p><lang-tag></lang-tag></p>
        </div>

        <i18n lang=state.preview>
          <div class="box">
            <h2>Scoped subtree</h2>
            <p class="line" i18n="nav.overview">Overview</p>
            <p class="line" @format="cart.items, { count: state.items }"></p>
            <p><lang-tag></lang-tag></p>
          </div>
        </i18n>
      </div>

      <p class="faint" style="margin-top: .8rem">
        Both boxes are one template; only the second sits under <code>&lt;i18n&gt;</code>.
        <code>self.lang</code> is component-grained, so the <code>&lt;lang-tag&gt;</code> placed
        under the block reports the scoped language, while an <code>&lt;i18n&gt;</code> block in a
        component's OWN template would not change that component's <code>self.lang</code>.
      </p>
    </section>
  </div>
`
