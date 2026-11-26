/**
 * Reactivity benchmark: the signal core alone, no DOM. Wired into CI.
 *
 *   bun bench/reactivity.mjs            # measure, and hold to the baseline
 *   bun bench/reactivity.mjs --update   # measure, and write the baseline
 *
 * Five graphs: a deep chain, a wide fan-out, the same fan-out with values
 * that come out unchanged, a diamond, and many writes in a batch. Each is held two ways against `baseline/reactivity.json`:
 *
 * - WORK, exactly: how many times computed values were computed and
 *   effects ran. These do not drift with the machine, so any change is a
 *   change in the algorithm (one run more per write is O(n) more), and
 *   fails at once. A deliberate one is taken with `--update`.
 * - TIME, loosely: the median of many samples, divided by a calibration
 *   loop timed in the same process, so the number travels between a
 *   laptop and a CI runner. It fails only past `MARGIN` times the
 *   baseline: a large regression, not CI noise.
 *
 * Bun runs this, as it does the build: it imports the TypeScript source.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { signal, computed, effect, batch } from '../src/ir/signal.ts'

const BASELINE = new URL( './baseline/reactivity.json', import.meta.url )
/** A time this many times the baseline's fails; below it is noise */
const MARGIN = 2.5
const SAMPLES = 25, WARMUP = 5

const now = () => performance.now()
const median = xs => [ ...xs ].sort( ( a, b ) => a - b )[ xs.length >> 1 ]

/**
 * Plain work of the same kind (closures, Sets, a Map), timed alongside:
 * the unit every time below is divided by.
 */
function calibrate(){
  const t = now()
  const m = new Map()
  let x = 0
  for( let i = 0; i < 2e5; i++ ){
    const s = m.get( i & 1023 ) || new Set()
    s.add( i ), s.delete( i - 1 ), m.set( i & 1023, s )
    const f = () => x += s.size
    f()
  }
  return now() - t
}

/**
 * Each case builds its graph once, counted, and returns `step`: the
 * writes timed. `count` tallies computations and effect runs.
 */
const CASES = {
  /** One source, 1,000 computed values each read by the next, an effect at the end */
  chain( count ){
    const [ read, write ] = signal( 0 )
    let last = { read }
    for( let i = 0; i < 1000; i++ ){
      const prev = last
      last = computed( () => ( count.computed++, prev.read() + 1 ) )
    }
    const end = last
    effect( () => { count.effects++; end.read() })
    let n = 0
    return () => write( ++n )
  },

  /** One source, 1,000 computed values from it, an effect reading each */
  fanout( count ){
    const [ read, write ] = signal( 0 )
    for( let i = 0; i < 1000; i++ ){
      const c = computed( () => ( count.computed++, read() + i ) )
      effect( () => { count.effects++; c.read() })
    }
    let n = 0
    return () => write( ++n )
  },

  /** One source, 500 computed values from it, one value summing them, an effect */
  diamond( count ){
    const [ read, write ] = signal( 0 )
    const sides = Array.from({ length: 500 }, ( _, i ) => computed( () => ( count.computed++, read() * i ) ) )
    const sum = computed( () => { count.computed++; let s = 0; for( const c of sides ) s += c.read(); return s })
    effect( () => { count.effects++; sum.read() })
    let n = 0
    return () => write( ++n )
  },

  /**
   * A fan-out whose values come out the same: they are computed again, and
   * the effects reading them do not run
   */
  pruned( count ){
    const [ read, write ] = signal( 0 )
    for( let i = 0; i < 1000; i++ ){
      const c = computed( () => ( count.computed++, read() >= 0 ) )
      effect( () => { count.effects++; c.read() })
    }
    let n = 0
    return () => write( ++n )
  },

  /** 1,000 sources, an effect on each and one on all, all written in one batch */
  batch( count ){
    const sources = Array.from({ length: 1000 }, () => signal( 0 ) )
    for( const [ read ] of sources ) effect( () => { count.effects++; read() })
    effect( () => { count.effects++; for( const [ read ] of sources ) read() })
    let n = 0
    return () => batch( () => { n++; for( const [ , write ] of sources ) write( n ) })
  }
}

function measure(){
  const unit = median( Array.from({ length: SAMPLES }, calibrate ) )
  const out = {}
  for( const [ name, build ] of Object.entries( CASES ) ){
    const count = { computed: 0, effects: 0 }
    const step = build( count )
    // The work one write does, counted on the first
    const before = { ...count }
    step()
    const work = { computed: count.computed - before.computed, effects: count.effects - before.effects }

    for( let i = 0; i < WARMUP; i++ ) step()
    const times = Array.from({ length: SAMPLES }, () => {
      const t = now()
      for( let i = 0; i < 20; i++ ) step()
      return now() - t
    })
    out[ name ] = { work, time: +( median( times ) / unit ).toFixed( 3 ), ms: +median( times ).toFixed( 3 ) }
  }
  return { unit: +unit.toFixed( 3 ), cases: out }
}

const result = measure()
const rows = Object.entries( result.cases )

if( process.argv.includes('--update') ){
  const cases = Object.fromEntries( rows.map( ( [ k, v ] ) => [ k, { work: v.work, time: v.time } ] ) )
  writeFileSync( BASELINE, JSON.stringify({ margin: MARGIN, cases }, null, 2 ) + '\n' )
  console.table( Object.fromEntries( rows ) )
  console.log( `baseline written (calibration ${result.unit} ms)` )
  process.exit( 0 )
}

const baseline = JSON.parse( readFileSync( BASELINE, 'utf8' ) )
const failures = []
const table = {}
for( const [ name, now ] of rows ){
  const base = baseline.cases[ name ]
  if( !base ){ failures.push( `${name}: no baseline (run with --update)` ); continue }
  const ratio = now.time / base.time
  table[ name ] = {
    computed: `${now.work.computed} (${base.work.computed})`,
    effects: `${now.work.effects} (${base.work.effects})`,
    time: `${now.time} (${base.time})`,
    ratio: +ratio.toFixed( 2 ),
    ms: now.ms
  }
  for( const k of [ 'computed', 'effects' ] )
    if( now.work[ k ] !== base.work[ k ] )
      failures.push( `${name}: ${k} ${now.work[ k ]} per write, baseline ${base.work[ k ]}` )
  if( ratio > MARGIN )
    failures.push( `${name}: ${ratio.toFixed( 2 )}× the baseline time (fails past ${MARGIN}×)` )
}

console.log( `calibration ${result.unit} ms; work and time as now (baseline)` )
console.table( table )
if( failures.length ){
  console.error( 'Reactivity benchmark failed:\n  ' + failures.join('\n  ') )
  process.exit( 1 )
}
console.log('Reactivity benchmark within the baseline')
