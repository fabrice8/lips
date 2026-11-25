/**
 * Stat tile — a purely presentational component whose stylesheet reads
 * its INPUTS. One sheet is injected per component type and shared by
 * every instance; the per-instance values ride on custom properties
 * written to each instance's own root (RFC-004 §7).
 *
 * `--tile-ratio` is the bare-interpolation form: a custom property whose
 * value is one expression binds the AUTHOR's name, so it stays readable
 * in devtools and inheritable by children.
 */
export type Input = {
  label: string
  value: number
  max: number
  unit?: string
  tone?: 'accent' | 'ok' | 'warn'
}

export const stylesheet = `
  --tile-ratio: {Math.min( 1, ( input.value || 0 ) / ( input.max || 1 ) )};

  /* Root-level: the element carrying rel= is not a descendant of itself */
  display: grid;
  gap: .45rem;
  padding: .85rem 1rem;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);

  .label {
    font-size: .72rem;
    font-weight: 600;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--text-faint);
  }

  .value {
    font-family: var(--mono);
    font-size: 1.35rem;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    color: {input.tone === 'ok' ? 'var(--ok)' : input.tone === 'warn' ? 'var(--warn)' : 'var(--accent)'};
  }
  .unit { font-size: .8rem; color: var(--text-faint) }

  .meter {
    height: 4px;
    border-radius: 999px;
    background: var(--panel-2);
    overflow: hidden;
  }
  .meter i {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: currentColor;
    color: {input.tone === 'ok' ? 'var(--ok)' : input.tone === 'warn' ? 'var(--warn)' : 'var(--accent)'};
    width: calc(var(--tile-ratio) * 100%);
    transition: width .3s ease;
  }
`

export default `
  <div class="tile">
    <span class="label" @text=input.label></span>
    <span class="value">{input.value}<span class="unit" @text=input.unit></span></span>
    <span class="meter"><i></i></span>
  </div>
`
