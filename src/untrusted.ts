/**
 * Untrusted templates (RFC-007) — an entry of its own, passed to Lips by
 * value so an app that never renders one ships none of it:
 *
 *   import Lips from '@lipsjs/lips'
 *   import { untrusted, untrustedPolicy } from '@lipsjs/lips/untrusted'
 *
 *   const embed = new Lips({ untrusted: untrusted() })
 *   const strict = new Lips({ untrusted: untrusted({ ...untrustedPolicy, url: sameOriginOnly }) })
 *
 * `checkTemplate( policy )` is the compile-time half on its own, for a
 * build step or a generator that wants the diagnostics:
 *
 *   compileTemplate( src, { check: checkTemplate( untrustedPolicy ) } )
 */
export { untrusted, untrustedPolicy, checkTemplate } from './ir/policy'
export type { TemplatePolicy, Refusal, Verdict, Untrusted } from './ir/policy'
