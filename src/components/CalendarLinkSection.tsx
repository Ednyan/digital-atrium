// A calendar trace's iCal address, in its Customization panel: followed --
// read again as the calendar's shown (lib/calendarLink) -- or let go of. An
// address is read before it's kept, so a wrong one is said so at once.

import { useState } from 'react'
import { asCalendarLink, fetchCalendarText } from '../lib/calendarLink'
import { readCalendar, type CalendarSettings } from '../lib/calendar'
import { useTranslation } from '../lib/i18n'

const BUTTON = 'px-3 h-8 border border-nier-border/40 text-nier-bg text-xs tracking-[0.1em] uppercase hover:border-nier-border/80 disabled:opacity-40'

export default function CalendarLinkSection({ settings, onChange }: { settings: CalendarSettings; onChange: (settings: CalendarSettings) => void }) {
  const { t } = useTranslation()
  const [typed, setTyped] = useState('')
  const [status, setStatus] = useState<'idle' | 'reading' | 'wrong'>('idle')
  const follow = async () => {
    const link = asCalendarLink(typed)
    if (!link) { setStatus('wrong'); return }
    setStatus('reading')
    try {
      await readCalendar(await fetchCalendarText(link))
      onChange({ ...settings, link })
      setTyped('')
      setStatus('idle')
    } catch {
      setStatus('wrong')
    }
  }
  if (settings.link) {
    let host = settings.link
    try { host = new URL(settings.link).hostname } catch { /* shown whole */ }
    return (
      <div data-calendar-link="" className="flex items-center gap-2">
        <span className="flex-1 min-w-0 truncate text-xs text-nier-bg/85" title={t('atrium.calendar.followsHint')}>{t('atrium.calendar.follows', { host })}</span>
        <button type="button" data-calendar-unfollow="" className={BUTTON} onClick={() => { const { link: _, ...rest } = settings; onChange(rest) }}>{t('atrium.calendar.unfollow')}</button>
      </div>
    )
  }
  return (
    <div data-calendar-link="">
      <div className="flex gap-2">
        <input
          value={typed}
          onChange={e => { setTyped(e.target.value); setStatus('idle') }}
          onKeyDown={e => { if (e.key === 'Enter') void follow() }}
          placeholder={t('atrium.calendar.linkPlaceholder')}
          aria-label={t('atrium.calendar.linkPlaceholder')}
          data-calendar-link-input=""
          className="flex-1 min-w-0 h-8 bg-nier-black text-nier-bg border border-nier-border/30 px-2 font-mono text-xs focus:outline-none focus:border-nier-border/60"
        />
        <button type="button" data-calendar-follow="" className={BUTTON} disabled={!typed.trim() || status === 'reading'} onClick={() => void follow()}>{status === 'reading' ? '…' : t('atrium.calendar.follow')}</button>
      </div>
      <p className="mt-1.5 text-[11px] text-nier-bg/60">{status === 'wrong' ? t('atrium.error.calendarLinkUnreadable') : t('atrium.calendar.linkHint')}</p>
    </div>
  )
}
