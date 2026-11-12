// What a calendar trace shows (lib/calendar): its .ics drawn as a month or a
// week, with the last and next of them, Today, and Month / Week over its top
// right. Month or week is the trace's (Trace.calendar), kept as a setting is;
// which month or week, this screen's alone -- it opens on today's.
//
// Its own events are made here: a day (or a week's hour) double-clicked makes
// one, an event clicked is changed or deleted (CalendarEventEditor) -- written
// into its own file (onSave). One that follows a calendar only shows its events.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { calendarLook, calendarSvg, calendarText, dayKey, daysShown, HEADER, stepped, timeKey, weekStartFor, withEvent, withoutEvent, type Calendar, type CalendarView, type EventDraft, type Occurrence } from '../lib/calendar'
import CalendarEventEditor from './CalendarEventEditor'
import { calendarOf } from '../lib/calendarLink'
import { baseSizeOf } from '../lib/traceGeometry'
import { useTranslation } from '../lib/i18n'
import { useLandingTheme } from '../lib/useLandingTheme'
import type { Trace } from '../types/database'

const FILL = 'absolute inset-0 [&>svg]:w-full [&>svg]:h-full [&>svg]:block'

export default function CalendarTrace({ trace, onView, onSave }: {
  trace: Trace
  // Month or week chosen, kept on the trace; without it (an atrium one can't
  // change), chosen for this screen only.
  onView?: (view: CalendarView) => void
  // Its file anew, an event made, changed or deleted -- where its events can be (not one followed).
  onSave?: (text: string) => void
}) {
  const { t, language } = useTranslation()
  // Undefined while it's read; null when it can't be.
  const [calendar, setCalendar] = useState<Calendar | null | undefined>(undefined)
  // Its link's calendar as it is now, where it follows one; its file's otherwise.
  const link = trace.calendar?.link
  const [again, setAgain] = useState(0)
  const [reading, setReading] = useState(false)
  useEffect(() => {
    const url = trace.mediaUrl
    if (!url && !link) { setCalendar(null); return }
    let live = true
    const load = (fresh = false) => {
      setReading(true)
      void calendarOf({ mediaUrl: url, calendar: trace.calendar }, fresh).then(read => { if (live) { setCalendar(read); setReading(false) } })
    }
    load(again > 0)
    // A file still being written to the vault is read again once it's there.
    const written = (e: Event) => { if ((e as CustomEvent).detail?.localUrl === url) load() }
    window.addEventListener('atrium:vault-write-complete', written)
    return () => { live = false; window.removeEventListener('atrium:vault-write-complete', written) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trace.mediaUrl, link, again])

  const [anchor, setAnchor] = useState(() => new Date())
  const [ownView, setOwnView] = useState<CalendarView | null>(null)
  const view = ownView ?? trace.calendar?.view ?? 'month'
  const size = baseSizeOf(trace)
  const weekStart = weekStartFor(language)
  // Light or dark as it's set -- or, set to Auto, as this person has the atrium.
  const { resolved: mode } = useLandingTheme()
  const look = calendarLook(trace, mode)
  const weekWord = t('atrium.calendar.weekShort')
  const { svg, events } = useMemo(() => {
    if (!calendar) return { svg: '', events: [] as Occurrence[] }
    const { from, to } = daysShown(view, anchor, weekStart)
    const shown = calendar.between(from, to)
    return { svg: calendarSvg(shown, view, anchor, size.width, size.height, look, language, new Date(), weekStart, 1, weekWord), events: shown }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendar, view, anchor, size.width, size.height, look.ink, look.surface, language, weekStart, weekWord])

  // An event being made or changed: where, from what, and whether it's only shown.
  const [editing, setEditing] = useState<{ at: { x: number; y: number }; draft: EventDraft; uid?: string; readOnly: boolean } | null>(null)
  const pressedAt = useRef<{ x: number; y: number } | null>(null)
  const write = async (change: (text: string) => Promise<string>) => {
    setEditing(null)
    if (!onSave || !trace.mediaUrl) return
    const text = await calendarText(trace.mediaUrl)
    if (text !== null) onSave(await change(text))
  }
  const draftOf = (e: Occurrence): EventDraft => {
    // A repeat is changed as its whole series: from when it began.
    const { start, end } = e.series ?? e
    return { title: e.title === '—' ? '' : e.title, date: dayKey(start), allDay: e.allDay, from: timeKey(start), to: timeKey(end), repeat: e.repeat ?? 'none', colour: e.colour }
  }
  // A day (or an hour of one) double-clicked: an event made there.
  const makeAt = (event: MouseEvent) => {
    if (!onSave) return
    const day = (event.target as Element).closest?.('[data-day]')
    if (!day) return
    event.stopPropagation()
    const hour = day.getAttribute('data-hour')
    const from = hour === null ? '09:00' : `${hour.padStart(2, '0')}:00`
    const to = hour === null ? '10:00' : `${String(Math.min(23, Number(hour) + 1)).padStart(2, '0')}:00`
    setEditing({ at: { x: event.clientX, y: event.clientY }, draft: { title: '', date: day.getAttribute('data-day')!, allDay: hour === null && view === 'week', from, to, repeat: 'none' }, readOnly: false })
  }
  // An event clicked (not dragged): changed, or only shown.
  const openAt = (event: MouseEvent) => {
    const mark = (event.target as Element).closest?.('[data-event]')
    const pressed = pressedAt.current
    if (!mark || (pressed && Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 4)) return
    const uid = mark.getAttribute('data-event'), at = Number(mark.getAttribute('data-at'))
    const one = events.find(e => e.uid === uid && e.start.getTime() === at)
    if (!one) return
    event.stopPropagation()
    setEditing({ at: { x: event.clientX, y: event.clientY }, draft: draftOf(one), uid: one.uid, readOnly: !onSave })
  }

  if (!calendar) {
    return (
      <div className="w-full h-full flex items-center justify-center pointer-events-none select-none" style={{ background: look.surface }}>
        <span className="text-[10px] tracking-wider uppercase" style={{ color: `${look.ink}99` }}>
          {calendar === null ? t('atrium.calendar.unreadable') : t('atrium.controls.rendering')}
        </span>
      </div>
    )
  }

  const choose = (next: CalendarView) => {
    if (next === view) return
    if (onView) { setOwnView(null); onView(next) } else setOwnView(next)
  }
  // Its own buttons are its: never the start of a drag, nor a double-click on the trace.
  const keep = (e: { stopPropagation(): void }) => e.stopPropagation()
  const button: CSSProperties = { color: look.ink, borderColor: `${look.ink}55`, height: 26 }
  const BUTTON = 'px-2.5 border text-[11px] tracking-[0.1em] uppercase leading-none hover:opacity-80'
  return (
    <div
      className="w-full h-full relative select-none"
      data-calendar={trace.id}
      data-view={view}
      onMouseDown={event => { pressedAt.current = { x: event.clientX, y: event.clientY } }}
      onClick={openAt}
      onDoubleClick={makeAt}
    >
      <div className={FILL} dangerouslySetInnerHTML={{ __html: svg }} />
      {editing && (
        <CalendarEventEditor
          at={editing.at}
          start={editing.draft}
          existing={!!editing.uid}
          readOnly={editing.readOnly}
          onSave={draft => void write(text => withEvent(text, draft, editing.uid))}
          onDelete={() => { if (editing.uid) void write(text => withoutEvent(text, editing.uid!)) }}
          onClose={() => setEditing(null)}
        />
      )}
      <div
        className="absolute right-[14px] flex items-center gap-1.5"
        style={{ top: (HEADER - 26) / 2 - 4, pointerEvents: 'auto' }}
        onMouseDown={keep}
        onTouchStart={keep}
        onDoubleClick={keep}
      >
        {link && (
          <button type="button" data-calendar-refresh="" aria-label={t('atrium.calendar.refresh')} title={t('atrium.calendar.refresh')} className={BUTTON} style={button} disabled={reading} onClick={() => setAgain(n => n + 1)}>
            <span className={reading ? 'inline-block animate-spin' : 'inline-block'}>↻</span>
          </button>
        )}
        <button type="button" data-calendar-back="" aria-label={t('atrium.calendar.back')} title={t('atrium.calendar.back')} className={BUTTON} style={button} onClick={() => setAnchor(at => stepped(view, at, -1))}>‹</button>
        <button type="button" data-calendar-today="" className={BUTTON} style={button} onClick={() => setAnchor(new Date())}>{t('atrium.calendar.today')}</button>
        <button type="button" data-calendar-next="" aria-label={t('atrium.calendar.next')} title={t('atrium.calendar.next')} className={BUTTON} style={button} onClick={() => setAnchor(at => stepped(view, at, 1))}>›</button>
        <span className="flex border ml-1.5" style={{ borderColor: `${look.ink}55` }}>
          {(['month', 'week'] as const).map(kind => (
            <button
              key={kind}
              type="button"
              data-calendar-view={kind}
              aria-pressed={view === kind}
              className="px-2.5 text-[11px] tracking-[0.1em] uppercase leading-none"
              style={{ height: 24, color: view === kind ? (look.surface ?? '#191919') : look.ink, background: view === kind ? look.ink : 'transparent' }}
              onClick={() => choose(kind)}
            >
              {t(kind === 'month' ? 'atrium.calendar.month' : 'atrium.calendar.week')}
            </button>
          ))}
        </span>
      </div>
    </div>
  )
}
