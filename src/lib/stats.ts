// What's counted for one's achievements (lib/achievements), kept on this device as it happens and
// told to the account at most once a day, or when one is earned, as one small
// object beside its other settings (workers/rooms SETTINGS). Reading it costs
// nothing: it comes with one's entry, which the atrium browser already asks for.

import { notePictureFrom } from './myPicture'
import { workerAccount } from './signedIn'
import { useGameStore } from '../store/gameStore'
import { earnedAchievements, MOST_PINNED, mergeStats, NO_STATS, onDay, type Counter, type Stats } from './achievements'

export const ACHIEVEMENT_EVENT = 'atrium:achievement'
const SENT = 'atrium.stats.sent'

// One's own: the account's, signed in -- on desktop, not its device's person, who
// it begins from there -- else whoever the app has, else the device's.
const keyOf = (id = workerAccount()?.id || useGameStore.getState().userId || 'device') => `atrium.stats.${id}`
function keptStats(): string | null {
  const own = localStorage.getItem(keyOf())
  const { userId } = useGameStore.getState()
  return own ?? (userId ? localStorage.getItem(keyOf(userId)) : null)
}
const today = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function readStats(): Stats {
  try {
    const kept = JSON.parse(keptStats() || 'null')
    return kept && typeof kept === 'object' ? { ...NO_STATS, ...kept } : NO_STATS
  } catch {
    return NO_STATS
  }
}
const keep = (stats: Stats) => {
  try { localStorage.setItem(keyOf(), JSON.stringify(stats)) } catch { /* this visit's, then */ }
}

// A new one is said, and goes to the account with the next look (syncStats).
function kept(before: Stats, after: Stats) {
  keep(after)
  const had = new Set(earnedAchievements(before).map(one => one.id))
  const fresh = earnedAchievements(after).filter(one => !had.has(one.id))
  if (fresh.length === 0) return
  try { localStorage.removeItem(SENT) } catch { /* the day's look will do */ }
  for (const one of fresh) window.dispatchEvent(new CustomEvent(ACHIEVEMENT_EVENT, { detail: one.id }))
}

export function count(counter: Exclude<Counter, 'streak'>, by = 1) {
  if (by <= 0) return
  const before = readStats()
  kept(before, { ...before, [counter]: before[counter] + by })
}

// Today counted: on entering the atrium browser or an atrium.
export function noteToday() {
  const before = readStats()
  const after = onDay(before, today())
  if (after !== before) kept(before, after)
}

export function togglePinned(id: string): Stats {
  const before = readStats()
  const on = before.pinned.includes(id)
  if (!on && before.pinned.length >= MOST_PINNED) return before
  const after = { ...before, pinned: on ? before.pinned.filter(other => other !== id) : [...before.pinned, id], pinnedAt: Date.now() }
  keep(after)
  try { localStorage.removeItem(SENT) } catch { /* the day's look will do */ }
  return after
}

// When the account began, if it's known, as a time.
let joined: number | null = null
export const accountJoined = () => joined

// This device's and the account's, as one, and the account told if there's news
// for it: at most once a day, as one earned clears the mark. Signed out: nothing
// to ask. What fails is only tried again the next time it's due.
export async function syncStats(): Promise<Stats> {
  try {
    const [{ whoIsSignedIn }, { myEntry }] = await Promise.all([import('./signedIn'), import('./people')])
    if (!(await whoIsSignedIn())) return readStats()
    const entry = await myEntry() as { created_at?: number; settings?: { stats?: Partial<Stats>; picture?: unknown } }
    notePictureFrom(entry.settings)
    if (typeof entry.created_at === 'number') joined = entry.created_at
    const there = entry.settings?.stats
    const merged = mergeStats(readStats(), there)
    keep(merged)
    const day = today()
    const news = JSON.stringify(merged) !== JSON.stringify({ ...NO_STATS, ...there })
    if (news && localStorage.getItem(SENT) !== day) {
      localStorage.setItem(SENT, day)
      await myEntry({ settings: { stats: merged } } as never).catch(() => {})
    }
    return merged
  } catch {
    return readStats()
  }
}
