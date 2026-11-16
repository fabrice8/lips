/**
 * The MessageFormat 2 engine: `messageformat` v4 with every function the
 * standard defines — the default set (`:number`, `:integer`, `:currency`,
 * `:percent`, `:offset`, `:string`) built in, and the draft set (`:date`,
 * `:time`, `:datetime`, `:unit`) added. An engine without `Intl` gets the
 * least of it first (`./intl`).
 *
 * It is a value handed to `I18N`, not an import of it, so the `./runtime`
 * entry ships without it: the full build wires it in, and an app on
 * `./runtime` that translates passes it from `@lipsjs/lips/i18n`.
 */
import './intl'
import { MessageFormat } from 'messageformat'
import { DraftFunctions } from 'messageformat/functions'
import type { MessageFormatEngine } from '../types'

export const messageFormat: MessageFormatEngine = { MessageFormat, functions: DraftFunctions }
