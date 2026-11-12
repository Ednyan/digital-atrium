// Home and Atriums: two walls of one room under one top bar (lib/homeSlide). Home is
// what one came for: the atrium one was last in, ready to carry on, what else is
// recent, how near the next achievement is. It asks the server for nothing to say so:
// all of it is kept on the device (lib/atriumCards, lib/stats, lib/recentAtriums).
// Atriums is every one of them (LobbyBrowser), there only once it's wanted, so
// someone who just carries on costs no lists. A guest has that wall alone.

import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
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
import { useMyPicture } from '../lib/myPicture'
import { signOutWorkerAccount, useWorkerAccount } from '../lib/signedIn'
import { slideBetween } from '../lib/homeSlide'
import type { AtriumsApi } from './LobbyBrowser'
import { checkPlatformAdmin, knownPlatformAdmin } from '../lib/platformAdmin'
import { agoOf, cardsKnown, readCards, recentCards, type AtriumCard } from '../lib/atriumCards'
import { atriumVisitedAt } from '../lib/recentAtriums'
import { ACHIEVEMENTS, FAMILY_COLOUR, isEarned, nextAchievement, progressOf } from '../lib/achievements'
import { noteToday, readStats, syncStats } from '../lib/stats'
import { unfinishedTutorial } from '../lib/tutorial'
import { isBrowserAtrium } from '../lib/browserAtriums'
import { hasDriveToken } from '../lib/drive'
import { isDriveAtrium, isHostedAtrium } from '../lib/driveSync'
import type { TranslationKey } from '../locales/en'

export type HomeView = 'home' | 'atriums'

interface HomeScreenProps {
  view: HomeView
  onGo: (view: HomeView) => void
  // Into this atrium, as Enter on its card does.
  onOpenAtrium: (lobbyId: string, password?: string) => void
  // Without an account: this browser's atriums only, and no Home.
  guest?: boolean
  onSignIn?: () => void
  onBackToLanding?: () => void
  // The desktop app's About page (AboutPage).
  onAbout?: () => void
  // Developers (DevelopersPage), offered to the platform's operator alone.
  onDevelopers?: () => void
}

const HelpPanel = lazy(() => import('./HelpPanel'))
// Fetched ahead and not by lazy(), which takes a frame to mount even a module it has:
// the first slide has to find its cards there, for the pictures to fly to.
let LobbyBrowser: typeof import('./LobbyBrowser').LobbyBrowser | null = null
const fetchLobbyBrowser = () => import('./LobbyBrowser').then(module => { LobbyBrowser = module.LobbyBrowser })


// The Atrium's mark, in the colour of what's behind this mask.
const MARK: CSSProperties = { WebkitMaskImage: 'url(/atrium-mark.png)', maskImage: 'url(/atrium-mark.png)', WebkitMaskSize: 'contain', maskSize: 'contain', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat', WebkitMaskPosition: 'center', maskPosition: 'center' }

const TOP_WORD = 'cut-corner inline-flex items-center justify-center gap-2 h-[2.125rem] px-3 border border-nier-border/60 text-nier-strong hover:border-nier-border text-[11px] tracking-[0.15em] uppercase leading-none transition-colors'
const footLink = 'text-[11px] tracking-[0.1em] uppercase text-nier-bg/80 hover:text-nier-strong transition-colors whitespace-nowrap'

// The last atrium's card: wide and low, growing a little with the window.
const HERO_HEIGHT = 'sm:h-[clamp(14rem,34vh,21rem)]'
// "Also recent" always has this many places, empty ones included.
const RECENT_PLACES = 4
// Home's tiles: big for making, finding and learning one's atriums, smaller for files and help.
const TILE = 'welcome-action hall-ground flex items-center gap-3.5 w-full px-4 text-left border uppercase leading-snug'
const TILE_BIG = 'min-h-[4rem] py-2.5 border-nier-border/50 hover:border-nier-border/90 text-[12px] tracking-[0.16em] text-nier-strong'
const TILE_SMALL = 'min-h-[3.25rem] py-2 gap-3 border-nier-border/35 hover:border-nier-border/80 text-[11px] tracking-[0.14em] text-nier-bg/85 hover:text-nier-strong'
const TILE_MARK = 'flex items-center justify-center w-9 h-9 shrink-0'
// Drawn on a 24 grid.
const ICON = {
  new: 'M12 5v14M5 12h14',
  all: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  tutorial: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5z',
  import: 'M12 4v11M8 11l4 4 4-4M5 20h14',
  export: 'M12 15V4M8 8l4-4 4 4M5 20h14',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.4M12 17h.01',
  about: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01',
}
const TileIcon = ({ d }: { d: string }) => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d={d} /></svg>
)

export default function HomeScreen({ view, onGo, onOpenAtrium, guest = false, onSignIn, onBackToLanding, onAbout, onDevelopers }: HomeScreenProps) {
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
  useEffect(() => { if (!guest) void checkPlatformAdmin().then(setIsDeveloper) }, [guest])
  const picture = useMyPicture()
  const account = useWorkerAccount()

  // The two walls. Atriums is there from when it's first wanted, and stays.
  const room = useRef<HTMLDivElement>(null)
  const homeWall = useRef<HTMLDivElement>(null)
  const atriumsWall = useRef<HTMLDivElement>(null)
  const [atriumsWanted, setAtriumsWanted] = useState(false)
  const atriumsThere = atriumsWanted || view === 'atriums'
  const [, noteFetched] = useState(false)
  useEffect(() => { if (!LobbyBrowser) void fetchLobbyBrowser().then(() => noteFetched(true)) }, [])
  useEffect(() => { if (view === 'atriums') setAtriumsWanted(true) }, [view])
  const wasOn = useRef(view)
  useLayoutEffect(() => {
    const from = wasOn.current
    wasOn.current = view
    if (homeWall.current) homeWall.current.inert = view !== 'home'
    if (atriumsWall.current) atriumsWall.current.inert = view !== 'atriums'
    if (from === view || !room.current || !homeWall.current || !atriumsWall.current) return
    if (view === 'atriums') slideBetween(room.current, homeWall.current, atriumsWall.current, 1)
    else slideBetween(room.current, atriumsWall.current, homeWall.current, -1)
  }, [view, atriumsThere])
  // Asked of Atriums: at once if it's there, as soon as it is if not.
  const atriums = useRef<AtriumsApi | null>(null)
  const askedOfAtriums = useRef<((api: AtriumsApi) => void) | null>(null)
  const askAtriums = (task: (api: AtriumsApi) => void) => {
    if (atriums.current) { task(atriums.current); return }
    askedOfAtriums.current = task
    setAtriumsWanted(true)
  }
  const atriumsReady = (api: AtriumsApi) => {
    atriums.current = api
    askedOfAtriums.current?.(api)
    askedOfAtriums.current = null
  }

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
  useEffect(() => { if (!guest) void shouldShowAppeal().then(show => { if (show) setShowAppeal(true) }) }, [guest])
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
  // And the account's word on them, and on one's picture: at most a write a day.
  useEffect(() => {
    noteToday()
    if (!guest) void syncStats().then(setStats)
  }, [guest, account?.id])
  useEffect(() => { if (!showSettings) setStats(readStats()) }, [showSettings])
  // Anew on coming back from Atriums, which may have told the device more.
  const [cardsTold, setCardsTold] = useState(0)
  const recent = useMemo<AtriumCard[]>(() => recentCards(readCards(userId), atriumVisitedAt, unfinishedTutorial()), [userId, view, cardsTold])
  // A device that's never been told of one's atriums: their lists read behind this
  // once, for it to have something to show. Never again after: Home asks for nothing.
  useEffect(() => { if (!guest && !cardsKnown(userId)) setAtriumsWanted(true) }, [guest, userId])
  const [last, ...others] = recent
  // Nothing to show yet, as the lists are read for the first time: said, not taken for a first visit.
  const reading = !guest && !last && !cardsKnown(userId)
  const next = nextAchievement(stats)
  const pinned = stats.pinned.flatMap(id => ACHIEVEMENTS.find(one => one.id === id && isEarned(one, stats)) ?? [])

  // Straight in, where nothing has to be asked first; otherwise over on Atriums, which
  // knows how to ask (a password). Google's window takes a click of its own: there,
  // on its card.
  const openCard = (card: AtriumCard) => {
    const needsAsking = isDriveAtrium(card.id) && !isHostedAtrium(card.id) && !hasDriveToken()
    if ((isDesktop || isBrowserAtrium(card.id)) && !needsAsking) { leaveTo(() => onOpenAtrium(card.id)); return }
    onGo('atriums')
    if (!needsAsking) askAtriums(api => api.enter(card.id))
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

  // On the desktop only an account can be left: the device's person stays.
  const logOut = !isDesktop ? () => void handleLogout() : account ? () => void signOutWorkerAccount() : undefined

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
      <div ref={room} data-welcome="" data-view={view} className={`relative w-full h-full flex flex-col bg-nier-black overflow-hidden ${leaving ? 'screen-recede' : 'screen-rise'} ${covered ? 'hidden' : ''}`}>
        {/* The landing page's hall, so the app's first screen and the website's are
            one room, and panning across it. */}
        <Hall pan={view === 'atriums'} />
        <div aria-hidden="true" className="welcome-glow" />

        <header className="enter-down home-top relative z-30">
          {/* The website: the page behind this on the web; on the desktop, none being
              behind it, in the system's browser, as the webview has no way back. */}
          <button
            type="button"
            data-welcome-brand=""
            onClick={() => (isDesktop ? openExternalUrl(ATRIUM_WEBSITE) : onBackToLanding && leaveTo(onBackToLanding))}
            title={isDesktop ? t('welcome.websiteTitle') : t('common.back')}
            className="flex items-center gap-3 justify-self-start transition-opacity hover:opacity-80"
          >
            {brand}
          </button>
          {!guest && (
            <nav aria-label={t('welcome.more')} data-home-nav="" data-on={view} className="home-nav">
              <span aria-hidden="true" className="home-nav-light" />
              <button type="button" data-go="home" aria-current={view === 'home' ? 'page' : undefined} onClick={() => onGo('home')}>{t('nav.home')}</button>
              <button type="button" data-go="atriums" aria-current={view === 'atriums' ? 'page' : undefined} onClick={() => onGo('atriums')}>{t('nav.atriums')}</button>
            </nav>
          )}
          <div className="home-tools flex items-center gap-2.5">
            {/* Home has Help (and About) among its own tiles; the top bar keeps it only where there are none. */}
            {(guest || view === 'atriums') && (
              <button type="button" data-top-help="" onClick={() => setShowHelp(true)} title={t('help.title')} aria-label={t('help.title')} className={TOP_WORD} style={{ backgroundColor: 'rgb(var(--c-ground) / 0.94)' }}>
                <span aria-hidden="true" className="text-[13px] leading-none">?</span>
                <span className="hidden xl:inline">{t('help.title')}</span>
              </button>
            )}
            <FullscreenButton className="cut-corner inline-flex items-center justify-center w-[2.625rem] h-[2.125rem] border border-nier-border/40 text-nier-bg/80 hover:text-nier-strong hover:border-nier-border/70 transition-colors" style={{ backgroundColor: 'rgb(var(--c-ground) / 0.94)' }} />
            <ThemeToggle />
            <DonateButton onClick={() => setShowContribute(true)} variant="quiet" compact className="h-[2.125rem] !py-0" />
            {guest ? (
              onSignIn && <button type="button" onClick={onSignIn} className="cut-corner inline-flex items-center h-[2.125rem] px-3 border border-nier-border/40 text-nier-strong hover:border-nier-border/80 text-[11px] tracking-[0.15em] uppercase transition-colors" style={{ backgroundColor: 'rgb(var(--c-ground) / 0.94)' }}>{t('auth.logIn')}</button>
            ) : (
              <AccountMenu
                chipClass="welcome-chip flex items-center gap-2.5 h-[2.125rem] pl-1 pr-3 border border-nier-border/40 hover:border-nier-border/80 transition-colors"
                chipStyle={{ backgroundColor: 'rgb(var(--c-ground) / 0.94)' }}
                onProfile={() => setShowSettings(true)}
                onLogOut={logOut}
              >
                <span aria-hidden="true" className="w-[1.625rem] h-[1.625rem] flex items-center justify-center overflow-hidden text-[11px] font-bold uppercase transition-colors duration-300" style={{ background: playerColor, color: '#191919' }}><PictureOrInitial picture={picture} initial={(username || '?').slice(0, 1)} /></span>
                <span className="hidden sm:block max-w-[10rem] truncate text-xs text-nier-strong">{username}</span>
                {pinned.length > 0 && (
                  <span aria-hidden="true" data-welcome-pinned="" className="flex gap-1.5 pl-0.5">
                    {pinned.map(one => <span key={one.id} className="welcome-chip-mark block w-2 h-2 rotate-45" style={{ background: FAMILY_COLOUR[one.family] }} />)}
                  </span>
                )}
              </AccountMenu>
            )}
            {/* Where a window's way out is. */}
            {isDesktop && (
              <button
                type="button"
                data-home-exit=""
                onClick={async () => {
                  const { getCurrentWindow } = await import('@tauri-apps/api/window')
                  getCurrentWindow().close()
                }}
                title={t('welcome.exit')}
                aria-label={t('welcome.exit')}
                className={`${TOP_WORD} home-exit`}
                style={{ backgroundColor: 'rgb(var(--c-ground) / 0.94)' }}
              >
                <svg aria-hidden="true" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M8 1.8v6M4.5 3.9a5.4 5.4 0 1 0 7 0" /></svg>
                <span className="hidden xl:inline">{t('nav.exit')}</span>
              </button>
            )}
          </div>
        </header>

        <div className="relative flex-1 min-h-0 overflow-hidden">
        {!guest && (
        <div ref={homeWall} data-home-wall="" data-away={view !== 'home' || undefined} className="home-wall">
        <div className="relative min-h-full max-w-[90rem] mx-auto flex flex-col px-5 sm:px-10 xl:px-16 pt-2 pb-5">
          <main className="relative flex-1 flex flex-col min-h-0">
            {/* What this is, not who's here: the name's at the top, and first days aren't "back". */}
            <h1 data-welcome-title="" data-rise="" className="enter-up text-2xl sm:text-[2rem] font-extralight leading-tight tracking-[0.01em] text-nier-strong" style={{ '--i': 1 } as CSSProperties}>{t(last ? 'welcome.pickUp' : reading || stats.daysHere > 1 ? 'browser.yours' : 'welcome.firstTitle')}</h1>
            <p data-welcome-line="" data-rise="" className="enter-up mt-2 text-[13px] tracking-[0.04em] text-nier-bg/85" style={{ '--i': 2 } as CSSProperties}>
              {last
                ? (stats.streak >= 2 ? t('welcome.streak', { n: number(stats.streak) }) : t('welcome.asLeft'))
                : reading ? ' ' : t('welcome.firstLine')}
            </p>

            {/* Wide: the last atrium and what else is recent on the left, what one can do
                on the right. Narrow, in the order written: what one can do right after Continue. */}
            <div className="mt-6 flex-1 grid gap-7 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem] lg:grid-rows-[auto_1fr] min-h-0">
              {/* What one came for, and the screen's one filled button: a wide card, its
                  picture beside its words, not over them. */}
              {last ? (
                <section
                  data-welcome-hero=""
                  onClick={() => openCard(last)}
                  className="welcome-hero enter-up group relative grid sm:grid-cols-[minmax(0,1.6fr)_minmax(14rem,1fr)] overflow-hidden border border-nier-border/40 bg-nier-blackLight cursor-pointer lg:col-start-1 lg:row-start-1"
                  style={{ '--i': 4 } as CSSProperties}
                >
                  <div data-fly={last.id} className={`relative aspect-[16/9] sm:aspect-auto overflow-hidden ${HERO_HEIGHT}`}><AtriumPicture url={last.preview} className="welcome-hero-picture" first /></div>
                  <div className="hall-ground flex flex-col justify-between gap-6 p-5 sm:p-7 border-t sm:border-t-0 sm:border-l border-nier-border/30">
                    <div className="min-w-0">
                      <h2 data-welcome-last="" className="text-[1.75rem] leading-tight font-normal text-nier-strong break-words">{last.name}</h2>
                      <p className="mt-2 text-xs text-nier-bg/85">
                        {t('welcome.lastHere', { when: whenOf(last.id) })}
                        {last.traces !== null && <span>{' · '}{t('welcome.traces', { n: number(last.traces) })}</span>}
                      </p>
                    </div>
                    <button
                      type="button"
                      data-welcome-continue=""
                      onClick={e => { e.stopPropagation(); openCard(last) }}
                      className="sheen relative self-start h-[3.25rem] px-8 text-[13px] font-medium tracking-[0.2em] uppercase transition-transform duration-300 hover:scale-[1.03] active:scale-[0.99]"
                      style={{ background: 'rgb(var(--c-accent))', color: 'rgb(var(--c-ground))', clipPath: DONATE_CUT }}
                    >
                      {t('welcome.continue')}
                    </button>
                  </div>
                </section>
              ) : reading ? (
                <section data-welcome-hero="" data-welcome-reading="" role="status" className={`enter-up relative min-h-[14rem] ${HERO_HEIGHT} overflow-hidden border border-nier-border/40 bg-nier-blackLight flex flex-col justify-end p-5 sm:p-7 lg:col-start-1 lg:row-start-1`} style={{ '--i': 4 } as CSSProperties}>
                  <div aria-hidden="true" className="absolute inset-0 animate-pulse bg-nier-bg/5" />
                  <div className="relative h-[2px] mb-4 bg-nier-bg/10 overflow-hidden"><div className="h-full bg-nier-bg/70 animate-nier-slide" /></div>
                  <p className="relative text-[11px] tracking-[0.2em] uppercase text-nier-bg/80">{t('browser.loadingAtriums')}</p>
                </section>
              ) : (
                <section data-welcome-hero="" className={`enter-up relative min-h-[14rem] ${HERO_HEIGHT} overflow-hidden border border-nier-border/40 flex flex-col items-center justify-center gap-6 p-7 lg:col-start-1 lg:row-start-1`} style={{ '--i': 4 } as CSSProperties}>
                  <span aria-hidden="true" className="block w-16 h-[4.5rem] bg-nier-strong" style={MARK} />
                  <button
                    type="button"
                    data-welcome-continue=""
                    onClick={() => onGo('atriums')}
                    className="sheen relative h-[3.25rem] px-10 text-[13px] font-medium tracking-[0.2em] uppercase transition-transform duration-300 hover:scale-[1.03] active:scale-[0.99]"
                    style={{ background: 'rgb(var(--c-accent))', color: 'rgb(var(--c-ground))', clipPath: DONATE_CUT }}
                  >
                    {t('welcome.enter')}
                  </button>
                </section>
              )}

              <aside data-rise="" className="flex flex-col gap-2.5 min-h-0 lg:col-start-2 lg:row-start-1 lg:row-span-2">
                {/* Making, finding and learning one's atriums, side by side. */}
                <div className="enter-up flex flex-col gap-2.5" style={{ '--i': 5 } as CSSProperties}>
                  <button type="button" data-welcome-new="" onClick={event => { const from = event.currentTarget.getBoundingClientRect(); askAtriums(api => api.openNew(from)) }} className={`${TILE} ${TILE_BIG}`}>
                    <span className={`${TILE_MARK} bg-nier-strong text-nier-black`}><TileIcon d={ICON.new} /></span>
                    {t('welcome.newAtrium')}
                  </button>
                  <button type="button" data-welcome-all="" onClick={() => onGo('atriums')} className={`${TILE} ${TILE_BIG}`}>
                    <span className={`${TILE_MARK} border border-nier-border/40`}><TileIcon d={ICON.all} /></span>
                    {t('welcome.allAtriums')}
                  </button>
                  <button type="button" data-welcome-tutorial="" onClick={() => askAtriums(api => api.startTutorial())} className={`${TILE} ${TILE_BIG}`}>
                    <span className={`${TILE_MARK} border border-nier-border/40`}><TileIcon d={ICON.tutorial} /></span>
                    {t('tutorial.button')}
                  </button>
                </div>
                <div className="enter-up grid grid-cols-2 gap-2.5" style={{ '--i': 6 } as CSSProperties}>
                  {/* An atrium in from a file, or out to one: Atriums' own windows, asked for from here. */}
                  <button type="button" data-welcome-import="" onClick={() => askAtriums(api => api.importAtrium())} className={`${TILE} ${TILE_SMALL}`}><TileIcon d={ICON.import} />{t('browser.importJson')}</button>
                  <button type="button" data-welcome-export="" onClick={() => askAtriums(api => api.exportAtrium())} className={`${TILE} ${TILE_SMALL}`}><TileIcon d={ICON.export} />{t('browser.exportJson')}</button>
                  <button type="button" data-home-help="" onClick={() => setShowHelp(true)} className={`${TILE} ${TILE_SMALL} ${isDesktop && onAbout ? '' : 'col-span-2'}`}><TileIcon d={ICON.help} />{t('help.title')}</button>
                  {isDesktop && onAbout && <button type="button" data-home-about="" onClick={onAbout} className={`${TILE} ${TILE_SMALL}`}><TileIcon d={ICON.about} />{t('welcome.about')}</button>}
                </div>
                {next && (
                  <button
                    type="button"
                    data-welcome-next=""
                    onClick={() => setShowSettings(true)}
                    className="welcome-next enter-up block w-full mt-2 p-3.5 text-left border"
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
                <WelcomeConnections onPinterest={() => setShowPinterest(true)} pinterestOpen={showPinterest} onAccountWanted={() => onGo('atriums')} style={{ '--i': 9 } as CSSProperties} />
              </aside>

              {/* Always the same number of places: the ones not yet taken stand empty. */}
              <section data-welcome-recents="" className="min-w-0 lg:col-start-1 lg:row-start-2">
                <p className="enter-fade text-[10px] tracking-[0.26em] uppercase text-nier-bg/80" style={{ '--i': 5 } as CSSProperties}>{t('welcome.alsoRecent')}</p>
                <div className="enter-cards mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ '--base': '300ms' } as CSSProperties}>
                  {Array.from({ length: RECENT_PLACES }, (_, i) => others[i]).map((card, i) => card ? (
                    <button key={card.id} type="button" data-welcome-recent={card.id} onClick={() => openCard(card)} className="welcome-recent hall-ground group flex flex-col w-full p-2 text-left border border-nier-border/30 hover:border-nier-border/70">
                      <span data-fly={card.id} className="relative block w-full aspect-[16/10] overflow-hidden bg-nier-blackLight"><AtriumPicture url={card.preview} className="welcome-hero-picture" /></span>
                      <span title={card.name} className="block w-full mt-2.5 px-1 truncate text-[13px] text-nier-strong">{card.name}</span>
                      <span className="block mt-1 px-1 pb-1 text-[11px] text-nier-bg/80">{whenOf(card.id)}</span>
                    </button>
                  ) : (
                    <span key={`empty-${i}`} aria-hidden="true" data-welcome-empty="" className="flex flex-col p-2 border border-dashed border-nier-border/25">
                      <span className="block w-full aspect-[16/10] bg-nier-bg/[0.03]" />
                      <span className="block mt-2.5 text-[13px]">&nbsp;</span>
                      <span className="block mt-1 pb-1 text-[11px]">&nbsp;</span>
                    </span>
                  ))}
                </div>
              </section>
            </div>
          </main>

          <footer className="enter-fade mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3" style={{ '--i': 10 } as CSSProperties}>
            <nav aria-label={t('welcome.more')} data-welcome-foot="" className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <button type="button" onClick={() => openContributors('/home')} className={footLink}>{t('welcome.contributors')}</button>
              {isDeveloper && onDevelopers && <button type="button" data-welcome-developers="" onClick={onDevelopers} className={footLink}>{t('welcome.developers')}</button>}
            </nav>
            {funded && (
              <button type="button" data-welcome-funded="" onClick={() => openContributors('/home')} title={t('goal.seeWho')} className="flex items-center gap-3 text-[11px] tracking-[0.1em] uppercase text-nier-bg/80 hover:text-nier-strong transition-colors">
                <span>{t('goal.funded', { percent: funded.percent })}</span>
                <span aria-hidden="true" className="block w-28 h-[3px] bg-nier-border/25 overflow-hidden"><span className="achievement-bar block h-full" style={{ width: `${funded.percent}%`, background: 'rgb(255 138 61)', animationDelay: '800ms' }} /></span>
              </button>
            )}
          </footer>
        </div>
        </div>
        )}
        {atriumsThere && (
          <div ref={atriumsWall} data-atriums-wall="" data-away={view !== 'atriums' || undefined} className="home-wall">
            <div className="relative max-w-[90rem] mx-auto px-5 sm:px-10 xl:px-16 pt-2">
              {LobbyBrowser && <LobbyBrowser onJoinLobby={onOpenAtrium} onReady={atriumsReady} inSight={view === 'atriums'} onCardsKnown={() => setCardsTold(told => told + 1)} guest={guest} onSignIn={onSignIn} />}
            </div>
          </div>
        )}
        </div>
      </div>

      {showSettings && <ProfileSettings onClose={() => setShowSettings(false)} onPinterest={() => setShowPinterest(true)} pinterestOpen={showPinterest} onLogOut={logOut} />}
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
