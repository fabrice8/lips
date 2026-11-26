#!/usr/bin/env node
/**
 * `lips-check [-p tsconfig.json] [--lips <package or path>]`: a project's
 * templates type-checked against their components (`./program`). Prints
 * what it finds as `tsc` does, and exits 1 on an error.
 */
import { checkTemplates, formatDiagnostic } from './program'

// What it needs of Node, said here rather than typing all of it in
declare const process: { argv: string[], exit( code: number ): never }

const argv = process.argv.slice( 2 )
const opt = ( ...names: string[] ) => {
  const i = argv.findIndex( ( a: string ) => names.includes( a ) )
  return i === -1 ? undefined : argv[ i + 1 ]
}

const found = checkTemplates({ project: opt( '-p', '--project' ) || 'tsconfig.json', lips: opt('--lips') })
for( const d of found ) console.log( formatDiagnostic( d ) )

const errors = found.filter( d => d.severity === 'error' ).length
errors
  ? console.log(`\n${ errors } error${ errors > 1 ? 's' : '' } in templates`)
  : console.log('Templates type-check')
process.exit( errors ? 1 : 0 )
