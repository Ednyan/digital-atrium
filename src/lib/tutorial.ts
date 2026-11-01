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
