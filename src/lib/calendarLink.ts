// A calendar followed by its iCal address (Trace.calendar.link): read again
// each time it's shown -- at most every ten minutes -- and by its Refresh, never
// on a clock. The web reads it through the site (/api/proxy-calendar: those
// hosts don't let a page read them); the desktop app itself (its safe download,
// download_remote_image). When it can't be read, the last good reading, else
// the file it was placed with (media_url), is shown.

import { isDesktop } from './supabase'
import { calendarFile, readCalendar, type Calendar } from './calendar'
export { asCalendarLink, looksLikeCalendarLink } from './calendar'
import type { Trace } from '../types/database'

const FRESH_MS = 10 * 60_000

/** The calendar's text as its address gives it now. */
export async function fetchCalendarText(link: string): Promise<string> {
  if (isDesktop) {
    const { invoke } = await import('@tauri-apps/api/core')
    const bytes = await invoke<ArrayBuffer | number[]>('download_remote_image', { url: link })
    return new TextDecoder().decode(bytes instanceof ArrayBuffer ? bytes : new Uint8Array(bytes))
  }
  const answer = await fetch(`/api/proxy-calendar?url=${encodeURIComponent(link)}`, { cache: 'no-store' })
  if (!answer.ok) throw new Error((await answer.text().catch(() => '')) || `answered ${answer.status}`)
  return answer.text()
}

const read = new Map<string, { at: number; calendar: Promise<Calendar | null> }>()

/** The calendar at `link`, read now if it hasn't been in ten minutes (or `again`). */
export function linkedCalendar(link: string, again = false): Promise<Calendar | null> {
  const kept = read.get(link)
  if (kept && !again && Date.now() - kept.at < FRESH_MS) return kept.calendar
  const now = fetchCalendarText(link).then(readCalendar).catch(() => null)
  const calendar = now.then(fresh => fresh ?? kept?.calendar ?? null)
  read.set(link, { at: Date.now(), calendar })
  return calendar
}
/** A reading just made of `link` (as a calendar's placed): kept, not asked for again. */
export const keepLinkedCalendar = (link: string, calendar: Calendar) => { read.set(link, { at: Date.now(), calendar: Promise.resolve(calendar) }) }
/** When `link` was last read, if it has been. */
export const linkReadAt = (link: string) => read.get(link)?.at ?? null

/** What a calendar trace shows: its link's calendar, else its file's. */
export async function calendarOf(trace: Pick<Trace, 'mediaUrl' | 'calendar'>, again = false): Promise<Calendar | null> {
  const link = trace.calendar?.link
  if (link) {
    const fresh = await linkedCalendar(link, again)
    if (fresh) return fresh
  }
  return trace.mediaUrl ? calendarFile(trace.mediaUrl) : null
}
