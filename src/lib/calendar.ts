// Calendars as traces. A calendar trace's file (media_url) is the .ics itself,
// read here with ical.js -- fetched only when a calendar is shown -- so its
// repeating events, their exceptions and the time zones it defines are read as
// a calendar app reads them. It's drawn as SVG (calendarSvg): the same drawing
// on the canvas (components/CalendarTrace) and in an export (lib/exportImage).
// Trace.calendar keeps how it's shown: a month, or a week.

import { ATRIUM_FONT, atriumInk } from './atriumLook.ts'
import type { Trace } from '../types/database'

export type CalendarView = 'month' | 'week'
// `link`: an iCal address it follows (lib/calendarLink), read again as it's shown.
export interface CalendarSettings { view: CalendarView; link?: string }
// `uid` is its event's; a repeat's `series` is when its event began (its first),
// and `repeat` how it repeats, where that's plain enough to say ('custom' if not).
export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'
export interface Occurrence { title: string; start: Date; end: Date; allDay: boolean; uid?: string; series?: { start: Date; end: Date }; repeat?: Repeat }
export interface Calendar { name: string | null; between(from: Date, to: Date): Occurrence[] }

export const CALENDAR_SIZE = { width: 720, height: 540 }
export const isCalendarFile = (file: { name: string }) => /\.ics$/i.test(file.name)

/** Settings as kept in a row -- the trust boundary. */
export function asCalendarSettings(raw: unknown): CalendarSettings | undefined {
  const value = typeof raw === 'string' ? (() => { try { return JSON.parse(raw) } catch { return null } })() : raw
  if (!value || typeof value !== 'object') return undefined
  const link = (value as { link?: unknown }).link
  return {
    view: (value as { view?: unknown }).view === 'week' ? 'week' : 'month',
    ...(typeof link === 'string' && /^https?:\/\/\S+$/i.test(link) && link.length < 2048 ? { link } : {}),
  }
}

/** An address as one a calendar can be read from: webcal:// as https://, or null. */
export function asCalendarLink(text: string): string | null {
  const link = text.trim().replace(/^webcal:/i, 'https:')
  try {
    const url = new URL(link)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

/** Whether a pasted address is plainly a calendar's: webcal://, an .ics, Google's or Outlook's iCal address. */
export const looksLikeCalendarLink = (text: string) =>
  /^webcal:\/\/\S+$/i.test(text.trim()) || (/^https?:\/\/\S+$/i.test(text.trim()) && (/\.ics([?#]|$)/i.test(text.trim()) || /calendar\.google\.com\/calendar\/ical\//i.test(text)))

// ---- Reading ---------------------------------------------------------------------

// However far back a repeating event began, this many of its repeats are looked
// through at most to reach the days shown: a daily one from 1970 is well within it.
const MOST_REPEATS = 25000

export async function readCalendar(text: string): Promise<Calendar> {
  const { default: ICAL } = await import('ical.js')
  let root: InstanceType<typeof ICAL.Component>
  try {
    root = new ICAL.Component(ICAL.parse(text))
  } catch {
    throw new Error('it is not a calendar file')
  }
  // Its own time zones first, for its times to be read in them.
  for (const zone of root.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(zone)
  const events = root.getAllSubcomponents('vevent').map(part => new ICAL.Event(part))
  // A change to one repeat of an event (RECURRENCE-ID) belongs to that event.
  const own = events.filter(event => !event.isRecurrenceException())
  for (const change of events.filter(event => event.isRecurrenceException())) own.find(event => event.uid === change.uid)?.relateException(change)
  const cancelled = (event: InstanceType<typeof ICAL.Event>) => String(event.component.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED'
  const name = root.getFirstPropertyValue('x-wr-calname')

  return {
    name: typeof name === 'string' && name.trim() ? name.trim() : null,
    between(from, to) {
      const out: Occurrence[] = []
      const endOf = (start: InstanceType<typeof ICAL.Time>, end: InstanceType<typeof ICAL.Time> | null) =>
        // No end: a day, for a whole day's; for a time, the moment itself.
        end ? end.toJSDate() : new Date(start.toJSDate().getTime() + (start.isDate ? 86_400_000 : 0))
      const add = (title: string, start: InstanceType<typeof ICAL.Time>, end: InstanceType<typeof ICAL.Time> | null, more: Partial<Occurrence>) => {
        const s = start.toJSDate(), e = endOf(start, end)
        if (e > from && s < to || (e.getTime() === s.getTime() && s >= from && s < to)) out.push({ title: title || '—', start: s, end: e, allDay: start.isDate, ...more })
      }
      for (const event of own) {
        if (!event.startDate || cancelled(event)) continue
        if (!event.isRecurring()) { add(event.summary, event.startDate, event.endDate, { uid: event.uid, repeat: 'none' }); continue }
        const series = { start: event.startDate.toJSDate(), end: endOf(event.startDate, event.endDate) }
        const repeat = repeatOf(event.component.getFirstPropertyValue('rrule'))
        const repeats = event.iterator()
        for (let i = 0, next = repeats.next(); next && i < MOST_REPEATS; i++, next = repeats.next()) {
          if (next.toJSDate() >= to) break
          const one = event.getOccurrenceDetails(next)
          if (cancelled(one.item)) continue
          add(one.item.summary, one.startDate, one.endDate, { uid: event.uid, series, repeat })
        }
      }
      return out.sort((a, b) => +a.start - +b.start || (a.allDay === b.allDay ? 0 : a.allDay ? -1 : 1))
    },
  }
}

// A repeat as plain as a person says it: every day, week, month, year -- or custom.
function repeatOf(rule: unknown): Repeat {
  const recur = rule as { freq?: string; interval?: number; parts?: Record<string, unknown> } | null
  if (!recur?.freq) return 'none'
  if ((recur.interval ?? 1) !== 1 || Object.keys(recur.parts ?? {}).length) return 'custom'
  return ({ DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' } as Record<string, Repeat>)[recur.freq] ?? 'custom'
}

// One read a file -- its text, and the calendar in it -- shared by every drawing
// of it; a file that can't be read is tried again next time it's asked for.
const texts = new Map<string, Promise<string | null>>()
const files = new Map<string, Promise<Calendar | null>>()
/** A calendar file's text, as kept: what an event is added to or taken from. */
export function calendarText(url: string): Promise<string | null> {
  let text = texts.get(url)
  if (!text) {
    text = (async () => {
      const { fetchMedia } = await import('./exportImage')
      const blob = await fetchMedia(url)
      return blob ? blob.text() : null
    })().catch(() => null)
    texts.set(url, text)
    void text.then(read => { if (read === null) texts.delete(url) })
  }
  return text
}
export function calendarFile(url: string): Promise<Calendar | null> {
  let file = files.get(url)
  if (!file) {
    file = calendarText(url).then(text => (text === null ? null : readCalendar(text))).catch(() => null)
    files.set(url, file)
    void file.then(read => { if (!read) files.delete(url) })
  }
  return file
}
/** A file just placed or written, from its text: its vault copy may still be on its way. */
export const keepCalendarFile = (url: string, text: string) => {
  texts.set(url, Promise.resolve(text))
  files.set(url, readCalendar(text).catch(() => null))
}

// ---- Making its events ---------------------------------------------------------------

/** An event as it's made or changed in the atrium: a day (YYYY-MM-DD), the whole
 *  of it or from a time to a time (HH:MM), and how it repeats ('custom' keeps a
 *  rule the atrium can't say). */
export interface EventDraft { title: string; date: string; allDay: boolean; from: string; to: string; repeat: Repeat }

const pad2 = (n: number) => String(n).padStart(2, '0')
export const dayKey = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
export const timeKey = (date: Date) => `${pad2(date.getHours())}:${pad2(date.getMinutes())}`

/** The calendar file's text with this event made -- or, by its uid, made anew. */
export async function withEvent(text: string, draft: EventDraft, uid?: string): Promise<string> {
  const { default: ICAL } = await import('ical.js')
  const root = new ICAL.Component(ICAL.parse(text))
  const [y, m, d] = draft.date.split('-').map(Number)
  const at = (time: string) => { const [h, min] = time.split(':').map(Number); return new Date(y, m - 1, d, h || 0, min || 0) }
  const start = draft.allDay ? ICAL.Time.fromData({ year: y, month: m, day: d, isDate: true }) : ICAL.Time.fromJSDate(at(draft.from), true)
  const endDate = draft.allDay ? new Date(y, m - 1, d + 1) : at(draft.to) > at(draft.from) ? at(draft.to) : new Date(at(draft.from).getTime() + 3_600_000)
  const end = draft.allDay ? ICAL.Time.fromData({ year: endDate.getFullYear(), month: endDate.getMonth() + 1, day: endDate.getDate(), isDate: true }) : ICAL.Time.fromJSDate(endDate, true)
  let event = uid ? root.getAllSubcomponents('vevent').find(part => part.getFirstPropertyValue('uid') === uid && !part.hasProperty('recurrence-id')) : undefined
  if (!event) {
    event = new ICAL.Component('vevent')
    event.addPropertyWithValue('uid', uid ?? `${crypto.randomUUID()}@digitalatrium.org`)
    event.addPropertyWithValue('dtstamp', ICAL.Time.now())
    root.addSubcomponent(event)
  }
  event.updatePropertyWithValue('summary', draft.title.trim() || '—')
  event.updatePropertyWithValue('dtstart', start)
  event.removeAllProperties('duration')
  event.updatePropertyWithValue('dtend', end)
  if (draft.repeat !== 'custom') {
    event.removeAllProperties('rrule')
    if (draft.repeat !== 'none') event.addPropertyWithValue('rrule', new ICAL.Recur({ freq: draft.repeat.toUpperCase() as 'DAILY' }))
  }
  return root.toString()
}

/** The calendar file's text without this event: every repeat of it, and every change to one. */
export async function withoutEvent(text: string, uid: string): Promise<string> {
  const { default: ICAL } = await import('ical.js')
  const root = new ICAL.Component(ICAL.parse(text))
  for (const part of root.getAllSubcomponents('vevent')) if (part.getFirstPropertyValue('uid') === uid) root.removeSubcomponent(part)
  return root.toString()
}

// ---- Days ------------------------------------------------------------------------

const DAY = 86_400_000
const atMidnight = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const addDays = (date: Date, n: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n)
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** The first day of the week where this language is spoken: 1 Monday .. 7 Sunday. */
export function weekStartFor(language: string): number {
  try {
    const locale = new Intl.Locale(language) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } }
    return (locale.getWeekInfo?.() ?? locale.weekInfo)?.firstDay ?? 1
  } catch {
    return 1
  }
}
const weekOf = (date: Date, weekStart: number) => addDays(atMidnight(date), -((date.getDay() - (weekStart % 7) + 7) % 7))

/** The days a view of `anchor` shows: a month's whole weeks, or its week. */
export function daysShown(view: CalendarView, anchor: Date, weekStart: number): { from: Date; to: Date; weeks: number } {
  if (view === 'week') { const from = weekOf(anchor, weekStart); return { from, to: addDays(from, 7), weeks: 1 } }
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const from = weekOf(first, weekStart)
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
  const weeks = Math.ceil((Math.round((+last - +from) / DAY) + 1) / 7)
  return { from, to: addDays(from, weeks * 7), weeks }
}

/** A month or a week on from `anchor` (back, with -1). */
export const stepped = (view: CalendarView, anchor: Date, by: number) =>
  view === 'week' ? addDays(anchor, 7 * by) : new Date(anchor.getFullYear(), anchor.getMonth() + by, 1)

// ---- Drawing ---------------------------------------------------------------------

export interface CalendarLook { ink: string; surface?: string; accent: string; font: string }
/** In the Atrium's look, in the trace's own colours: its fill behind, its text colour (or one readable on the fill). */
export function calendarLook(trace: Pick<Trace, 'fillColor' | 'textColor' | 'showBackground'>): CalendarLook {
  const { ink, surface } = atriumInk(trace.fillColor, trace.textColor)
  return { ink, surface: trace.showBackground === false ? undefined : surface, accent: '#ff8a3d', font: ATRIUM_FONT }
}
const esc = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const n = (v: number) => Math.round(v * 100) / 100
// Clipped to `width`, by its letters at about this size: SVG text has no ellipsis of its own.
const fit = (text: string, width: number, size: number) => {
  const most = Math.max(0, Math.floor(width / (size * 0.6)))
  return text.length <= most ? text : most <= 1 ? '' : `${text.slice(0, most - 1)}…`
}

// An event drawn: which it is, and when this repeat of it begins, for a press on it.
const eventMark = (e: Occurrence) => (e.uid ? ` data-event="${esc(e.uid)}" data-at="${e.start.getTime()}"` : '')

/** The header's height: where a calendar's own buttons go (CalendarTrace). */
export const HEADER = 48
const PAD = 14

export function calendarSvg(events: Occurrence[], view: CalendarView, anchor: Date, width: number, height: number, look: CalendarLook, language: string, today: Date, weekStart = weekStartFor(language), scale = 1): string {
  const { from, weeks } = daysShown(view, anchor, weekStart)
  const ink = look.ink, faint = `${ink}33`, quiet = `${ink}99`
  const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(width)} ${n(height)}" width="${n(width * scale)}" height="${n(height * scale)}" font-family="${esc(look.font)}">`]
  if (look.surface) out.push(`<rect width="${n(width)}" height="${n(height)}" fill="${look.surface}"/>`)
  const title = view === 'month'
    ? new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric' }).format(anchor)
    : formatRange(language, from, addDays(from, 6))
  out.push(`<text x="${PAD}" y="${PAD + 20}" font-size="19" fill="${ink}">${esc(fit(title, width - PAD * 2 - 230, 19))}</text>`)
  const dayNames = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(language, { weekday: 'short' }).format(addDays(from, i)))
  const time = new Intl.DateTimeFormat(language, { hour: 'numeric', minute: '2-digit' })
  // In a month's small days, a time as short as it reads: 9AM, 2:30PM; 09:00 where days run to 24.
  const twelve = time.resolvedOptions().hour12
  const shortTime = (date: Date) => twelve
    ? new Intl.DateTimeFormat(language, { hour: 'numeric', ...(date.getMinutes() ? { minute: '2-digit' } : {}) }).formatToParts(date).map(part => part.value).join('').replace(/\s+/g, '')
    : time.format(date)
  const left = PAD, top = HEADER, gridW = width - PAD * 2

  if (view === 'month') {
    const namesH = 22, cellW = gridW / 7, cellH = (height - top - namesH - PAD) / weeks
    dayNames.forEach((name, i) => out.push(`<text x="${n(left + i * cellW + 6)}" y="${n(top + 14)}" font-size="10" fill="${quiet}" letter-spacing="1">${esc(name.toUpperCase())}</text>`))
    const gridTop = top + namesH
    const lines: string[] = []
    for (let r = 0; r <= weeks; r++) lines.push(`M${n(left)} ${n(gridTop + r * cellH)}H${n(left + gridW)}`)
    for (let c = 0; c <= 7; c++) lines.push(`M${n(left + c * cellW)} ${n(gridTop)}V${n(gridTop + weeks * cellH)}`)
    out.push(`<path d="${lines.join('')}" stroke="${faint}" stroke-width="1" fill="none"/>`)
    const lineH = 15, room = Math.max(0, Math.floor((cellH - 24) / lineH))
    for (let i = 0; i < weeks * 7; i++) {
      const day = addDays(from, i), x = left + (i % 7) * cellW, y = gridTop + Math.floor(i / 7) * cellH
      // Where a press means this day (CalendarTrace).
      out.push(`<rect data-day="${dayKey(day)}" x="${n(x)}" y="${n(y)}" width="${n(cellW)}" height="${n(cellH)}" fill="transparent" pointer-events="all"/>`)
      const inMonth = day.getMonth() === anchor.getMonth()
      if (sameDay(day, today)) out.push(`<circle cx="${n(x + 13)}" cy="${n(y + 12)}" r="9.5" fill="${look.accent}"/>`)
      out.push(`<text x="${n(x + 13)}" y="${n(y + 16)}" font-size="11" text-anchor="middle" fill="${sameDay(day, today) ? (look.surface ?? '#191919') : inMonth ? ink : quiet}">${day.getDate()}</text>`)
      const end = addDays(day, 1)
      const todays = events.filter(e => e.start < end && (e.end > day || +e.end === +e.start && e.start >= day))
      const shown = todays.length > room ? Math.max(0, room - 1) : todays.length
      todays.slice(0, shown).forEach((e, k) => {
        const ly = y + 22 + k * lineH
        const words = e.allDay ? e.title : `${shortTime(e.start)} ${e.title}`
        out.push(`<g${eventMark(e)}>`)
        out.push(`<rect x="${n(x + 3)}" y="${n(ly)}" width="${n(cellW - 6)}" height="${lineH - 2}" rx="2" fill="${look.accent}" fill-opacity="${e.allDay ? 0.22 : 0}" pointer-events="all"/>`)
        out.push(`<text x="${n(x + 6)}" y="${n(ly + 10.5)}" font-size="10" fill="${inMonth ? ink : quiet}">${esc(fit(words, cellW - 10, 10))}</text>`)
        out.push('</g>')
      })
      if (todays.length > shown) out.push(`<text x="${n(x + 6)}" y="${n(y + 22 + shown * lineH + 10.5)}" font-size="10" fill="${quiet}">+${todays.length - shown}</text>`)
    }
  } else {
    // A week: its days across, its hours down -- at least 8 to 20, more for events outside them.
    const namesH = 34, gutter = 44, colW = (gridW - gutter) / 7
    const allDay = events.filter(e => e.allDay)
    const timed = events.filter(e => !e.allDay)
    const lanesAllDay = Math.min(3, Math.max(0, ...Array.from({ length: 7 }, (_, d) => allDay.filter(e => e.start < addDays(from, d + 1) && e.end > addDays(from, d)).length)))
    const stripH = lanesAllDay ? lanesAllDay * 16 + 6 : 0
    const hourOf = (date: Date) => date.getHours() + date.getMinutes() / 60
    const firstHour = Math.max(0, Math.min(8, ...timed.map(e => Math.floor(hourOf(e.start)))))
    const lastHour = Math.min(24, Math.max(20, ...timed.map(e => (sameDay(e.start, e.end) ? Math.ceil(hourOf(e.end)) : 24))))
    const gridTop = top + namesH + stripH, gridH = height - gridTop - PAD, hourH = gridH / Math.max(1, lastHour - firstHour)
    for (let d = 0; d < 7; d++) {
      const day = addDays(from, d), x = left + gutter + d * colW
      const isToday = sameDay(day, today)
      // Where a press means this day, at this hour (CalendarTrace); its strip, the whole day.
      out.push(`<rect data-day="${dayKey(day)}" x="${n(x)}" y="${n(top)}" width="${n(colW)}" height="${n(namesH + stripH)}" fill="transparent" pointer-events="all"/>`)
      for (let h = firstHour; h < lastHour; h++) out.push(`<rect data-day="${dayKey(day)}" data-hour="${h}" x="${n(x)}" y="${n(gridTop + (h - firstHour) * hourH)}" width="${n(colW)}" height="${n(hourH)}" fill="transparent" pointer-events="all"/>`)
      out.push(`<text x="${n(x + 6)}" y="${n(top + 12)}" font-size="10" fill="${quiet}" letter-spacing="1">${esc(dayNames[d].toUpperCase())}</text>`)
      if (isToday) out.push(`<rect x="${n(x + 4)}" y="${n(top + 15)}" width="24" height="17" rx="2" fill="${look.accent}"/>`)
      out.push(`<text x="${n(x + 16)}" y="${n(top + 28)}" font-size="12" text-anchor="middle" fill="${isToday ? (look.surface ?? '#191919') : ink}">${day.getDate()}</text>`)
      allDay.filter(e => e.start < addDays(day, 1) && e.end > day).slice(0, lanesAllDay).forEach((e, k) => {
        const y = top + namesH + 2 + k * 16
        out.push(`<g${eventMark(e)}>`)
        out.push(`<rect x="${n(x + 2)}" y="${n(y)}" width="${n(colW - 4)}" height="14" rx="2" fill="${look.accent}" fill-opacity="0.22"/>`)
        out.push(`<text x="${n(x + 6)}" y="${n(y + 10)}" font-size="10" fill="${ink}">${esc(fit(e.title, colW - 10, 10))}</text>`)
        out.push('</g>')
      })
      // Its timed events, side by side where they meet.
      const dayEvents = timed.filter(e => e.start < addDays(day, 1) && e.end > day).map(e => ({
        e, from: Math.max(firstHour, e.start < day ? 0 : hourOf(e.start)), to: Math.min(lastHour, e.end >= addDays(day, 1) ? 24 : hourOf(e.end)),
      }))
      const laneEnds: number[] = []
      const placed = dayEvents.map(one => {
        let lane = laneEnds.findIndex(endsAt => endsAt <= one.from)
        if (lane < 0) { lane = laneEnds.length; laneEnds.push(0) }
        laneEnds[lane] = Math.max(one.to, one.from + 0.25)
        return { ...one, lane }
      })
      const laneW = (colW - 4) / Math.max(1, laneEnds.length)
      for (const one of placed) {
        const y = gridTop + (one.from - firstHour) * hourH, h = Math.max(12, (one.to - one.from) * hourH - 1), x0 = x + 2 + one.lane * laneW
        out.push(`<g${eventMark(one.e)}>`)
        out.push(`<rect x="${n(x0)}" y="${n(y)}" width="${n(laneW - 2)}" height="${n(h)}" rx="2" fill="${look.accent}" fill-opacity="0.3" stroke="${look.accent}" stroke-opacity="0.7"/>`)
        out.push(`<text x="${n(x0 + 4)}" y="${n(y + 11)}" font-size="10" fill="${ink}">${esc(fit(one.e.title, laneW - 8, 10))}</text>`)
        if (h > 26) out.push(`<text x="${n(x0 + 4)}" y="${n(y + 23)}" font-size="9" fill="${quiet}">${esc(fit(time.format(one.e.start), laneW - 8, 9))}</text>`)
        out.push('</g>')
      }
    }
    const lines: string[] = []
    for (let h = 0; h <= lastHour - firstHour; h++) lines.push(`M${n(left + gutter)} ${n(gridTop + h * hourH)}H${n(left + gridW)}`)
    for (let d = 0; d <= 7; d++) lines.push(`M${n(left + gutter + d * colW)} ${n(top + namesH)}V${n(gridTop + gridH)}`)
    out.push(`<path d="${lines.join('')}" stroke="${faint}" stroke-width="1" fill="none"/>`)
    const hourWords = new Intl.DateTimeFormat(language, { hour: 'numeric' })
    for (let h = firstHour; h < lastHour; h++) out.push(`<text x="${n(left + gutter - 6)}" y="${n(gridTop + (h - firstHour) * hourH + 10)}" font-size="9" text-anchor="end" fill="${quiet}">${esc(hourWords.format(new Date(2000, 0, 1, h)))}</text>`)
    // Now, as a line across today.
    const now = hourOf(today), d = Math.round((+atMidnight(today) - +from) / DAY)
    if (d >= 0 && d < 7 && now >= firstHour && now <= lastHour) {
      const y = gridTop + (now - firstHour) * hourH
      out.push(`<path d="M${n(left + gutter + d * colW)} ${n(y)}h${n(colW)}" stroke="${look.accent}" stroke-width="2"/>`)
    }
  }
  out.push('</svg>')
  return out.join('')
}

function formatRange(language: string, a: Date, b: Date) {
  const format = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', year: 'numeric' }) as Intl.DateTimeFormat & { formatRange?: (a: Date, b: Date) => string }
  return format.formatRange ? format.formatRange(a, b) : `${format.format(a)} – ${format.format(b)}`
}

/** An empty calendar, a new calendar trace's file before it's given events or a file of its own. */
export function emptyCalendarFile(name: string): File {
  const text = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//The Digital Atrium//Calendar//EN', `X-WR-CALNAME:${name.replace(/[\r\n]+/g, ' ')}`, 'END:VCALENDAR', ''].join('\r\n')
  return new File([text], `${name}.ics`, { type: 'text/calendar' })
}
