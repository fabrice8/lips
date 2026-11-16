/**
 * The tags a reader of `tag` is served from, most specific first — RFC 4647
 * §3.4 Lookup: the tag, then each shorter prefix, a single-letter subtag
 * left at the end dropped with what followed it. `zh-Hant-TW` reads
 * `zh-Hant` before `zh`, so a script is never skipped for its language.
 *
 * It is the same chain AB's `lookupTags` walks for a translatable name, and
 * both are held to the RFC's own example, so a dictionary and a name stored
 * on the platform fall back the same way for the same reader.
 */
export function lookupTags( tag: string ): string[] {
  const
  subtags = tag.split('-'),
  tags: string[] = []

  while( subtags.length ){
    tags.push( subtags.join('-') )
    subtags.pop()
    subtags[ subtags.length - 1 ]?.length === 1 && subtags.pop()
  }
  return tags
}

/** A name said in more than one language: one text per language tag, and the one to fall back to. */
export type TranslatableName = {
  readonly default: string
  readonly names: Readonly<Record<string, string>>
}

/**
 * The text of `name` a reader of `lang` reads: the first tag of its lookup
 * chain the name has, matched whatever its casing, and the default text
 * when none is. What a template shows for a platform name, as `self.pick( … )`.
 */
export function pick( name: TranslatableName, lang: string ): string {
  const texts = new Map( Object.entries( name.names ).map( ([ tag, text ]) => [ tag.toLowerCase(), text ] ) )
  for( const tag of lookupTags( lang.toLowerCase() ) )
    if( texts.has( tag ) ) return texts.get( tag )!

  return name.names[ name.default ] ?? ''
}
