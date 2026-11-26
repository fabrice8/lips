/**
 * `@lipsjs/lips/check`: templates type-checked against their components.
 * A build-time entry, for Node: it uses the project's own `typescript`.
 *
 *   import { checkTemplates, formatDiagnostic } from '@lipsjs/lips/check'
 *   checkTemplates({ project: 'tsconfig.json' }).forEach( d => console.log( formatDiagnostic( d ) ) )
 *
 * or, from the command line, `lips-check -p tsconfig.json`.
 */
export { checkTemplates, formatDiagnostic } from './check/program'
export type { CheckOptions, CheckDiagnostic } from './check/program'
export { shadowTemplate } from './check/shadow'
export type { Shadow, Span } from './check/shadow'
