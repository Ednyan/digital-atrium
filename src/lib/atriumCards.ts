// What the welcome screen says about one's atriums -- name, picture, how many
// traces -- kept on the device as the atrium browser reads its lists and as one
// leaves an atrium, so that showing it asks the server for nothing.

export interface AtriumCard {
  id: string
  name: string
  preview: string | null
  traces: number | null
}

// None chosen: enough for the screen, small enough never to matter.
const MOST_KEPT = 40
const keyOf = (userId: string) => `atrium.cards.${userId || 'device'}`

export function readCards(userId: string): Record<string, AtriumCard> {
  try {
    const kept = JSON.parse(localStorage.getItem(keyOf(userId)) || 'null')
    return kept && typeof kept === 'object' && !Array.isArray(kept) ? kept : {}
  } catch {
    return {}
  }
}
const keep = (userId: string, cards: Record<string, AtriumCard>) => {
  try { localStorage.setItem(keyOf(userId), JSON.stringify(cards)) } catch { /* it's only a card */ }
}

const merged = (was: AtriumCard | undefined, id: string, part: Partial<Omit<AtriumCard, 'id'>>): AtriumCard => ({
  id,
  name: part.name ?? was?.name ?? '',
  preview: part.preview !== undefined ? part.preview : was?.preview ?? null,
  traces: part.traces !== undefined ? part.traces : was?.traces ?? null,
})

export function rememberCard(userId: string, id: string, part: Partial<Omit<AtriumCard, 'id'>>) {
  const cards = readCards(userId)
  cards[id] = merged(cards[id], id, part)
  keep(userId, trimmed(cards))
}

// A list read: only written if it says something new.
export function rememberCards(userId: string, list: { id: string; name: string; preview: string | null }[]) {
  const cards = readCards(userId)
  let changed = false
  for (const { id, name, preview } of list) {
    const was = cards[id]
    if (was && was.name === name && was.preview === preview) continue
    cards[id] = merged(was, id, { name, preview })
    changed = true
  }
  if (changed) keep(userId, trimmed(cards))
}

export function forgetCard(userId: string, id: string) {
  const cards = readCards(userId)
  if (!(id in cards)) return
  delete cards[id]
  keep(userId, cards)
}

const trimmed = (cards: Record<string, AtriumCard>) => {
  const ids = Object.keys(cards)
  return ids.length <= MOST_KEPT ? cards : Object.fromEntries(ids.slice(ids.length - MOST_KEPT).map(id => [id, cards[id]]))
}

// The ones opened, last opened first: what the welcome screen shows.
export function recentCards(cards: Record<string, AtriumCard>, visitedAt: (id: string) => number, skip: string | null = null): AtriumCard[] {
  return Object.values(cards)
    .filter(card => card.name && card.id !== skip && visitedAt(card.id) > 0)
    .sort((a, b) => visitedAt(b.id) - visitedAt(a.id))
}

// How long ago, as Intl.RelativeTimeFormat takes it.
export function agoOf(at: number, now: number): [number, 'minute' | 'hour' | 'day' | 'week' | 'month'] {
  const minutes = Math.max(0, Math.round((now - at) / 60_000))
  if (minutes < 60) return [-minutes, 'minute']
  const hours = Math.round(minutes / 60)
  if (hours < 24) return [-hours, 'hour']
  const days = Math.round(hours / 24)
  if (days < 7) return [-days, 'day']
  if (days < 30) return [-Math.round(days / 7), 'week']
  return [-Math.max(1, Math.round(days / 30)), 'month']
}
