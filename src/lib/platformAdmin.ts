// Whether the signed-in account is the platform's operator -- Red Puer --
// as the Atrium's worker says (workers/rooms, people.ts isOperator: kept
// there, Supabase's add_platform_admin.sql vouching the first time), for any
// kind of account. The operator's tools never on the desktop; false when
// signed out or offline. Templates (TemplateMaker below) on the desktop too,
// by the account signed in there by the site.

import { isDesktop } from './supabase'
import { toWorker } from './worker'
import { workerAccount } from './signedIn'
import { useGameStore } from '../store/gameStore'

// The account last found to be the operator, on this device: what's known
// before the worker's answer comes, so the welcome screen's Developers row is
// there with the rest rather than arriving after them. Only what's shown --
// the Developers page and the worker ask for themselves.
const KEPT = 'atrium.operator'
// The answer for the account signed in, asked once a visit, not once a screen.
let asked: { user: string; answer: Promise<boolean> } | null = null

/** As last found here, at once: whether the account signed in is the operator. */
export function knownPlatformAdmin(): boolean {
  const user = useGameStore.getState().userId
  try { return !isDesktop && !!user && localStorage.getItem(KEPT) === user } catch { return false }
}

export function checkPlatformAdmin(): Promise<boolean> {
  return isDesktop ? Promise.resolve(false) : ask(useGameStore.getState().userId)
}

/** The account signed in here, at once: on the desktop, the one signed in by
 *  the site, as the device's own person isn't one. (A guest's id, on the web.) */
export const accountHere = () => (isDesktop ? workerAccount()?.id : useGameStore.getState().userId) ?? null

// Who makes templates and links values (docs/IDEAS.md, "Making your own"): the
// operator, until the plans exist.
const makerId = accountHere
export function knownTemplateMaker(): boolean {
  const user = makerId()
  try { return !!user && localStorage.getItem(KEPT) === user } catch { return false }
}
export const checkTemplateMaker = (): Promise<boolean> => { const user = makerId(); return user ? ask(user) : Promise.resolve(false) }

function ask(user: string): Promise<boolean> {
  if (asked?.user === user) return asked.answer
  const answer = (async () => {
    try {
      const { ok, answer } = await toWorker<{ operator?: boolean }>('/ops/operator', {}, true)
      const operator = ok && answer?.operator === true
      // Not kept when the worker couldn't be asked: asked again next time.
      if (!ok) asked = null
      else try {
        if (operator) localStorage.setItem(KEPT, user)
        else if (localStorage.getItem(KEPT) === user) localStorage.removeItem(KEPT)
      } catch { /* this visit only */ }
      return operator
    } catch {
      asked = null
      return false
    }
  })()
  asked = { user, answer }
  return answer
}
