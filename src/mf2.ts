/**
 * The MessageFormat 2 engine, for the precompiled-only entry.
 *
 *   import Lips from '@lipsjs/lips/runtime'
 *   import { messageFormat } from '@lipsjs/lips/i18n'
 *
 *   const lips = new Lips({ messageFormat })
 *
 * The full `@lipsjs/lips` build already carries it. `./runtime` does not:
 * an app that never translates should not pay ~7.2 KB gzipped for it.
 */
export { messageFormat } from './i18n/engine'
export { parseMessage } from 'messageformat'
export type { MessageFormatEngine, Message, Dictionary } from './types'
