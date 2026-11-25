/**
 * Date picker: a month as a grid of days (RFC-008 §5; WAI-ARIA's date
 * picker grid).
 *
 *   lips.use( datePicker )   // and the popover it is built on
 *
 *   <date-grid value=state.due min="2026-01-01" class="cal" day="day" on-change( setDue )/>
 *
 *   <popover open=state.picking on-change( setPicking )>
 *     <popover-trigger haspopup="dialog"><span>{state.due}</span></popover-trigger>
 *     <popover-date value=state.due label="Due date" class="sheet" day="day" on-change( setDue )/>
 *   </popover>
 *
 * Dates are ISO days, `YYYY-MM-DD`, computed in UTC so no clock change
 * moves one. `value` is the app's, and a choice comes back as `change`;
 * the month shown and the day under the keyboard are the grid's own, and
 * a new month shown says `month` (`YYYY-MM`).
 *
 * The grid keeps focus and names the active day with
 * `aria-activedescendant`, as a menu does. Left and Right move a day, Up
 * and Down a week, Home and End to the week's ends, Page Up and Page Down
 * a month (with Shift, a year), Enter or Space chooses; the buttons each
 * side of the title move a month. A day before `min`, after `max`, or one
 * `disabled( iso )` refuses is `aria-disabled` and cannot be chosen.
 *
 * The names of months and days, and the first day of the week, are the
 * reader's language's (`lang`, or the component's): from `Intl` where it
 * formats dates, which Lynx's PrimJS is not known to (`./i18n`), and from
 * `words` where it does not, or English. `first` (0 for Sunday) overrides
 * the week's start.
 *
 * Each day has the class `day` and, as it is, `is-active`, `is-selected`,
 * `is-today`, `is-outside` (of the month shown) and `is-disabled`. On
 * Lynx, which has no grid role, each day is a button, and the chosen one
 * says so (`aria-selected`): its markup is its `lynx` source.
 *
 * `popover-date` is the grid in a popover's layer, as a dialog of its
 * `label`: focused on the chosen day, or today, when it opens, and closed,
 * focus back on the trigger, when a day is chosen.
 */
import type { Plugin } from '../types'
import { popover, type PopoverApi } from './popover'

const pad = ( n: number ) => String( n ).padStart( 2, '0' )

/** The ISO day of a year, a month from 0 and a day, carried over as `Date.UTC` carries it */
export function isoOf( y: number, m: number, d: number ): string {
  const t = new Date( Date.UTC( y, m, d ) )
  return `${t.getUTCFullYear()}-${pad( t.getUTCMonth() + 1 )}-${pad( t.getUTCDate() )}`
}
const partsOf = ( iso: string ) => { const [ y, m, d ] = iso.split('-').map( Number ); return [ y, m - 1, d || 1 ] }
const dayOf = ( iso: string ) => { const [ y, m, d ] = partsOf( iso ); return new Date( Date.UTC( y, m, d ) ) }

/** `days` later, or earlier */
export const addDays = ( iso: string, days: number ) => { const [ y, m, d ] = partsOf( iso ); return isoOf( y, m, d + days ) }

/** `months` later, or earlier, on the same day or the month's last where it has fewer */
export function addMonths( iso: string, months: number ): string {
  const [ y, m, d ] = partsOf( iso ), last = new Date( Date.UTC( y, m + months + 1, 0 ) ).getUTCDate()
  return isoOf( y, m + months, Math.min( d, last ) )
}

/** The weeks a month's grid shows, each its seven ISO days, from the week holding its 1st */
export function weeksOf( month: string, first = 1 ): string[][] {
  const [ y, m ] = partsOf( month ), start = isoOf( y, m, 1 )
  let day = addDays( start, -( ( dayOf( start ).getUTCDay() - first + 7 ) % 7 ) )
  const weeks: string[][] = []
  do {
    const week: string[] = []
    for( let i = 0; i < 7; i++, day = addDays( day, 1 ) ) week.push( day )
    weeks.push( week )
  } while( partsOf( day )[ 1 ] === m )
  return weeks
}

export interface CalendarWords {
  /** January first */
  readonly months: readonly string[]
  /** Sunday first */
  readonly days: readonly string[]
  /** Sunday first: a column's head */
  readonly short: readonly string[]
  readonly prev: string
  readonly next: string
  /** The grid's title: a month of a year, month from 0. Left out, the month's name and the year */
  readonly title?: ( year: number, month: number ) => string
  /** What a day is called to a screen reader, its weekday from Sunday's 0. Left out, the four in a row */
  readonly day?: ( year: number, month: number, date: number, weekday: number ) => string
}

export const ENGLISH: CalendarWords = {
  months: [ 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December' ],
  days: [ 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday' ],
  short: [ 'Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa' ],
  prev: 'Previous month',
  next: 'Next month'
}

/**
 * The names of months and days in `lang`, from `Intl`; English where it
 * does not format dates (the least of `Intl` that `./i18n` installs writes
 * a date whole, year and all). The title and a day's name are in the
 * language's order. The buttons' words are not `Intl`'s: they are
 * `words`' or English.
 */
export function calendarWords( lang: string ): CalendarWords {
  try {
    const at = ( o: Intl.DateTimeFormatOptions ) => new Intl.DateTimeFormat( lang, { ...o, timeZone: 'UTC' })
    const month = at({ month: 'long' }), long = at({ weekday: 'long' }), short = at({ weekday: 'short' })
    const jan = month.format( new Date( Date.UTC( 2024, 0, 15 ) ) )
    if( !jan || /\d{4}/.test( jan ) ) return ENGLISH

    // 2024-01-07 is a Sunday
    const sun = ( i: number ) => new Date( Date.UTC( 2024, 0, 7 + i ) )
    return {
      ...ENGLISH,
      months: ENGLISH.months.map( ( _, i ) => month.format( new Date( Date.UTC( 2024, i, 15 ) ) ) ),
      days: ENGLISH.days.map( ( _, i ) => long.format( sun( i ) ) ),
      short: ENGLISH.short.map( ( _, i ) => short.format( sun( i ) ) ),
      title: ( y, m ) => at({ month: 'long', year: 'numeric' }).format( new Date( Date.UTC( y, m, 15 ) ) ),
      day: ( y, m, d ) => at({ dateStyle: 'full' }).format( new Date( Date.UTC( y, m, d ) ) )
    }
  }
  catch { return ENGLISH }
}

/** The day `lang`'s week starts on, 0 for Sunday, from `Intl.Locale`'s week info; Monday where it has none */
export function firstDay( lang: string ): number {
  try {
    const l: any = new Intl.Locale( lang ), w = l.getWeekInfo?.() ?? l.weekInfo
    if( w?.firstDay ) return w.firstDay % 7
  }
  catch {}
  return 1
}

/** Today, where the reader is */
const today = () => { const t = new Date(); return isoOf( t.getFullYear(), t.getMonth(), t.getDate() ) }

let seq = 0
const partOf = ( self: any ): PopoverApi => self.input.of || self.context.popover

const GRID = `<div class=input.class>
  <div class=input.head>
    <button class=input.prev aria-label=state.words.prev on-click( prev )><span>‹</span></button>
    <span id="{static.id}-title" aria-live="polite">{state.title}</span>
    <button class=input.next aria-label=state.words.next on-click( next )><span>›</span></button>
  </div>
  <div role="grid" aria-labelledby="{static.id}-title" tabindex="0" aria-activedescendant="{static.id}-{state.active}" @ref="grid" on-keydown( key )>
    <div role="row" class=input.week><for [h] in=state.heads by="long"><span role="columnheader" class=input.weekday aria-label=h.long>{h.short}</span></for></div>
    <for [w] in=state.weeks by="id">
      <div role="row" class=input.week>
        <for [d] in=w.days by="iso">
          <div id="{static.id}-{d.iso}" role="gridcell" class=d.cls aria-selected=d.selected aria-disabled=( d.disabled ? true : null ) aria-label=d.label on-click( pick, d.iso )><span>{d.n}</span></div>
        </for>
      </div>
    </for>
  </div>
</div>`

/** On Lynx: no grid role, so each day is a button that says whether it is chosen */
const GRID_LYNX = `<div class=input.class>
  <div class=input.head>
    <button class=input.prev aria-label=state.words.prev on-click( prev )><span>‹</span></button>
    <span aria-live="polite">{state.title}</span>
    <button class=input.next aria-label=state.words.next on-click( next )><span>›</span></button>
  </div>
  <div class=input.week><for [h] in=state.heads by="long"><span class=input.weekday aria-label=h.long>{h.short}</span></for></div>
  <for [w] in=state.weeks by="id">
    <div class=input.week>
      <for [d] in=w.days by="iso">
        <button class=d.cls aria-selected=d.selected aria-disabled=( d.disabled ? true : null ) aria-label=d.label on-click( pick, d.iso )><span>{d.n}</span></button>
      </for>
    </div>
  </for>
</div>`

export const datePicker: Plugin = {
  name: 'date-picker',
  requires: [ popover ],
  components: {
    'date-grid': {
      state: { shown: '', active: '', title: '', words: ENGLISH as CalendarWords, heads: [] as any[], weeks: [] as any[] },
      static: { id: '', value: undefined as string | null | undefined },
      handler: {
        onCreate(){ ( this as any ).static.id = `lips-date-${++seq}` },
        /** Given a new value, it shows its month; given anything else, it draws again */
        onInput(){
          const self = this as any, { value } = self.input, s = self.state
          if( value !== self.static.value || !s.active ){
            self.static.value = value
            s.active = value || s.active || self.input.today || today()
            s.shown = s.active.slice( 0, 7 )
          }
          self.draw()
        },
        onAttach(){ ( this as any ).input.autofocus && ( this as any ).refs.grid?.focus() },
        refused( iso: string ){
          const { min, max, disabled } = ( this as any ).input
          return !!( min && iso < min || max && iso > max || disabled?.( iso ) )
        },
        draw(){
          const self = this as any, s = self.state, input = self.input
          const lang = input.lang || self.lang || 'en', w: CalendarWords = input.words || calendarWords( lang )
          const first = input.first ?? firstDay( lang ), now = input.today || today(), [ y, m ] = partsOf( s.shown )

          s.words = w
          s.title = w.title ? w.title( y, m ) : `${w.months[ m ]} ${y}`
          s.heads = Array.from( { length: 7 }, ( _, i ) => ({ short: w.short[ ( first + i ) % 7 ], long: w.days[ ( first + i ) % 7 ] }) )
          s.weeks = weeksOf( s.shown, first ).map( week => ({
            id: week[ 0 ],
            days: week.map( iso => {
              const [ dy, dm, dd ] = partsOf( iso ), off = self.refused( iso ), on = iso === input.value
              const cls = [ input.day, iso === s.active && 'is-active', on && 'is-selected', iso === now && 'is-today', dm !== m && 'is-outside', off && 'is-disabled' ]
              const wd = dayOf( iso ).getUTCDay()
              return { iso, n: dd, selected: on, disabled: off, cls: cls.filter( Boolean ).join(' '),
                       label: w.day ? w.day( dy, dm, dd, wd ) : `${w.days[ wd ]} ${dd} ${w.months[ dm ]} ${dy}` }
            })
          }) )
        },
        /** The day under the keyboard moves, and the month shown with it */
        go( iso: string ){
          const self = this as any, s = self.state, month = iso.slice( 0, 7 )
          s.active = iso
          month !== s.shown && ( s.shown = month, self.emit( 'month', month ) )
          self.draw()
        },
        prev(){ const self = this as any; self.go( addMonths( self.state.active, -1 ) ) },
        next(){ const self = this as any; self.go( addMonths( self.state.active, 1 ) ) },
        key( e: KeyboardEvent ){
          const self = this as any, at = self.state.active, first = self.input.first ?? firstDay( self.input.lang || self.lang || 'en' )
          const back = ( dayOf( at ).getUTCDay() - first + 7 ) % 7
          const to: Record<string, () => string> = {
            ArrowLeft: () => addDays( at, -1 ), ArrowRight: () => addDays( at, 1 ),
            ArrowUp: () => addDays( at, -7 ), ArrowDown: () => addDays( at, 7 ),
            Home: () => addDays( at, -back ), End: () => addDays( at, 6 - back ),
            PageUp: () => addMonths( at, e.shiftKey ? -12 : -1 ), PageDown: () => addMonths( at, e.shiftKey ? 12 : 1 )
          }
          if( to[ e.key ] ){
            e.preventDefault?.()
            return self.go( to[ e.key ]() )
          }
          if( e.key === 'Enter' || e.key === ' ' ){
            e.preventDefault?.()
            self.choose( at )
          }
        },
        /** A tap on a day: chosen, and active; a day that cannot be chosen, nothing */
        pick( iso: string ){
          const self = this as any
          if( self.refused( iso ) ) return
          self.go( iso )
          self.choose( iso )
        },
        choose( iso: string ){
          const self = this as any
          !self.refused( iso ) && self.emit( 'change', iso )
        }
      },
      default: GRID,
      lynx: GRID_LYNX
    },

    'popover-date': {
      handler: {
        choose( iso: string ){
          ;( this as any ).emit( 'change', iso )
          partOf( this ).set( false )
        }
      },
      default: `<let p={ input.of || context.popover }/>
<popover-content of=p class=input.class popup="content">
  <div id=p.id role="dialog" aria-label=input.label>
    <date-grid value=input.value min=input.min max=input.max disabled=input.disabled first=input.first lang=input.lang words=input.words today=input.today class=input.grid head=input.head prev=input.prev next=input.next week=input.week weekday=input.weekday day=input.day autofocus=true on-change( choose )/>
  </div>
</popover-content>`
    }
  }
}
