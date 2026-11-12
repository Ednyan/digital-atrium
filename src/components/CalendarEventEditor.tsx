// An event of a calendar trace, made or changed where it was pressed: its title,
// its day, the whole day or from a time to a time, and how it repeats. Saved
// into the calendar's own file (lib/calendar withEvent); deleted from it. One
// that comes from a calendar it follows is only shown.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { EventDraft, Repeat } from '../lib/calendar'
import { useTranslation } from '../lib/i18n'
import type { TranslationKey } from '../locales/en'

const FIELD = 'w-full h-8 bg-nier-black text-nier-bg border border-nier-border/30 px-2 font-mono text-xs focus:outline-none focus:border-nier-border/60 disabled:opacity-50'
const LABEL = 'block text-[10px] tracking-[0.14em] uppercase text-nier-bg/70 mb-1'
const BUTTON = 'h-8 px-3 border text-[11px] tracking-[0.12em] uppercase'
const REPEATS: Repeat[] = ['none', 'daily', 'weekly', 'monthly', 'yearly']

export default function CalendarEventEditor({ at, start, existing, readOnly, onSave, onDelete, onClose }: {
  // Where it was pressed, on the screen.
  at: { x: number; y: number }
  start: EventDraft
  // Changing one already there (and every repeat of it), not making one.
  existing: boolean
  readOnly: boolean
  onSave: (draft: EventDraft) => void
  onDelete: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(start)
  const set = (part: Partial<EventDraft>) => setDraft(was => ({ ...was, ...part }))
  const box = useRef<HTMLFormElement>(null)
  // Away from it, or Escape: closed as it was.
  useEffect(() => {
    const away = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) onClose() }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopImmediatePropagation(); onClose() } }
    window.addEventListener('pointerdown', away, true)
    window.addEventListener('keydown', key, true)
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', key, true) }
  }, [onClose])
  // On the screen whole, beside where it was pressed.
  const width = 272
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, at.x + 12))
  const top = Math.max(8, Math.min(window.innerHeight - 330, at.y - 20))
  const repeats = draft.repeat === 'custom' ? [...REPEATS, 'custom' as const] : REPEATS
  return createPortal(
    <form
      ref={box}
      data-ui-element=""
      data-calendar-editor=""
      className="fixed p-3 border border-nier-border/50 bg-nier-black/95 font-mono flex flex-col gap-2.5"
      style={{ left, top, width, zIndex: 'var(--layer-menu)' }}
      onMouseDown={e => e.stopPropagation()}
      onSubmit={e => { e.preventDefault(); if (!readOnly) onSave(draft) }}
    >
      <input
        autoFocus={!readOnly}
        data-event-title=""
        value={draft.title}
        disabled={readOnly}
        onChange={e => set({ title: e.target.value })}
        placeholder={t('atrium.calendar.event.title')}
        aria-label={t('atrium.calendar.event.title')}
        className={`${FIELD} h-9 text-sm`}
      />
      <label>
        <span className={LABEL}>{t('atrium.calendar.event.day')}</span>
        <input type="date" data-event-date="" value={draft.date} disabled={readOnly} onChange={e => e.target.value && set({ date: e.target.value })} className={FIELD} />
      </label>
      <label className="flex items-center gap-2 text-xs text-nier-bg">
        <input type="checkbox" data-event-all-day="" checked={draft.allDay} disabled={readOnly} onChange={e => set({ allDay: e.target.checked })} className="accent-nier-bg" />
        {t('atrium.calendar.event.allDay')}
      </label>
      {!draft.allDay && (
        <div className="flex gap-2">
          <label className="flex-1">
            <span className={LABEL}>{t('atrium.calendar.event.from')}</span>
            <input type="time" data-event-from="" value={draft.from} disabled={readOnly} onChange={e => set({ from: e.target.value })} className={FIELD} />
          </label>
          <label className="flex-1">
            <span className={LABEL}>{t('atrium.calendar.event.to')}</span>
            <input type="time" data-event-to="" value={draft.to} disabled={readOnly} onChange={e => set({ to: e.target.value })} className={FIELD} />
          </label>
        </div>
      )}
      <label>
        <span className={LABEL}>{t('atrium.calendar.event.repeat')}</span>
        <select data-event-repeat="" value={draft.repeat} disabled={readOnly} onChange={e => set({ repeat: e.target.value as Repeat })} className={FIELD}>
          {repeats.map(one => <option key={one} value={one}>{t(`atrium.calendar.repeat.${one}` as TranslationKey)}</option>)}
        </select>
      </label>
      {readOnly ? (
        <p className="text-[11px] text-nier-bg/60">{t('atrium.calendar.event.followed')}</p>
      ) : existing && draft.repeat !== 'none' && (
        <p className="text-[11px] text-nier-bg/60">{t('atrium.calendar.event.everyRepeat')}</p>
      )}
      <div className="flex gap-1.5 justify-end">
        {existing && !readOnly && <button type="button" data-event-delete="" onClick={onDelete} className={`${BUTTON} mr-auto border-nier-border/40 danger-word`}>{t('common.delete')}</button>}
        <button type="button" data-event-close="" onClick={onClose} className={`${BUTTON} border-nier-border/40 text-nier-bg`}>{t(readOnly ? 'common.close' : 'common.cancel')}</button>
        {!readOnly && <button type="submit" data-event-save="" className={`${BUTTON} bg-nier-strong text-nier-black border-nier-strong`}>{t('common.save')}</button>}
      </div>
    </form>,
    document.querySelector('.lobby-scene') ?? document.body,
  )
}
