// The top of one's profile -- who, since when, how far -- and one's achievements,
// each earned or on its way. Pressing an earned one puts it beside one's name.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation, type LanguageCode } from '../lib/i18n'
import ProfilePicture, { TheirPicture } from './ProfilePicture'
import AchievementIcon from './AchievementIcon'
import { earnedAchievements, isEarned, MOST_PINNED, ACHIEVEMENTS, FAMILY_COLOUR, progressOf, type Achievement, type Stats } from '../lib/achievements'
import type { TranslationKey } from '../locales/en'

const nameOf = (one: Achievement) => `achievements.name.${one.id}` as TranslationKey
const whatOf = (one: Achievement) => `achievements.what.${one.what}` as TranslationKey

function AchievementMark({ colour, size = 18 }: { colour: string; size?: number }) {
  return <span aria-hidden="true" className="achievement-mark block rotate-45 shrink-0" style={{ width: size, height: size, background: colour }} />
}

// A number that climbs to what it is, from what it was.
function CountUp({ value, language }: { value: number; language: string }) {
  const [shown, setShown] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    const start = from.current
    if (start === value) return
    const began = performance.now()
    let frame = 0
    const step = (now: number) => {
      const done = Math.min(1, (now - began) / 900)
      const at = Math.round(start + (value - start) * (1 - (1 - done) ** 3))
      setShown(at)
      from.current = at
      if (done < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value])
  return <>{shown.toLocaleString(language as LanguageCode)}</>
}

// The name at the top is where it's changed: pressed, it's a box of the same size,
// kept or let go of by the two beside it. Not on losing focus: on the web a name
// holds for days, and that's no thing to set by clicking elsewhere.
function NameAtTop({ name, canEdit, locked, every, under, onSave }: {
  name: string
  // The line under it, whose place the note takes while it's changed, so nothing moves.
  under: ReactNode
  canEdit: boolean
  // Why it can't be changed yet, and how often it can.
  locked: string | null
  every: string | null
  onSave: (next: string) => Promise<string | null>
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const size = 'text-3xl sm:text-[2.6rem] font-extralight leading-tight'
  const save = async () => {
    const next = draft.trim()
    if (next === name) { setEditing(false); return }
    setSaving(true)
    const failed = await onSave(next)
    setSaving(false)
    setProblem(failed)
    if (failed) return
    setEditing(false)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1800)
  }
  if (editing) {
    return (
      <div data-profile-name-edit="">
        <div className="flex items-center gap-2">
          <input
            autoFocus
            aria-label={t('profile.displayName')}
            value={draft}
            maxLength={30}
            disabled={saving}
            onFocus={e => e.currentTarget.select()}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              e.stopPropagation()
              if (e.key === 'Enter') void save()
              if (e.key === 'Escape') { setEditing(false); setProblem(null) }
            }}
            className={`${size} min-w-0 w-full max-w-[26rem] bg-transparent border-b border-nier-bg/60 text-nier-strong outline-none focus:border-nier-strong transition-colors`}
          />
          <button type="button" data-profile-name-save="" disabled={saving} aria-label={t('common.save')} title={t('common.save')} onClick={() => void save()} className="w-9 h-9 shrink-0 border border-nier-border/50 text-nier-strong hover:bg-nier-bg/10 transition-colors disabled:opacity-40">✓</button>
          <button type="button" data-profile-name-cancel="" disabled={saving} aria-label={t('common.cancel')} title={t('common.cancel')} onClick={() => { setEditing(false); setProblem(null) }} className="w-9 h-9 shrink-0 border border-nier-border/30 text-nier-bg/80 hover:text-nier-bg transition-colors disabled:opacity-40">×</button>
        </div>
        <p className={`profile-note mt-2 text-[13px] ${problem ? 'text-[#ff8585]' : 'text-nier-bg/70'}`}>{problem ?? every ?? under}</p>
      </div>
    )
  }
  return (
    <div>
      <button
        type="button"
        data-profile-name=""
        disabled={!canEdit && !locked}
        title={canEdit ? t('profile.editName') : locked ?? undefined}
        onClick={() => {
          if (!canEdit) { setProblem(locked); return }
          setDraft(name)
          setProblem(null)
          setEditing(true)
        }}
        className={`profile-name group ${size} text-nier-strong text-left break-words max-w-full`}
      >
        {name}
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" className="profile-name-pen inline-block ml-3 align-baseline text-nier-bg/70">
          <path d="M5 19 L6 15 L16 5 L19 8 L9 18 Z M14 7 L17 10" />
        </svg>
        {saved && <span aria-hidden="true" className="profile-note ml-3 text-base" style={{ color: 'rgb(var(--c-emerald))' }}>✓</span>}
      </button>
      <p className="mt-2 text-[13px] text-nier-bg/80">{problem ? <span className="profile-note inline-block">{problem}</span> : under}</p>
    </div>
  )
}

// `their`: someone else's (their picture), shown as one's own is, nothing to change.
export function ProfileTop({ name, username, colour, joined, stats, canEdit, locked, every, onSaveName, their }: {
  name: string
  username: string
  colour: string
  joined: number | null
  stats: Stats
  canEdit: boolean
  locked: string | null
  every: string | null
  onSaveName: (next: string) => Promise<string | null>
  their?: { picture: string | null }
}) {
  const { t, language } = useTranslation()
  const pinned = stats.pinned.flatMap(id => ACHIEVEMENTS.find(one => one.id === id && isEarned(one, stats)) ?? [])
  const since = joined ? new Date(joined).toLocaleDateString(language as LanguageCode, { year: 'numeric', month: 'long', day: 'numeric' }) : null
  const figures: [string, number][] = [
    [t('achievements.stat.placed'), stats.placed],
    [t('achievements.stat.streak'), stats.streak],
    [t('achievements.stat.best'), stats.bestStreak],
    [t('achievements.stat.days'), stats.daysHere],
  ]
  return (
    <section data-profile-top="" className="relative flex flex-wrap items-center gap-x-7 gap-y-5">
      <span aria-hidden="true" data-profile-light="" className="profile-glow" style={{ backgroundColor: colour }} />
      {their ? <TheirPicture colour={colour} initial={(name || username || '?').slice(0, 1)} picture={their.picture} /> : <ProfilePicture colour={colour} initial={(name || username || '?').slice(0, 1)} />}
      <div className="enter-up flex-1 min-w-[14rem]" style={{ '--i': 1 } as CSSProperties}>
        <NameAtTop
          name={name || username}
          canEdit={canEdit}
          locked={locked}
          every={every}
          onSave={onSaveName}
          under={(
            <>
              {username && <span data-profile-username="">@{username}</span>}
              {username && since && <span> · </span>}
              {since && <span data-profile-since="">{t('achievements.since', { date: since })}</span>}
            </>
          )}
        />
        {pinned.length > 0 && (
          <div data-profile-pinned="" className="mt-3.5 flex flex-wrap gap-2">
            {pinned.map(one => (
              <span key={one.id} className="profile-chip flex items-center gap-2 h-[1.9rem] px-3 border border-nier-border/40 text-[11px] text-nier-strong">
                <AchievementMark colour={FAMILY_COLOUR[one.family]} size={9} />
                {t(nameOf(one))}
              </span>
            ))}
          </div>
        )}
      </div>
      <dl className="enter-up hall-ground grid grid-cols-2 sm:grid-cols-4 border border-nier-border/30 w-full lg:w-auto" style={{ '--i': 2 } as CSSProperties}>
        {figures.map(([label, value]) => (
          <div key={label} className="px-4 py-3.5 min-w-[7.4rem] sm:border-r last:border-r-0 border-nier-border/20">
            <dd className="text-2xl font-extralight text-nier-strong tabular-nums"><CountUp value={value} language={language} /></dd>
            <dt className="mt-1.5 text-[10px] tracking-[0.1em] uppercase text-nier-bg/75">{label}</dt>
          </div>
        ))}
      </dl>
    </section>
  )
}

// Without `onToggle`, someone else's: seen, not chosen from.
export function AchievementsGrid({ stats, onToggle }: { stats: Stats; onToggle?: (id: string) => void }) {
  const { t, language } = useTranslation()
  const earned = earnedAchievements(stats).length
  return (
    <section data-achievements="" aria-labelledby="achievements-title" className="min-w-0">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="achievements-title" className="text-xs font-medium tracking-[0.24em] uppercase text-nier-strong">{t('achievements.title')}</h2>
        <span data-achievements-count="" className="text-xs text-nier-bg/80">{t('achievements.count', { earned, all: ACHIEVEMENTS.length })}</span>
      </div>
      <p className="mt-2 text-xs text-nier-bg/70">{t('achievements.hint', { most: MOST_PINNED })}</p>
      <ul className="enter-cards mt-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
        {ACHIEVEMENTS.map((one, i) => {
          const got = isEarned(one, stats)
          const chosen = stats.pinned.includes(one.id)
          const words = (
            <>
              <span className={`block mt-3.5 text-xs font-medium ${got ? 'text-nier-strong' : 'text-nier-bg/85'}`}>{t(nameOf(one))}</span>
              <span className="block mt-1.5 text-[11px] leading-snug text-nier-bg/75">{t(whatOf(one), { n: one.goal.toLocaleString(language as LanguageCode) })}</span>
            </>
          )
          const mark = <AchievementIcon one={one} earned={got} size={46} />
          const progress = progressOf(one, stats)
          return (
            <li key={one.id} data-achievement={one.id} data-earned={got || undefined}>
              {got ? (
                <button
                  type="button"
                  aria-pressed={chosen}
                  disabled={!onToggle}
                  onClick={() => onToggle?.(one.id)}
                  className={`achievement-card hall-ground w-full h-full min-h-[9.25rem] flex flex-col items-start text-left p-3.5 pt-4 border ${chosen ? 'border-nier-bg bg-[linear-gradient(rgb(var(--c-fg)/0.1),rgb(var(--c-fg)/0.1))]' : 'border-nier-border/45 bg-[linear-gradient(rgb(var(--c-fg)/0.05),rgb(var(--c-fg)/0.05))] hover:border-nier-border/80'}`}
                  style={{ '--achievement': FAMILY_COLOUR[one.family] } as CSSProperties}
                >
                  {mark}
                  {words}
                </button>
              ) : (
                <div className="h-full min-h-[9.25rem] p-3.5 pt-4 border border-nier-border/20 flex flex-col">
                  {mark}
                  {words}
                  {progress > 0 && (
                    <span aria-hidden="true" className="block mt-auto pt-3">
                      <span className="block h-[3px] bg-nier-border/25 overflow-hidden">
                        <span className="achievement-bar block h-full" style={{ width: `${progress * 100}%`, background: 'rgb(255 138 61)', animationDelay: `${300 + Math.min(i, 12) * 40}ms` }} />
                      </span>
                    </span>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
