// The tutorial is an atrium of its own, kept in the browser (or the vault), made
// when it starts: TutorialOverlay runs in it. Finished, it stays as an ordinary
// empty atrium. Left before that, it's deleted the next time the atrium browser
// opens, so it's gone however it was left -- the button, a closed tab, a crash.

const SEEN = 'atrium.tutorial.seen'
const RUNNING = 'atrium.tutorial.lobby'

const read = (key: string) => {
  try { return localStorage.getItem(key) } catch { return null }
}
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch { /* for this visit, then */ }
}

// Offered by itself once, to someone with no atriums yet.
export const tutorialSeen = () => read(SEEN) !== null
export const markTutorialSeen = () => write(SEEN, '1')

export const tutorialStarted = (lobbyId: string) => { write(RUNNING, lobbyId); markTutorialSeen() }
export const inTutorial = (lobbyId: string) => read(RUNNING) === lobbyId
export const tutorialFinished = () => write(RUNNING, null)
// The atrium of a tutorial left unfinished, if there is one.
export const unfinishedTutorial = () => read(RUNNING)

// Lists that look empty don't say someone's new: their atriums on other devices
// arrive after the lists do, or not at all if that look fails. What the directory
// keeps says so at once: a space online, an atrium held for them, one they're
// joined to by themselves, a visit anywhere.
export function beenHereBefore(known: {
  entry: { drive_key?: unknown; drive_root?: unknown; hosted_root?: unknown }
  invitations: { auto?: number | null }[]
  held: unknown[]
  visits: object
}) {
  return !!(known.entry.drive_key || known.entry.drive_root || known.entry.hosted_root)
    || known.invitations.some(invitation => !!invitation.auto)
    || known.held.length > 0
    || Object.keys(known.visits).length > 0
}

// Whether the account signed in has been here before: false with no account, as
// nothing's kept for one, and null if it couldn't be asked. All of it is among
// what the atrium browser asks for as it opens (lib/worker AHEAD).
export async function cameBefore(): Promise<boolean | null> {
  try {
    const { whoIsSignedIn } = await import('./signedIn')
    if (!(await whoIsSignedIn())) return false
    const [{ myEntry, invitationsToMe }, { myHeld }, { toWorker }] = await Promise.all([import('./people'), import('./held'), import('./worker')])
    const [entry, invitations, held, visits] = await Promise.all([myEntry(), invitationsToMe(), myHeld(), toWorker<object>('/people/visits', {}, true)])
    if (!visits.ok || !visits.answer) return null
    return beenHereBefore({ entry, invitations, held, visits: visits.answer })
  } catch {
    return null
  }
}
