// The first screen after signing in: one's own place. Who's here, the atrium they
// were last in, ready to carry on, what else is recent, and how near the next
// achievement is. It asks the server for nothing to say so: all of it is kept on
// the device (lib/atriumCards, lib/stats, lib/recentAtriums). Everything that isn't
// that is a quiet row along the foot, or in Profile.

import { lazy, Suspense, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useGamePick } from '../store/gameStore'
import ProfileSettings from './ProfileSettings'
import PinterestConnectionPanel from './PinterestConnectionPanel'
import SupportAppeal from './SupportAppeal'
import { ReportFeedbackModal } from './ReportFeedbackModal'
import ContributePanel from './ContributePanel'
import DonateButton, { DONATE_CUT } from './DonateButton'
import ThemeToggle from './ThemeToggle'
import FullscreenButton from './FullscreenButton'
import WelcomeConnections from './WelcomeConnections'
import AccountMenu from './AccountMenu'
import { PictureOrInitial } from './ProfilePicture'
import AtriumPicture from './AtriumPicture'
import { useTranslation, type LanguageCode } from '../lib/i18n'
import { openExternalUrl } from '../lib/openExternal'
import { ATRIUM_WEBSITE } from '../lib/creatorLinks'
import { shouldShowAppeal } from '../lib/supportAppeal'
import { openContributors } from '../lib/contributorsRoute'
import { getCachedContributions, startContributionsRefresh, type ContributionsData } from '../lib/contributions'
import { gaugeFigures } from '../lib/monthlyGauge'
import Hall from './Hall'
import { supabase, isDesktop } from '../lib/supabase'
import { goTo } from '../lib/route'
import { notePictureFrom, useMyPicture } from '../lib/myPicture'
import { myEntry } from '../lib/people'
import { checkPlatformAdmin, knownPlatformAdmin } from '../lib/platformAdmin'
import { agoOf, readCards, recentCards, type AtriumCard } from '../lib/atriumCards'
import { atriumVisitedAt } from '../lib/recentAtriums'
import { ACHIEVEMENTS, isEarned, nextAchievement, progressOf } from '../lib/achievements'
import { noteToday, readStats } from '../lib/stats'
import { askBrowserTo, unfinishedTutorial } from '../lib/tutorial'
import { isBrowserAtrium } from '../lib/browserAtriums'
import { hasDriveToken } from '../lib/drive'
import { isDriveAtrium, isHostedAtrium } from '../lib/driveSync'
import type { TranslationKey } from '../locales/en'

interface WelcomeScreenProps {
  onEnter: () => void
  // Into this atrium, as the atrium browser's Enter does.
  onOpenAtrium: (lobbyId: string) => void
  onBackToLanding?: () => void
  // The desktop app's About page (AboutPage).
  onAbout?: () => void
  // Developers (DevelopersPage), offered to the platform's operator alone.
  onDevelopers?: () => void
}

const HelpPanel = lazy(() => import('./HelpPanel'))

const FAMILY_COLOUR = { start: '#FF8A3D', placed: '#E8C15A', deleted: '#C77DFF', days: '#9AD4C4', other: '#A8B6D9' } as const

// The Atrium's mark, in the colour of what's behind this mask.
const MARK: CSSProperties = { WebkitMaskImage: 'url(/atrium-mark.png)', maskImage: 'url(/atrium-mark.png)', WebkitMaskSize: 'contain', maskSize: 'contain', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat', WebkitMaskPosition: 'center', maskPosition: 'center' }

const footLink = 'text-[11px] tracking-[0.1em] uppercase text-nier-bg/80 hover:text-nier-strong transition-colors whitespace-nowrap'

export default function WelcomeScreen({ onEnter, onOpenAtrium, onBackToLanding, onAbout, onDevelopers }: WelcomeScreenProps) {
  const { t, language } = useTranslation()
  const { userId, username, playerColor } = useGamePick('userId', 'username', 'playerColor')
  const [showSettings, setShowSettings] = useState(false)
  const [showPinterest, setShowPinterest] = useState(false)
  // Profile covers this whole; once it has, this rests, its hall too, and arrives
  // again on the way back.
  const [covered, setCovered] = useState(false)
  useEffect(() => {
    if (!showSettings) { setCovered(false); return }
    const timer = window.setTimeout(() => setCovered(true), 260)
    return () => window.clearTimeout(timer)
  }, [showSettings])
  const [isDeveloper, setIsDeveloper] = useState(knownPlatformAdmin)
  useEffect(() => { void checkPlatformAdmin().then(setIsDeveloper) }, [])
  // One's picture, this device's until told otherwise: told by a read made anyway.
  const picture = useMyPicture()
  useEffect(() => { if (!isDesktop) void myEntry().then(entry => notePictureFrom(entry.settings), () => {}) }, [])

  // Stepping back, just before the next screen is asked for. Two screens on the
  // same ground, one receding as the other rises, reads as going a layer deeper.
  const [leaving, setLeaving] = useState(false)
  const leaveTo = (next: () => void) => {
    setLeaving(true)
    setTimeout(next, 210)
  }

  const [showContribute, setShowContribute] = useState(false)
  // Asked once, on mount, and shouldShowAppeal itself only answers true once per
  // launch -- coming back here after leaving an atrium is not a new launch.
  const [showAppeal, setShowAppeal] = useState(false)
  useEffect(() => { void shouldShowAppeal().then(show => { if (show) setShowAppeal(true) }) }, [])
  const [showFeedback, setShowFeedback] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  // Read from cache on mount and refreshed behind the screen, so it's there on
  // the first frame and offline.
  const [contributions, setContributions] = useState<ContributionsData>(() => getCachedContributions())
  useEffect(() => startContributionsRefresh(setContributions), [])
  const funded = gaugeFigures(contributions.month)

  // One's atriums and achievements, as this device has them. Read again as
  // Profile closes: what's chosen there shows here.
  const [stats, setStats] = useState(readStats)
  useEffect(() => { noteToday() }, [])
  useEffect(() => { if (!showSettings) setStats(readStats()) }, [showSettings])
  const recent = useMemo<AtriumCard[]>(() => recentCards(readCards(userId), atriumVisitedAt, unfinishedTutorial()), [userId])
  const [last, ...others] = recent
  const next = nextAchievement(stats)
  const pinned = stats.pinned.flatMap(id => ACHIEVEMENTS.find(one => one.id === id && isEarned(one, stats)) ?? [])

  // Straight in, where nothing has to be asked first; otherwise by the atrium
  // browser, which knows how to ask (a password, Google's window for Drive).
  const openCard = (card: AtriumCard) => {
    const needsAsking = isDriveAtrium(card.id) && !isHostedAtrium(card.id) && !hasDriveToken()
    const direct = (isDesktop || isBrowserAtrium(card.id)) && !needsAsking
    leaveTo(direct ? () => onOpenAtrium(card.id) : onEnter)
  }
  const whenOf = (id: string) => {
    const [value, unit] = agoOf(atriumVisitedAt(id), Date.now())
    return new Intl.RelativeTimeFormat(language as LanguageCode, { numeric: 'auto' }).format(value, unit)
  }
  const number = (value: number) => value.toLocaleString(language as LanguageCode)

  const handleLogout = async () => {
    if (!supabase) return

    // Clear active_lobby_id before signing out
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await (supabase
        .from('profiles') as any)
        .update({ active_lobby_id: null })
        .eq('id', user.id)
    }

    // Clear local storage
    localStorage.removeItem('lobby_hasEntered')
    localStorage.removeItem('lobby_currentLobbyId')
    localStorage.removeItem('lobby_showBrowser')

    await supabase.auth.signOut()
    // An account the worker holds: its grant, or its renewal token, and its passes.
    await (await import('../lib/signedIn')).signOutWorkerAccount()

    // Force navigation to landing page
    goTo('/')
    window.location.reload()
  }

  const brand = (
    <>
      <span
        aria-hidden="true"
        className="block w-7 h-8 bg-nier-strong"
        style={MARK}
      />
      <span translate="no" className="hidden sm:block text-xs font-medium tracking-[0.26em] uppercase text-nier-strong">The Digital Atrium</span>
    </>
  )

  return (
    <>
      <div data-welcome="" className={`relative w-full h-full bg-nier-black overflow-y-auto overflow-x-hidden ${leaving ? 'screen-recede' : 'screen-rise'} ${covered ? 'hidden' : ''}`}>
        {/* The landing page's hall, so the app's first screen and the website's are
            one room. */}
        <Hall />
        <div aria-hidden="true" className="welcome-glow" />

        <div className="relative min-h-full max-w-[90rem] mx-auto flex flex-col px-5 sm:px-10 xl:px-16 pt-6 pb-5">
          <header className="enter-down relative z-20 flex items-center justify-between gap-4">
            {/* Web only: the desktop has no website behind it to go back to. */}
            {onBackToLanding && !isDesktop ? (
              <button type="button" data-welcome-brand="" onClick={() => leaveTo(onBackToLanding)} title={t('common.back')} className="flex items-center gap-3 transition-opacity hover:opacity-80">{brand}</button>
            ) : (
              <div className="flex items-center gap-3">{brand}</div>
            )}
            <div className="flex items-center gap-2.5">
              <FullscreenButton className="cut-corner inline-flex items-center justify-center w-[2.625rem] h-[2.125rem] border border-nier-border/40 text-nier-bg/80 hover:text-nier-strong hover:border-nier-border/70 transition-colors" style={{ backgroundColor: 'rgb(var(--c-ground) / 0.94)' }} />
              <ThemeToggle />
              <DonateButton onClick={() => setShowContribute(true)} variant="quiet" compact className="h-[2.125rem] !py-0" />
              <AccountMenu
                chipClass="welcome-chip flex items-center gap-2.5 h-[2.125rem] pl-1 pr-3 border border-nier-border/40 hover:border-nier-border/80 transition-colors"
                chipStyle={{ backgroundColor: 'rgb(var(--c-ground) / 0.94)' }}
                onProfile={() => setShowSettings(true)}
                onLogOut={isDesktop ? undefined : () => void handleLogout()}
              >
                <span aria-hidden="true" className="w-[1.625rem] h-[1.625rem] flex items-center justify-center overflow-hidden text-[11px] font-bold uppercase transition-colors duration-300" style={{ background: playerColor, color: '#191919' }}><PictureOrInitial picture={picture} initial={(username || '?').slice(0, 1)} /></span>
                <span className="hidden sm:block max-w-[10rem] truncate text-xs text-nier-strong">{username}</span>
                {pinned.length > 0 && (
                  <span aria-hidden="true" data-welcome-pinned="" className="flex gap-1.5 pl-0.5">
                    {pinned.map(one => <span key={one.id} className="welcome-chip-mark block w-2 h-2 rotate-45" style={{ background: FAMILY_COLOUR[one.family] }} />)}
                  </span>
                )}
              </AccountMenu>
            </div>
          </header>

          <main className="relative flex-1 flex flex-col mt-8 lg:mt-10 min-h-0">
            <p className="enter-up text-[11px] tracking-[0.3em] uppercase text-nier-bg/80" style={{ '--i': 1 } as CSSProperties}>{t(last ? 'welcome.back' : 'welcome.hello')}</p>
            <h1 data-welcome-name="" className="enter-up mt-2 text-4xl sm:text-[3.6rem] font-extralight leading-[1.05] tracking-[0.02em] text-nier-strong break-words" style={{ '--i': 2 } as CSSProperties}>{username}</h1>
            <p data-welcome-line="" className="enter-up mt-3 text-[13px] tracking-[0.04em] text-nier-bg/85" style={{ '--i': 3 } as CSSProperties}>
              {last
                ? (stats.streak >= 2 ? t('welcome.streak', { n: number(stats.streak) }) : t('welcome.asLeft'))
                : t('welcome.firstLine')}
            </p>

            <div className="mt-7 flex-1 grid gap-7 lg:grid-cols-[minmax(0,1fr)_25rem] min-h-0">
              {/* What one came for, and the screen's one filled button. */}
              {last ? (
                <section
                  data-welcome-hero=""
                  onClick={() => openCard(last)}
                  className="welcome-hero enter-up group relative min-h-[18rem] lg:min-h-[24rem] overflow-hidden border border-nier-border/40 bg-nier-blackLight cursor-pointer"
                  style={{ '--i': 4 } as CSSProperties}
                >
                  <AtriumPicture url={last.preview} className="welcome-hero-picture" />
                  <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-5 p-5 sm:p-7 pt-24" style={{ background: 'linear-gradient(transparent, rgb(var(--c-ground) / 0.96) 38%)' }}>
                    <div className="min-w-0">
                      <p className="text-[10px] tracking-[0.26em] uppercase text-nier-bg/85">{t('welcome.pickUp')}</p>
                      <h2 data-welcome-last="" className="mt-1.5 text-[1.75rem] font-normal text-nier-strong break-words">{last.name}</h2>
                      <p className="mt-1.5 text-xs text-nier-bg/85">
                        {t('welcome.lastHere', { when: whenOf(last.id) })}
                        {last.traces !== null && <span>{' · '}{t('welcome.traces', { n: number(last.traces) })}</span>}
                      </p>
                    </div>
                    <button
                      type="button"
                      data-welcome-continue=""
                      onClick={e => { e.stopPropagation(); openCard(last) }}
                      className="sheen relative h-[3.25rem] px-8 shrink-0 text-[13px] font-medium tracking-[0.2em] uppercase transition-transform duration-300 hover:scale-[1.03] active:scale-[0.99]"
                      style={{ background: 'rgb(var(--c-accent))', color: 'rgb(var(--c-ground))', clipPath: DONATE_CUT }}
                    >
                      {t('welcome.continue')}
                    </button>
                  </div>
                </section>
              ) : (
                <section data-welcome-hero="" className="enter-up relative min-h-[18rem] lg:min-h-[24rem] overflow-hidden border border-nier-border/40 flex flex-col items-center justify-center gap-6 p-7" style={{ '--i': 4 } as CSSProperties}>
                  <span aria-hidden="true" className="block w-16 h-[4.5rem] bg-nier-strong" style={MARK} />
                  <button
                    type="button"
                    data-welcome-continue=""
                    onClick={() => leaveTo(onEnter)}
                    className="sheen relative h-[3.25rem] px-10 text-[13px] font-medium tracking-[0.2em] uppercase transition-transform duration-300 hover:scale-[1.03] active:scale-[0.99]"
                    style={{ background: 'rgb(var(--c-accent))', color: 'rgb(var(--c-ground))', clipPath: DONATE_CUT }}
                  >
                    {t('welcome.enter')}
                  </button>
                </section>
              )}

              <aside className="flex flex-col gap-3 min-h-0">
                {others.length > 0 && <p className="enter-fade text-[10px] tracking-[0.26em] uppercase text-nier-bg/80" style={{ '--i': 5 } as CSSProperties}>{t('welcome.alsoRecent')}</p>}
                {others.length > 0 && (
                  <div className="enter-cards flex flex-col gap-2.5" style={{ '--base': '300ms' } as CSSProperties}>
                    {others.slice(0, 3).map(card => (
                      <button key={card.id} type="button" data-welcome-recent={card.id} onClick={() => openCard(card)} className="welcome-recent hall-ground group flex items-center gap-3.5 w-full p-2 text-left border border-nier-border/30 hover:border-nier-border/70">
                        <span className="relative block w-[5.25rem] h-[3.4rem] shrink-0 overflow-hidden bg-nier-blackLight"><AtriumPicture url={card.preview} className="welcome-hero-picture" /></span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] text-nier-strong">{card.name}</span>
                          <span className="block mt-1 text-[11px] text-nier-bg/80">{whenOf(card.id)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="enter-up grid grid-cols-2 gap-2.5" style={{ '--i': 7 } as CSSProperties}>
                  <button type="button" data-welcome-all="" onClick={() => leaveTo(onEnter)} className="welcome-action hall-ground h-[2.9rem] border border-nier-border/50 hover:border-nier-border/90 text-[11px] tracking-[0.14em] uppercase text-nier-strong">{t('welcome.allAtriums')}</button>
                  <button type="button" data-welcome-new="" onClick={() => { askBrowserTo('create'); leaveTo(onEnter) }} className="welcome-action hall-ground h-[2.9rem] border border-nier-border/50 hover:border-nier-border/90 text-[11px] tracking-[0.14em] uppercase text-nier-strong">+ {t('welcome.newAtrium')}</button>
                </div>
                {next && (
                  <button
                    type="button"
                    data-welcome-next=""
                    onClick={() => setShowSettings(true)}
                    className="welcome-next enter-up lg:mt-auto block w-full p-3.5 text-left border"
                    style={{ '--i': 8, borderColor: 'rgb(255 138 61 / 0.35)', background: 'rgb(255 138 61 / 0.06)' } as CSSProperties}
                  >
                    <span className="flex justify-between gap-3 text-[11px] tracking-[0.08em] text-nier-strong">
                      <span className="uppercase min-w-0 truncate">{t('welcome.nextAchievement', { name: t(`achievements.name.${next.id}` as TranslationKey) })}</span>
                      <span className="shrink-0 tabular-nums">{number(Math.min(next.goal, next.counter === 'streak' ? stats.streak : stats[next.counter]))} / {number(next.goal)}</span>
                    </span>
                    <span aria-hidden="true" className="block mt-2.5 h-[3px] bg-nier-border/25 overflow-hidden">
                      <span className="achievement-bar block h-full" style={{ width: `${progressOf(next, stats) * 100}%`, background: 'rgb(255 138 61)', animationDelay: '600ms' }} />
                    </span>
                  </button>
                )}
                <WelcomeConnections onPinterest={() => setShowPinterest(true)} pinterestOpen={showPinterest} style={{ '--i': 9 } as CSSProperties} />
              </aside>
            </div>
          </main>

          <footer className="enter-fade mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3" style={{ '--i': 10 } as CSSProperties}>
            <nav aria-label={t('welcome.more')} data-welcome-foot="" className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <button type="button" data-welcome-help="" onClick={() => setShowHelp(true)} className={footLink}>{t('help.title')}</button>
              <button type="button" data-welcome-tutorial="" onClick={() => { askBrowserTo('tutorial'); leaveTo(onEnter) }} className={footLink}>{t('tutorial.button')}</button>
              <button type="button" onClick={() => openContributors('/welcome')} className={footLink}>{t('welcome.contributors')}</button>
              {isDeveloper && onDevelopers && <button type="button" data-welcome-developers="" onClick={onDevelopers} className={footLink}>{t('welcome.developers')}</button>}
              {isDesktop && onAbout && <button type="button" onClick={onAbout} className={footLink}>{t('welcome.about')}</button>}
              {/* Handed to the system's browser: the webview has no address bar to come back from. */}
              {isDesktop && <button type="button" onClick={() => openExternalUrl(ATRIUM_WEBSITE)} title={t('welcome.websiteTitle')} className={footLink}>{t('welcome.website')} ↗</button>}
              {isDesktop && (
                <button
                  type="button"
                  onClick={async () => {
                    const { getCurrentWindow } = await import('@tauri-apps/api/window')
                    getCurrentWindow().close()
                  }}
                  className={`${footLink} danger-word`}
                >
                  {t('welcome.exit')}
                </button>
              )}
            </nav>
            {funded && (
              <button type="button" data-welcome-funded="" onClick={() => openContributors('/welcome')} title={t('goal.seeWho')} className="flex items-center gap-3 text-[11px] tracking-[0.1em] uppercase text-nier-bg/80 hover:text-nier-strong transition-colors">
                <span>{t('goal.funded', { percent: funded.percent })}</span>
                <span aria-hidden="true" className="block w-28 h-[3px] bg-nier-border/25 overflow-hidden"><span className="achievement-bar block h-full" style={{ width: `${funded.percent}%`, background: 'rgb(255 138 61)', animationDelay: '800ms' }} /></span>
              </button>
            )}
          </footer>
        </div>
      </div>

      {showSettings && <ProfileSettings onClose={() => setShowSettings(false)} onPinterest={() => setShowPinterest(true)} pinterestOpen={showPinterest} onLogOut={isDesktop ? undefined : handleLogout} />}
      {showPinterest && <PinterestConnectionPanel onClose={() => setShowPinterest(false)} />}
      {showContribute && <ContributePanel onClose={() => setShowContribute(false)} />}

      {showAppeal && !showSettings && (
        <SupportAppeal
          onClose={() => setShowAppeal(false)}
          onDonate={() => {
            setShowAppeal(false)
            setShowContribute(true)
          }}
          onFeedback={() => {
            setShowAppeal(false)
            setShowFeedback(true)
          }}
        />
      )}

      {showHelp && <Suspense fallback={null}><HelpPanel onClose={() => setShowHelp(false)} username={username} /></Suspense>}

      {/* The same modal the atrium and the browser use, so feedback sent from
          here arrives by the route everything else does. */}
      {showFeedback && (
        <ReportFeedbackModal
          onClose={() => setShowFeedback(false)}
          username={username}
        />
      )}
    </>
  )
}
