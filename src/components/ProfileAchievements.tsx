// The top of one's profile -- who, since when, how far -- and one's achievements, each
// earned or on its way. Pressing an earned one puts it beside one's name.

import { useTranslation, type LanguageCode } from '../lib/i18n'
import { earnedAchievements, isEarned, MOST_PINNED, ACHIEVEMENTS, progressOf, type Achievement, type Stats } from '../lib/achievements'
import type { TranslationKey } from '../locales/en'

const FAMILY_COLOUR: Record<Achievement['family'], string> = {
  start: '#FF8A3D',
  placed: '#E8C15A',
  deleted: '#C77DFF',
  days: '#9AD4C4',
  other: '#A8B6D9',
}

const nameOf = (one: Achievement) => `achievements.name.${one.id}` as TranslationKey
const whatOf = (one: Achievement) => `achievements.what.${one.what}` as TranslationKey

function AchievementMark({ colour, size = 18 }: { colour: string; size?: number }) {
  return <span aria-hidden="true" className="block rotate-45 shrink-0" style={{ width: size, height: size, background: colour }} />
}

export function ProfileTop({ name, username, colour, joined, stats }: {
  name: string
  username: string
  colour: string
  joined: number | null
  stats: Stats
}) {
  const { t, language } = useTranslation()
  const number = (value: number) => value.toLocaleString(language as LanguageCode)
  const pinned = stats.pinned.flatMap(id => ACHIEVEMENTS.find(one => one.id === id && isEarned(one, stats)) ?? [])
  const since = joined ? new Date(joined).toLocaleDateString(language as LanguageCode, { year: 'numeric', month: 'long', day: 'numeric' }) : null
  const figures: [string, number][] = [
    [t('achievements.stat.placed'), stats.placed],
    [t('achievements.stat.streak'), stats.streak],
    [t('achievements.stat.best'), stats.bestStreak],
    [t('achievements.stat.days'), stats.daysHere],
  ]
  return (
    <section data-profile-top="" className="flex flex-wrap items-center gap-x-7 gap-y-5">
      <span
        aria-hidden="true"
        className="w-24 h-24 shrink-0 flex items-center justify-center text-4xl font-bold uppercase"
        style={{ background: colour, color: '#191919', clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%)' }}
      >
        {(name || username || '?').slice(0, 1)}
      </span>
      <div className="flex-1 min-w-[14rem]">
        <h1 data-profile-name="" className="text-3xl sm:text-4xl font-extralight text-nier-strong break-words">{name || username}</h1>
        <p className="mt-2 text-sm text-nier-bg/80">
          {username && <span>@{username}</span>}
          {username && since && <span> · </span>}
          {since && <span data-profile-since="">{t('achievements.since', { date: since })}</span>}
        </p>
        {pinned.length > 0 && (
          <div data-profile-pinned="" className="mt-3 flex flex-wrap gap-2">
            {pinned.map(one => (
              <span key={one.id} className="flex items-center gap-2 h-8 pl-3 pr-3 border border-nier-border/40 text-[11px] text-nier-strong">
                <AchievementMark colour={FAMILY_COLOUR[one.family]} size={9} />
                {t(nameOf(one))}
              </span>
            ))}
          </div>
        )}
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-4 border border-nier-border/30 w-full lg:w-auto">
        {figures.map(([label, value]) => (
          <div key={label} className="px-4 py-3 min-w-[7rem]">
            <dd className="text-2xl font-extralight text-nier-strong">{number(value)}</dd>
            <dt className="mt-1 text-[10px] tracking-[0.1em] uppercase text-nier-bg/75">{label}</dt>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function AchievementsGrid({ stats, onToggle }: { stats: Stats; onToggle: (id: string) => void }) {
  const { t, language } = useTranslation()
  const earned = earnedAchievements(stats).length
  return (
    <section data-achievements="" aria-labelledby="achievements-title" className="min-w-0">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="achievements-title" className="text-xs font-medium tracking-[0.24em] uppercase text-nier-strong">{t('achievements.title')}</h2>
        <span data-achievements-count="" className="text-xs text-nier-bg/80">{t('achievements.count', { earned, all: ACHIEVEMENTS.length })}</span>
      </div>
      <p className="mt-2 text-xs text-nier-bg/70">{t('achievements.hint', { most: MOST_PINNED })}</p>
      <ul className="mt-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
        {ACHIEVEMENTS.map(one => {
          const got = isEarned(one, stats)
          const chosen = stats.pinned.includes(one.id)
          const words = (
            <>
              <span className={`block mt-3 text-xs font-medium ${got ? 'text-nier-strong' : 'text-nier-bg/85'}`}>{t(nameOf(one))}</span>
              <span className="block mt-1 text-[11px] leading-snug text-nier-bg/75">{t(whatOf(one), { n: one.goal.toLocaleString(language as LanguageCode) })}</span>
            </>
          )
          const mark = got
            ? <AchievementMark colour={FAMILY_COLOUR[one.family]} />
            : <span aria-hidden="true" className="block w-[18px] h-[18px] rotate-45 border border-nier-border/60" />
          const progress = progressOf(one, stats)
          return (
            <li key={one.id} data-achievement={one.id} data-earned={got || undefined}>
              {got ? (
                <button
                  type="button"
                  aria-pressed={chosen}
                  onClick={() => onToggle(one.id)}
                  className={`w-full h-full min-h-[8.5rem] flex flex-col items-start text-left p-3.5 pt-4 border transition-colors ${chosen ? 'border-nier-bg bg-nier-bg/10' : 'border-nier-border/45 bg-nier-bg/5 hover:border-nier-border/80'}`}
                >
                  {mark}
                  {words}
                </button>
              ) : (
                <div className="h-full min-h-[8.5rem] p-3.5 pt-4 border border-nier-border/20 flex flex-col">
                  {mark}
                  {words}
                  {progress > 0 && (
                    <span aria-hidden="true" className="block mt-auto pt-3">
                      <span className="block h-[3px] bg-nier-border/25"><span className="block h-full" style={{ width: `${progress * 100}%`, background: 'rgb(255 138 61)' }} /></span>
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
