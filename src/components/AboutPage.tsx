// About, in the desktop app: the app itself, beside the website that's its home --
// what an atrium and a trace are, what the desktop adds, where the help is, and who
// made it and why. In the landing page's hall, coming in as Home does. From Home's
// About.

import { lazy, Suspense, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from '../lib/i18n'
import type { TranslationKey } from '../locales/en'
import { isDesktop } from '../lib/supabase'
import { openExternalUrl } from '../lib/openExternal'
import { ATRIUM_WEBSITE } from '../lib/creatorLinks'
import { openContributors } from '../lib/contributorsRoute'
import { ControlsList, MenuIcon } from './AtriumMenu'
import ConnectTiles from './ConnectTiles'
import RichText from './RichText'
import Hall from './Hall'
import { CREATOR_NAME } from './CreatorPanel'

const HelpPanel = lazy(() => import('./HelpPanel'))

// What it is: the two words everything else is made of.
const CONCEPTS: { name: TranslationKey; about: TranslationKey; icon: string }[] = [
  { name: 'landing.about.atriums', about: 'landing.about.atriumsDesc', icon: 'M4 4h16v16H4zM4 9h16M9 4v16M14 9v11' },
  { name: 'landing.about.traces', about: 'landing.about.tracesDesc', icon: 'M5 6h14v13H5zM12 9.5l3 3-3 3-3-3z' },
]
// What the desktop app adds.
const DESKTOP: { about: TranslationKey; icon: string }[] = [
  { about: 'about.desktop.folder', icon: 'M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2' },
  { about: 'about.desktop.live', icon: 'M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4' },
  { about: 'about.desktop.overlay', icon: 'M8 4h12v12H8zM4 8v12h12' },
  { about: 'about.desktop.account', icon: 'M8 7a4 4 0 1 0 8 0a4 4 0 1 0-8 0M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2' },
]
const TOP = 'cut-corner inline-flex items-center gap-2 h-[2.125rem] px-3 border border-nier-border/50 text-nier-strong hover:border-nier-border text-[11px] tracking-[0.15em] uppercase transition-colors'

function Heading({ children, i }: { children: ReactNode; i: number }) {
  return (
    <div className="enter-up flex items-center gap-3 mb-5" style={{ '--i': i } as CSSProperties}>
      <span aria-hidden="true" className="w-1.5 h-1.5 rotate-45 bg-nier-strong/80" />
      <h2 className="text-nier-strong text-[11px] tracking-[0.26em] uppercase">{children}</h2>
      <span aria-hidden="true" className="flex-1 h-px bg-gradient-to-r from-nier-border/40 to-transparent" />
    </div>
  )
}

export default function AboutPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const [version, setVersion] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)
  useEffect(() => {
    if (!isDesktop) return
    import('@tauri-apps/api/app').then(({ getVersion }) => getVersion()).then(setVersion).catch(() => {})
  }, [])
  useEffect(() => {
    if (showHelp) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onBack, showHelp])
  const website = () => openExternalUrl(ATRIUM_WEBSITE)

  return (
    <div data-about-page="" className="screen-rise fixed inset-0 overflow-hidden bg-nier-black text-nier-bg font-mono">
      <Hall />
      <div aria-hidden="true" className="welcome-glow" />
      <div className="relative h-full overflow-y-auto">
        <div className="max-w-5xl mx-auto px-5 sm:px-10 pt-5 pb-16">
          <nav className="enter-down flex items-center justify-between gap-3">
            <button type="button" data-about-back="" onClick={onBack} className={`group ${TOP}`} style={{ backgroundColor: 'rgb(var(--c-ground) / 0.94)' }}>
              <span aria-hidden="true" className="transition-transform group-hover:-translate-x-0.5">←</span>
              {t('common.back')}
            </button>
            <button type="button" onClick={website} className={TOP} style={{ backgroundColor: 'rgb(var(--c-ground) / 0.94)' }}>
              <span translate="no">digitalatrium.org</span>
              <span aria-hidden="true">↗</span>
            </button>
          </nav>

          {/* What it is, in a sentence, and the two ways on from here. */}
          <header className="mt-14 sm:mt-20 max-w-3xl">
            <p className="enter-up text-[11px] tracking-[0.3em] uppercase text-nier-bg/70" style={{ '--i': 1 } as CSSProperties}>
              ◇ {t('welcome.about')}{version && <span data-about-version=""> · {t('about.version', { version })}</span>}
            </p>
            <h1 className="enter-up mt-3 text-[clamp(2.1rem,6vw,3.6rem)] font-extralight leading-[1.05] tracking-[0.02em] text-nier-strong text-balance" style={{ '--i': 2 } as CSSProperties}>The Digital Atrium</h1>
            <p className="enter-up mt-5 text-[15px] leading-relaxed text-nier-bg/85 max-w-[62ch]" style={{ '--i': 3 } as CSSProperties}>
              <RichText text={t('landing.about.lead')} className="text-nier-strong" />
            </p>
            <div className="enter-up mt-7 flex flex-wrap gap-3" style={{ '--i': 4 } as CSSProperties}>
              <button
                type="button"
                data-about-website=""
                onClick={website}
                className="sheen relative h-[3rem] px-7 text-[12px] font-medium tracking-[0.18em] uppercase transition-transform duration-300 hover:scale-[1.03] active:scale-[0.99]"
                style={{ background: 'rgb(var(--c-accent))', color: 'rgb(var(--c-ground))', clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%)' }}
              >
                {t('about.website')}
              </button>
              <button type="button" data-about-help="" onClick={() => setShowHelp(true)} className="welcome-action hall-ground h-[3rem] px-6 border border-nier-border/50 hover:border-nier-border/90 text-[12px] tracking-[0.18em] uppercase text-nier-strong">
                ? {t('help.title')}
              </button>
            </div>
          </header>

          {/* An atrium, a trace. */}
          <section className="mt-20">
            <Heading i={5}>{t('about.whatTitle')}</Heading>
            <div className="enter-cards grid sm:grid-cols-2 gap-3" style={{ '--base': '420ms' } as CSSProperties}>
              {CONCEPTS.map(({ name, about, icon }) => (
                <article key={name} className="about-tile hall-ground p-5 sm:p-6 border border-nier-border/35">
                  <span className="about-tile-icon"><MenuIcon d={icon} size={22} /></span>
                  <h3 className="mt-4 text-nier-strong text-sm tracking-[0.18em] uppercase">{t(name)}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-nier-bg/80">{t(about)}</p>
                </article>
              ))}
            </div>
          </section>

          {/* What the desktop app adds to the website's. */}
          <section className="mt-16">
            <Heading i={7}>{t('about.desktop.title')}</Heading>
            <ul className="enter-cards grid sm:grid-cols-2 gap-3" style={{ '--base': '560ms' } as CSSProperties}>
              {DESKTOP.map(({ about, icon }) => (
                <li key={about} className="about-tile hall-ground flex gap-4 p-5 border border-nier-border/30">
                  <span className="about-tile-icon shrink-0"><MenuIcon d={icon} size={20} /></span>
                  <p className="text-[13px] leading-relaxed text-nier-bg/85">{t(about)}</p>
                </li>
              ))}
            </ul>
          </section>

          {/* The help: every tool, step by step. */}
          <section className="mt-16">
            <Heading i={9}>{t('help.title')}</Heading>
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              className="enter-up about-tile hall-ground group w-full flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6 border border-nier-border/40 hover:border-nier-border/90 text-left"
              style={{ '--i': 10 } as CSSProperties}
            >
              <span className="text-[13px] leading-relaxed text-nier-bg/85 max-w-[52ch]">{t('about.help.lead')}</span>
              <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.2em] uppercase text-nier-strong">
                {t('help.title')} <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span>
              </span>
            </button>
          </section>

          {/* Who made it, and why. */}
          <section className="mt-16">
            <Heading i={11}>{t('landing.creator.title')}</Heading>
            <div className="enter-up grid gap-8 md:grid-cols-[15rem_minmax(0,1fr)] items-start" style={{ '--i': 12 } as CSSProperties}>
              <figure className="about-portrait m-0 border border-nier-border/30 overflow-hidden max-w-[15rem]">
                <img src="/landing/creator-480.webp" width={480} height={480} alt={t('landing.creator.alt')} loading="lazy" className="block w-full h-auto" />
              </figure>
              <div className="min-w-0">
                <h3 translate="no" className="text-3xl font-extralight tracking-[0.03em] text-nier-strong">{CREATOR_NAME}</h3>
                <p className="mt-4 text-[14px] leading-relaxed text-nier-bg/85 max-w-[62ch]">{t('landing.creator.p1')}</p>
                <p className="mt-3 text-[14px] leading-relaxed text-nier-bg/75 max-w-[62ch]">{t('landing.creator.p2')}</p>
                <p className="mt-7 mb-3 text-[10px] tracking-[0.24em] uppercase text-nier-bg/65">{t('landing.connect')}</p>
                <ConnectTiles columns={4} />
                <button type="button" onClick={() => openContributors('/about')} className="mt-4 text-[11px] tracking-[0.2em] uppercase text-nier-bg/70 hover:text-nier-strong transition-colors">
                  ◇ {t('welcome.contributors')}
                </button>
              </div>
            </div>
          </section>

          {/* The controls, at the end and folded: there for whoever looks for them. */}
          <details className="about-controls enter-up mt-16 border-t border-nier-border/25 pt-5" style={{ '--i': 13 } as CSSProperties}>
            <summary className="flex items-center gap-3 cursor-pointer select-none text-[11px] tracking-[0.26em] uppercase text-nier-strong">
              <span aria-hidden="true" className="about-controls-mark">+</span>
              {t('atrium.controls.title')}
            </summary>
            <div className="mt-5"><ControlsList /></div>
          </details>
        </div>
      </div>
      {showHelp && <Suspense fallback={null}><HelpPanel onClose={() => setShowHelp(false)} /></Suspense>}
    </div>
  )
}
