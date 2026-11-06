// Pins from Pinterest, shown. Pinterest's rules don't let what's read from it be
// kept (docs/PINTEREST.md): an atrium keeps a pin as its id (its link), its board
// and whose connection imported it (Trace.pinSource), never its picture or its
// title. Each time an atrium is opened, its pins are read from Pinterest through
// the worker (workers/rooms pinterest, `show`) -- through the importer's connection,
// for anyone who can see it -- and held here for the visit, nowhere else.
//
// What's read is put on the traces in the store (mediaUrl, pinTitle) as they're
// drawn; the rows they're saved as never carry it (lib/traceInsert). One Pinterest
// won't give -- gone, its importer disconnected, on a board that isn't public to
// someone else -- is drawn as Pinterest's mark (TraceOverlay).

import { useEffect } from 'react'
import { useGameStore } from '../store/gameStore'
import { supabase, isDesktop } from './supabase'
import { toWorker } from './worker'
import { getDesktopLinkToken } from './pinterestDesktop'
import { isPin, pinIdOf } from './pins'
import type { Trace } from '../types/database'

interface Shown { image: string; width: number; height: number; title: string; board: string | null }
interface Asked { id: string; by: string; board: string | null }

// This visit's, for the atrium open: by pin id, null where Pinterest gave none.
const shown = new Map<string, Shown | null>()
const asked = new Set<string>()
let atrium: string | null = null

/** What was just read for a pin elsewhere (an import): shown at once, not asked again. */
export function rememberPin(id: string, pin: Shown) {
  shown.set(id, pin)
  asked.add(id)
}

/** Whose connection a pin imported now is read through: the desktop's link (its
 *  hash, as the worker keeps it), or the account signed in. */
export async function pinterestHolder(userId: string): Promise<string> {
  const link = isDesktop ? getDesktopLinkToken() : null
  if (!link) return userId
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(link))
  return `link:${[...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('')}`
}

// Pinterest's answer for these, asked again for any it left for later.
async function read(pins: Asked[]): Promise<void> {
  let left = pins
  for (let round = 0; left.length && round < 20; round++) {
    const link = isDesktop ? getDesktopLinkToken() : null
    const { ok, answer } = await toWorker<{ pins: Record<string, Shown | null>; later: string[] }>('/pinterest/show', { pins: left, ...(link ? { link } : {}) }).catch(() => ({ ok: false, answer: null }))
    if (!ok || !answer) {
      // Not reachable (offline, say): shown as Pinterest's mark this visit.
      for (const pin of left) if (!shown.has(pin.id)) shown.set(pin.id, null)
      return
    }
    for (const [id, pin] of Object.entries(answer.pins ?? {})) shown.set(id, pin)
    const later = new Set(answer.later ?? [])
    const next = left.filter(pin => later.has(pin.id))
    if (next.length === left.length) break
    left = next
  }
}

// A pin kept the old way, let go of where it can be changed: its picture's address
// gone, where it came from kept, its title -- the name it was given -- gone too
// unless it was renamed since.
async function letGoOfOld(trace: Trace, pin: Shown | null): Promise<Partial<Trace> | null> {
  if (!supabase || !trace.lobbyId) return null
  const titled = !!pin && (trace.content ?? '').trim() === pin.title.trim()
  const pinSource = trace.pinSource ?? { board: pin?.board ?? null, by: trace.userId }
  const columns = { media_url: null, image_url: null, pin_source: pinSource, ...(titled ? { content: '' } : {}) }
  const { error } = await (supabase.from('traces') as any).update(columns).eq('id', trace.id)
  return error ? null : { pinSource, pinStale: false, ...(titled ? { content: '' } : {}) }
}

/** The atrium's pins shown: read when it's opened, and as pins arrive in it. */
export function usePinsShown(lobbyId: string | null, canEdit: boolean) {
  useEffect(() => {
    if (!lobbyId) return
    // Opened again, read again: nothing kept from one opening to the next.
    if (atrium !== lobbyId) { atrium = lobbyId; shown.clear(); asked.clear() }
    let left = false
    let queued = false
    const cleaning = new Set<string>()
    const fill = () => {
      queued = false
      if (left) return
      const store = useGameStore.getState()
      const drawn: Trace[] = []
      const ask: Asked[] = []
      for (const trace of store.traces) {
        if (!isPin(trace)) continue
        const id = pinIdOf(trace)
        if (!id) continue
        if (shown.has(id)) {
          const pin = shown.get(id) ?? null
          if (trace.mediaUrl !== (pin?.image ?? undefined) || trace.pinTitle !== (pin?.title ?? undefined)) {
            drawn.push({ ...trace, mediaUrl: pin?.image, pinTitle: pin?.title })
          }
          if (trace.pinStale && canEdit && !cleaning.has(trace.id)) {
            cleaning.add(trace.id)
            void letGoOfOld(trace, pin).then(changes => {
              if (!changes || left) return
              const now = useGameStore.getState().traces.find(tr => tr.id === trace.id)
              if (now) useGameStore.getState().receiveTraces([{ ...now, ...changes }])
            })
          }
        } else if (!asked.has(id)) {
          asked.add(id)
          ask.push({ id, by: trace.pinSource?.by ?? trace.userId, board: trace.pinSource?.board ?? null })
        }
      }
      if (drawn.length) store.receiveTraces(drawn)
      if (ask.length) void read(ask).then(later)
    }
    // Once for what arrives together (an atrium's traces, an import's), not per change.
    const later = () => { if (!queued) { queued = true; queueMicrotask(fill) } }
    later()
    const stop = useGameStore.subscribe((state, before) => { if (state.traces !== before.traces) later() })
    return () => { left = true; stop() }
  }, [lobbyId, canEdit])
}
