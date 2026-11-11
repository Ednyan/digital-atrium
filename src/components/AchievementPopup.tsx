// An achievement earned, said as it happens (lib/stats), wherever one is -- an
// atrium, Home, a menu open: a card sliding in from the screen's right edge, its
// mark lit in its family's colour, gone after a few seconds, one at a time however
// many come at once. In the page's top layer (a popover), over everything on it,
// whatever opened last: no stacking order to win.

import { play } from '../lib/sounds'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { useTranslation, type LanguageCode } from '../lib/i18n'
import { ACHIEVEMENTS, FAMILY_COLOUR } from '../lib/achievements'
import { ACHIEVEMENT_EVENT } from '../lib/stats'
import type { TranslationKey } from '../locales/en'
import AchievementIcon from './AchievementIcon'

const SHOWN = 5200
const LEAVING = 420

export default function AchievementPopup() {
  const { t, language } = useTranslation()
  const [queue, setQueue] = useState<{ id: string; n: number }[]>([])
  const [leaving, setLeaving] = useState(false)
  const said = useRef(0)
  useEffect(() => {
    const earned = (e: Event) => setQueue(waiting => [...waiting, { id: (e as CustomEvent<string>).detail, n: ++said.current }])
    window.addEventListener(ACHIEVEMENT_EVENT, earned)
    return () => window.removeEventListener(ACHIEVEMENT_EVENT, earned)
  }, [])
  const head = queue[0]
  useEffect(() => {
    if (!head) return
    // Heard as it's shown: each in turn, never over a template's reveal (lib/sounds).
    play('achievement')
    const go = window.setTimeout(() => setLeaving(true), SHOWN)
    const next = window.setTimeout(() => { setLeaving(false); setQueue(waiting => waiting.slice(1)) }, SHOWN + LEAVING)
    return () => { window.clearTimeout(go); window.clearTimeout(next) }
  }, [head?.n])
  const one = head && ACHIEVEMENTS.find(award => award.id === head.id)
  const card = useRef<HTMLDivElement>(null)
  // (Set here: React's types don't know the attribute yet.)
  useLayoutEffect(() => {
    const shown = card.current
    if (!shown?.showPopover) return
    shown.setAttribute('popover', 'manual')
    try { shown.showPopover() } catch { /* shown in the page, then */ }
  }, [head?.n, !!one])
  if (!one) return null
  return (
    <div
      ref={card}
      key={head.n}
      role="status"
      data-achievement-popup={one.id}
      data-leaving={leaving || undefined}
      className="achievement-pop pointer-events-none"
      style={{ '--achievement': FAMILY_COLOUR[one.family] } as CSSProperties}
    >
      <AchievementIcon one={one} size={54} className="achievement-pop-icon" />
      <span className="min-w-0">
        <span className="block text-[10px] tracking-[0.24em] uppercase text-nier-bg/75">{t('achievements.unlocked')}</span>
        <span className="block mt-1 text-[15px] leading-tight text-nier-strong truncate">{t(`achievements.name.${one.id}` as TranslationKey)}</span>
        <span className="block mt-1 text-[11px] leading-snug text-nier-bg/75">{t(`achievements.what.${one.what}` as TranslationKey, { n: one.goal.toLocaleString(language as LanguageCode) })}</span>
      </span>
    </div>
  )
}
