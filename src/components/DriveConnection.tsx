import { useEffect, useState } from 'react'
import { DRIVE_CONNECTION_EVENT, disconnectDrive, hasDriveToken } from '../lib/drive'
import { ensureSignedIn } from '../lib/driveSync'
import { useTranslation } from '../lib/i18n'

/** Whether Google Drive is connected for this account, with the ways to connect
 *  it (Google's window, so on the click) and to give it back. Each answers with
 *  what went wrong, if anything. */
export function useDriveConnection() {
  const [connected, setConnected] = useState(hasDriveToken)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const look = () => setConnected(hasDriveToken())
    window.addEventListener(DRIVE_CONNECTION_EVENT, look)
    return () => window.removeEventListener(DRIVE_CONNECTION_EVENT, look)
  }, [])
  const act = async (task: () => Promise<unknown>): Promise<string> => {
    setBusy(true)
    try {
      await task()
      return ''
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    } finally {
      setBusy(false)
      setConnected(hasDriveToken())
    }
  }
  return { connected, busy, connect: () => act(ensureSignedIn), disconnect: () => act(disconnectDrive) }
}

/** The same, said, with its button -- giving it back everywhere, as Google forgets
 *  this app's access (lib/drive, disconnectDrive). A Drive atrium asks for it again
 *  when it's opened. */
export default function DriveConnection({ buttonClass }: { buttonClass: string }) {
  const { t } = useTranslation()
  const { connected, busy, connect, disconnect } = useDriveConnection()
  const [note, setNote] = useState('')
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-nier-bg/80 text-xs tracking-[0.15em] uppercase">◇ {t(connected ? 'browser.drive.connected' : 'browser.drive.notConnected')}</span>
      <button disabled={busy} onClick={() => { setNote(''); void (connected ? disconnect() : connect()).then(setNote) }} className={buttonClass}>
        {t(connected ? 'browser.drive.disconnect' : 'browser.drive.connect')}
      </button>
      {note && <p role="alert" className="w-full text-nier-bg/70 text-[11px]">{note}</p>}
    </div>
  )
}
