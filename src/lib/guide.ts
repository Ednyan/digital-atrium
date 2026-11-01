// The guide: a person's first atrium starts with it, rather than empty
// (lib/templates guideFile). There's no tour to skip: it's real traces, used to
// learn by, and theirs to clear. Kept on this device, as the guide is only ever
// offered here once.

const GIVEN = 'atrium.guide.given'
const DUE = 'atrium.guide.due'
const placed = (lobbyId: string) => `atrium.guide.traces.${lobbyId}`

const read = (key: string) => {
  try { return localStorage.getItem(key) } catch { return null }
}
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch { /* for this visit, then */ }
}

// An atrium just made by someone with none: it gets the guide on being entered.
export function offerGuide(lobbyId: string) {
  if (!read(GIVEN)) write(DUE, lobbyId)
}
// Developers, to see it as a new person would: whether or not it's been given.
export const offerGuideAgain = (lobbyId: string) => write(DUE, lobbyId)
export const guideIsDue = (lobbyId: string) => read(DUE) === lobbyId
// True once only: the guide is going in now.
export function takeGuide(lobbyId: string) {
  if (!guideIsDue(lobbyId)) return false
  write(DUE, null)
  write(GIVEN, '1')
  return true
}

// What the guide put in this atrium, for Clear the guide.
export function guideTraces(lobbyId: string): string[] {
  try {
    const kept = JSON.parse(read(placed(lobbyId)) ?? '[]')
    return Array.isArray(kept) ? kept.filter(id => typeof id === 'string') : []
  } catch { return [] }
}
export const keepGuideTraces = (lobbyId: string, ids: string[]) => write(placed(lobbyId), ids.length > 0 ? JSON.stringify(ids) : null)
