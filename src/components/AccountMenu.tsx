// One's name at the top of the welcome screen, and what's under it: one's profile,
// the language, and leaving. A small menu as anywhere else, gone on choosing,
// on Escape, or on a press beside it.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from '../lib/i18n'
import { LanguageList } from './LanguageToggle'
import { useMenuGlide } from './MenuGlide'

export default function AccountMenu({ children, chipClass, chipStyle, onProfile, onLogOut }: {
  children: ReactNode
  chipClass: string
  chipStyle?: CSSProperties
  onProfile: () => void
  // Web only: the desktop's account is the site's.
  onLogOut?: () => void
}) {
  const { t, language, languages } = useTranslation()
  const [open, setOpen] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const glide = useMenuGlide('.ctx-item')
  const close = () => { setOpen(false); setChoosing(false) }
  useEffect(() => {
    if (!open) return
    const beside = (event: MouseEvent | TouchEvent) => { if (!root.current?.contains(event.target as Node)) close() }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    document.addEventListener('mousedown', beside)
    document.addEventListener('touchstart', beside)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', beside)
      document.removeEventListener('touchstart', beside)
      document.removeEventListener('keydown', key)
    }
  }, [open])
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        data-welcome-profile=""
        aria-label={t('welcome.settings')}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className={chipClass}
        style={chipStyle}
      >
        {children}
      </button>
      {open && (
        <div {...glide.host} data-welcome-menu="" className="ctx-menu absolute right-0 top-[calc(100%+6px)] w-[15rem]" style={{ transformOrigin: 'top right' }}>
          {glide.light}
          <button type="button" data-welcome-menu-profile="" className="ctx-item" onClick={() => { close(); onProfile() }}>{t('welcome.settings')}</button>
          {languages.length > 1 && (
            <>
              <button type="button" data-welcome-menu-language="" aria-expanded={choosing} className="ctx-item" onClick={() => setChoosing(now => !now)}>
                {t('welcome.language')}
                <span className="ctx-aside truncate">{languages.find(entry => entry.code === language)?.endonym}</span>
                <span aria-hidden="true" className="profile-chevron text-[9px] -ml-1" data-open={choosing || undefined}>▸</span>
              </button>
              <div className="profile-fold" data-open={choosing || undefined}>
                <div className="min-h-0 overflow-hidden">
                  <div className="max-h-[50vh] overflow-y-auto border-y border-nier-border/20" onWheel={event => event.stopPropagation()}>
                    <LanguageList onChosen={close} />
                  </div>
                </div>
              </div>
            </>
          )}
          {onLogOut && (
            <>
              <div className="ctx-sep" />
              <button type="button" data-welcome-logout="" data-danger="" className="ctx-item" onClick={() => { close(); onLogOut() }}>{t('welcome.logOut')}</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
