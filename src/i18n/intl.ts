/**
 * The least of `Intl` that MessageFormat 2 needs, for an engine with none
 * — Lynx's PrimJS is not known to have it (design/lynx-binding.md §3.6).
 * Each member is installed only where it is missing, so an engine with a
 * real `Intl` is never touched.
 *
 * It writes numbers and dates plainly, selects every plural category as
 * `other`, and reads every language as left-to-right. An exact key still
 * selects (`0 {{…}}`, `1 {{…}}`), so a message can say "none" and "one"
 * without plural rules. A host that has real formatting registers it as
 * functions in `i18n.functions` — that is the seam this stands in for.
 */
const
g = globalThis as any,
I = g.Intl ??= {},
listed = ( locales: unknown ) => ( Array.isArray( locales ) ? locales : locales ? [ locales ] : [] ).map( String ),
plain = ( write: ( value: any ) => string ) => class {
  options: Record<string, unknown>
  constructor( locales?: unknown, options?: object ){
    this.options = { ...options, locale: listed( locales )[0] ?? 'und' }
  }
  static supportedLocalesOf( locales: unknown ){ return listed( locales ) }
  resolvedOptions(){ return this.options }
  format( value: unknown ){ return write( value ) }
  formatToParts( value: unknown ){ return [{ type: 'literal', value: write( value ) }] }
  select(){ return 'other' }
}

I.Locale ??= class {
  readonly baseName: string
  readonly language: string
  constructor( tag: unknown ){
    this.baseName = String( tag )
    this.language = this.baseName.split('-')[0]
  }
  maximize(){ return this }
  toString(){ return this.baseName }
}
I.NumberFormat ??= plain( String )
I.PluralRules ??= plain( String )
I.DateTimeFormat ??= plain( value => {
  const date = new Date( value )
  return isNaN( date.getTime() ) ? String( value ) : date.toISOString()
})

export {}
