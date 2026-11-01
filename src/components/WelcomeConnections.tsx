// What this account is connected to, on the welcome screen: said, and connected
// from here where it isn't. Nothing new is asked for: Drive's is known on the device,
// Pinterest's goes along with the screen's other reads.

import type { CSSProperties, ReactNode } from 'react'
import { googleOpen } from '../lib/drive'
import { useTranslation } from '../lib/i18n'
import { initiatePinterestConnect, isPinterestConfigured, usePinterestStatus } from '../lib/pinterest'
import { isDesktop } from '../lib/supabase'
import { showToast } from '../lib/toast'
import { useDriveConnection } from './DriveConnection'
import PinterestMark from './PinterestMark'

function DriveMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12.01 1.485c-2.082 0-3.754.02-3.743.047.01.02 1.708 3.001 3.774 6.62l3.76 6.574h3.76c2.081 0 3.753-.02 3.742-.047-.005-.02-1.708-3.001-3.775-6.62l-3.76-6.574zm-4.76 1.73a789.828 789.861 0 0 0-3.63 6.319L0 15.868l1.89 3.298 1.885 3.297 3.62-6.335 3.618-6.33-1.88-3.287C8.1 4.704 7.255 3.22 7.25 3.214zm2.259 12.653-.203.348c-.114.198-.96 1.672-1.88 3.287a423.93 423.948 0 0 1-1.698 2.97c-.01.026 3.24.042 7.222.042h7.244l1.796-3.157c.992-1.734 1.85-3.23 1.906-3.323l.1-.167h-7.243z" />
    </svg>
  )
}

function Row({ id, mark, name, connected, said, busy, onPress }: {
  id: string
  mark: ReactNode
  name: string
  // Null: not known yet.
  connected: boolean | null
  said: string
  busy?: boolean
  // Nothing to press, where there's nothing to do here.
  onPress?: () => void
}) {
  const { t } = useTranslation()
  const inside = (
    <>
      <span className="w-4 h-4 shrink-0 text-nier-bg/85">{mark}</span>
      <span translate="no" className="flex-1 min-w-0 truncate text-[12px] text-nier-strong">{name}</span>
      {connected === true && (
        <span className="flex items-center gap-2 min-w-0 text-[11px] text-nier-bg/85">
          <span aria-hidden="true" className="landing-lit block w-1.5 h-1.5 shrink-0 rotate-45" />
          <span className="truncate">{said}</span>
        </span>
      )}
      {connected === false && (
        <span className="welcome-connect shrink-0 px-2.5 py-1 border border-nier-border/50 text-[10px] tracking-[0.14em] uppercase text-nier-strong">{t('browser.drive.connect')}</span>
      )}
    </>
  )
  const row = 'flex items-center gap-3 w-full min-h-[2.75rem] px-3 py-1.5 text-left'
  if (!onPress) return <div data-welcome-connection={id} data-connected={connected ?? undefined} className={row}>{inside}</div>
  return (
    <button type="button" data-welcome-connection={id} data-connected={connected ?? undefined} disabled={busy} onClick={onPress} className={`welcome-connection ${row} disabled:opacity-50`}>
      {inside}
    </button>
  )
}

export default function WelcomeConnections({ onPinterest, pinterestOpen, style }: {
  // Pinterest's own panel: to give it back, and how the desktop connects.
  onPinterest: () => void
  pinterestOpen: boolean
  style?: CSSProperties
}) {
  const { t } = useTranslation()
  const drive = useDriveConnection()
  const pinterest = usePinterestStatus(pinterestOpen)
  const showDrive = googleOpen
  const showPinterest = isDesktop || isPinterestConfigured()
  if (!showDrive && !showPinterest) return null
  return (
    <section data-welcome-connections="" className="enter-up" style={style}>
      <p className="text-[10px] tracking-[0.26em] uppercase text-nier-bg/80">{t('welcome.connections')}</p>
      <div className="hall-ground mt-2.5 border border-nier-border/30 divide-y divide-nier-border/20">
        {showDrive && (
          <Row
            id="drive"
            mark={<DriveMark className="block w-full h-full" />}
            name="Google Drive"
            connected={drive.connected}
            said={t('profile.pinterestConnectedPlain')}
            busy={drive.busy}
            onPress={drive.connected ? undefined : () => void drive.connect().then(problem => { if (problem) showToast(problem) })}
          />
        )}
        {showPinterest && (
          <Row
            id="pinterest"
            mark={<PinterestMark className="block w-full h-full" />}
            name={t('profile.pinterest')}
            connected={pinterest && pinterest.connected}
            said={pinterest?.username ? `@${pinterest.username}` : t('profile.pinterestConnectedPlain')}
            onPress={pinterest && !pinterest.connected && !isDesktop ? initiatePinterestConnect : onPinterest}
          />
        )}
      </div>
    </section>
  )
}
