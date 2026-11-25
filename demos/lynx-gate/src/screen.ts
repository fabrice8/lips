/**
 * RFC-006 L4: the screen both apps render, and the run both drive.
 *
 * A counter and ROWS keyed rows. Each of STEPS steps, GAP ms apart,
 * bumps the counter and relabels every tenth row: the same state change,
 * so what crosses the threads and how long it takes compare directly.
 * Each app logs to the console (logcat on Android), one line per fact:
 *
 *   L4 <app> step <i> <ms>    the background thread starts step i
 *   L4 <app> bytes <n>        JSON bytes of one update, as the main thread gets it
 *   L4 <app> flush <ms>       the main thread flushed the element tree
 *   L4 <app> done             all steps ran
 *
 * `measure.sh` reads them. Time is `Date.now()`, one clock for both
 * threads.
 */
export const ROWS = 100, STEPS = 20, GAP = 400

export interface Row { id: number, label: string }

export const rowsAt = ( step: number ): Row[] =>
  Array.from({ length: ROWS }, ( _, i ) => ({ id: i, label: i % 10 ? `row ${i}` : `row ${i} · ${step}` }) )

/** Runs the steps, then `after` */
export function drive( app: string, apply: ( step: number ) => void, after?: () => void ){
  let step = 0
  const next = () => {
    if( ++step > STEPS ){
      console.log(`L4 ${app} done`)
      return after?.()
    }
    console.log(`L4 ${app} step ${step} ${Date.now()}`)
    apply( step )
    setTimeout( next, GAP )
  }
  setTimeout( next, 1500 )
}

/** Main thread: log every flush, for both apps alike */
export function logFlushes( app: string ){
  const g = globalThis as any, flush = g.__FlushElementTree
  g.__FlushElementTree = ( ...args: unknown[] ) => {
    flush( ...args )
    console.log(`L4 ${app} flush ${Date.now()}`)
  }
}

/** Main thread: log the JSON size of one update as it arrives */
export const logBytes = ( app: string, json: string ) => console.log(`L4 ${app} bytes ${json.length}`)
