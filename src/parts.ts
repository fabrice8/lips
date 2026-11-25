/**
 * `@lipsjs/lips/parts`: headless components (RFC-008).
 *
 * Each part is a plugin: `lips.use()` installs its components and what it
 * is built on, once.
 *
 *   import { menu } from '@lipsjs/lips/parts'
 *   lips.use( menu )   // and the popover it is built on
 *
 * A part's templates are source. An app that runs in interpreted mode
 * under a content security policy precompiles them in its build with
 * `precompile()` (`@lipsjs/lips/precompile`), as it does its own; on Lynx,
 * with `compileLynxTemplate()`.
 */
export { layer, LAYER, CENTER, FILL } from './parts/layer'
export { popover, place, type PopoverApi, type Placement, type Box } from './parts/popover'
export { menu, move, typed, type MenuItem } from './parts/menu'
export { dialog, inert } from './parts/dialog'
export { toast, type Toast } from './parts/toast'
export { icons, type Icon, type IconSet } from './parts/icon'
