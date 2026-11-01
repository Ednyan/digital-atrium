import { useEffect, useState } from 'react'
import { DRIVE_CONNECTION_EVENT, disconnectDrive, hasDriveToken } from '../lib/drive'
import { ensureSignedIn } from '../lib/driveSync'

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
