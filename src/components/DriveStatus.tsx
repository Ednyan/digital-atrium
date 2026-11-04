import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '../lib/i18n'
import { letInAsker, putOffAsker, reconnectDrive, watchDriveStatus, type DriveStatus as Status } from '../lib/driveSync'
import { showToast } from '../lib/toast'

// Inside a Drive atrium, what it's doing that matters to whoever's in it
// (lib/driveSync): bringing saves in from Drive -- an atrium just joined is
// empty until then -- or, its Google sign-in gone (it lasts an hour, and not
// past the page), a button, since Google's window needs a click to open.
// Saves wait in the browser meanwhile, and go up after. And, to its owner
// and admins, whoever asks to be let in.
export default function DriveStatus({ onLeave }: { onLeave: () => void }) {
  const [status, setStatus] = useState<Status>({ catchingUp: false, signInNeeded: false, opening: false, asking: [] })
  useEffect(() => watchDriveStatus(setStatus), [])
  return (
    <>
      <div className="fixed bottom-8 right-8 z-[500] flex flex-col items-end gap-2">
        <Asking status={status} />
        {!status.opening && <Doing status={status} />}
      </div>
      <DriveOpening opening={status.opening} onLeave={onLeave} />
    </>
  )
}

// Opening, while all of it comes in from Drive: the atrium behind, seen but out of
// reach -- a modal dialog makes it so, pointer and focus -- and nothing typed,
// pasted or dropped reaches it. The way out stays.
const KEPT_OUT = ['keydown', 'keyup', 'keypress', 'paste', 'copy', 'cut', 'drop', 'dragover', 'wheel'] as const
export function DriveOpening({ opening, onLeave }: { opening: boolean; onLeave: () => void }) {
  const { t } = useTranslation()
  const box = useRef<HTMLDialogElement>(null)
  const still = useRef(opening)
  still.current = opening
  useEffect(() => {
    const dialog = box.current
    if (!dialog) return
    if (opening && !dialog.open) dialog.showModal()
    else if (!opening && dialog.open) dialog.close()
  }, [opening])
  useEffect(() => {
    const dialog = box.current!
    const stop = (event: Event) => {
      event.stopPropagation()
      if (event.type === 'drop' || event.type === 'dragover') event.preventDefault()
    }
    for (const kind of KEPT_OUT) dialog.addEventListener(kind, stop)
    return () => { for (const kind of KEPT_OUT) dialog.removeEventListener(kind, stop) }
  }, [])
  return (
    <dialog
      ref={box}
      data-drive-opening=""
      aria-labelledby="drive-opening-title"
      // Not closed by Escape -- and, closed anyway (a browser lets a second one
      // through), opened again while it's still coming.
      onCancel={event => event.preventDefault()}
      onClose={() => { if (still.current) box.current?.showModal() }}
      className="atrium-dialog w-[min(24rem,calc(100%-2rem))] p-6 font-mono select-none"
    >
      <p id="drive-opening-title" className="text-nier-strong text-xs tracking-[0.14em] uppercase">◇ {t('atrium.drive.catchingUp')}</p>
      <p className="mt-2 text-nier-bg/75 text-[11px] leading-relaxed">{t('atrium.drive.openingWait')}</p>
      <div className="mt-4 h-[3px] bg-nier-bg/15 overflow-hidden"><div className="h-full bg-nier-bg/80 animate-nier-slide" /></div>
      <button type="button" data-drive-opening-leave="" onClick={onLeave} className={`mt-5 ${BUTTON}`}>{t('atrium.leave')}</button>
    </dialog>
  )
}

const BUTTON = 'px-3 py-1.5 border border-nier-border/50 text-nier-bg text-[10px] tracking-[0.12em] uppercase hover:border-nier-bg transition-colors disabled:opacity-40'

function Asking({ status }: { status: Status }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<string | null>(null)
  const letIn = async (user: string) => {
    setBusy(user)
    try {
      // Signed in first (lib/driveSync), while the click counts: the member list is written.
      await letInAsker(user)
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }
  return (
    <>
      {status.asking.map(asker => (
        <div key={asker.user} className="max-w-xs px-4 py-3 bg-nier-blackLight border border-nier-border/60" role="alert">
          <p className="text-nier-bg text-xs leading-relaxed mb-2">◇ {t('atrium.drive.asks', { name: asker.name })}</p>
          <div className="flex gap-2">
            <button disabled={busy === asker.user} onClick={() => void letIn(asker.user)} className={BUTTON}>{t('atrium.drive.letIn')}</button>
            <button disabled={busy === asker.user} onClick={() => putOffAsker(asker.user)} className={BUTTON}>{t('atrium.drive.notNow')}</button>
          </div>
        </div>
      ))}
    </>
  )
}

function Doing({ status }: { status: Status }) {
  const { t } = useTranslation()
  // Over for this member: the atrium leaves, saying why (LobbyScene, App's KickedNotice).
  if (status.ended) return null
  if (status.signInNeeded) {
    return (
      <button
        onClick={() => void reconnectDrive().catch(error => showToast(error instanceof Error ? error.message : String(error)))}
        className="px-4 py-3 bg-nier-blackLight border border-nier-border/60 text-nier-bg text-xs tracking-[0.12em] uppercase hover:border-nier-bg transition-colors"
      >
        ◇ {t('atrium.drive.reconnect')}
      </button>
    )
  }
  if (!status.catchingUp) return null
  return (
    <div className="px-4 py-3 bg-nier-blackLight border border-nier-border/40 pointer-events-none" role="status">
      <p className="text-nier-bg text-xs tracking-[0.12em] uppercase mb-2">◇ {t('atrium.drive.catchingUp')}</p>
      <div className="w-48 h-[3px] bg-nier-bg/15 overflow-hidden">
        <div className="h-full bg-nier-bg/80 animate-nier-slide" />
      </div>
    </div>
  )
}
