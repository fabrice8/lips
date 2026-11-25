/**
 * `SharedContext`, augmented: compiled as its own project
 * (`tsconfig.json` here, run by `npm run typecheck`), because an
 * augmentation types the context of everything that compiles beside it.
 *
 * An app writes the same block against '@lipsjs/lips'.
 */
import Lips, { component } from '../../src/lips'
import type { Shape } from '../../src/lips'

declare module '../../src/types' {
  interface SharedContext {
    theme: 'dark' | 'light'
    user: { id: number } | null
  }
}

type Equal<A, B> = ( <T>() => T extends A ? 1 : 2 ) extends ( <T>() => T extends B ? 1 : 2 ) ? true : false
const is = <T extends true>() => {}

// Every component reads it, named nowhere
component({
  handler: {
    onContext(){
      is<Equal<typeof this.context.theme, 'dark' | 'light'>>()
      // @ts-expect-error — not a context field
      this.context.missing
    }
  }
})

// …and the Lips instance takes it as its context
const lips = new Lips()
lips.setContext('theme', 'light')
// @ts-expect-error — not one of the themes
lips.setContext('theme', 'blue')
is<Equal<ReturnType<typeof lips.getContext>[ 'user' ], { id: number } | null>>()

// A component may still name a context of its own
component<{ context: { flag: boolean } }>()({
  handler: { a(){ is<Equal<typeof this.context.flag, boolean>>() } }
})
is<Equal<Shape<{}>['context'][ 'theme' ], 'dark' | 'light'>>()
