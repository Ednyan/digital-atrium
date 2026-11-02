// A picture of an atrium for the atrium browser's cards: the view its owner or
// an admin last left it at, as it was seen -- the room (its colour, its
// picture, the canvas's ground, grid and particles: RoomSnapshot) and over it
// the traces, drawn from their data (lib/exportImage) -- small, as WebP, and
// kept with the atrium (lobbies.preview_url, preview_at -- add_lobby_preview.sql).
//
// Made only when something in the atrium or its look changed since the last
// one (or there isn't one), at most every few minutes, and never in the way:
// after leaving, once the browser is idle. Everything it needs is taken as the
// atrium is left, since the canvas and the store are gone straight after.
// One missing what it should show never replaces a picture, nor is shared
// (lib/previewRules): better none than one that misleads everyone else's copy.
//
// Made by the atrium's owner alone, and the same for everyone: a cloud
// atrium's in its row; a Drive atrium's sent to Drive too, and taken from
// there by everyone else's copy (lib/driveSync, sharePreview).
//
// On the web each picture is a new file, <id>/preview-<time>.webp -- the CDN
// keeps a file an hour whatever its query string, so a file written over
// would go on showing the old picture -- and the one it replaces is removed
// (add_lobby_preview.sql), so none is left behind. In a vault, one file an
// atrium, rewritten.

import { supabase, isLocalData } from './supabase'
import { exportImage, loadPicture, pictureOf } from './exportImage'
import { readCards, rememberCard } from './atriumCards'
import { previewDue, previewIsWhole, type PreviewMemory } from './previewRules'
import { useGameStore } from '../store/gameStore'
import type { Layer, Trace } from '../types/database'
import type { TraceLink } from './traceLinks'

const MAX_SIDE = 960
// Not again within this long of the last, changed or not (ms).
const AT_MOST_EVERY = 3 * 60 * 1000
const memoryKey = (lobbyId: string) => `atrium.preview.${lobbyId}`

export interface PreviewDetail { lobbyId: string; url: string; at: string }

// The room as it's seen, read by the scene as the atrium is left. A point of
// the world at (x, y) is on screen at (x * zoom + view.x, y * zoom + view.y).
export interface RoomSnapshot {
  width: number
  height: number
  view: { x: number; y: number; zoom: number }
  colour: string
  // Its picture, placed as on screen (in screen pixels): repeated from (x, y)
  // in tiles w by h, or one picture there; as strong as `opacity`.
  picture: { url: string; file: Blob | null; x: number; y: number; w: number; h: number; repeat: boolean; opacity: number } | null
  // It has a picture, but not one on screen yet: still loading, or its file isn't here.
  pictureMissing: boolean
  // The canvas's ground, grid and particles, shrunk to the preview's size.
  layer: HTMLCanvasElement | null
}

export interface AtriumAsLeft {
  traces: Trace[]
  links: TraceLink[]
  layers: Layer[]
  // How it looks (its theme, as text): a change to it is a change too.
  look: string
  // Its colour, where there's no room to picture.
  background: string
  room: (maxSide: number) => RoomSnapshot | null
}

// What the atrium holds and how it looks, as one number: a change to anything
// about any trace -- where it is, its words, its colours, its style -- or to
// the atrium's look, changes it. A drawing counts by its revision, not its
// every point.
function fingerprint(traces: Trace[], look: string): string {
  let hash = 0x811c9dc5
  const add = (text: string) => {
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193)
  }
  const drawingByRevision = (key: string, value: unknown) =>
    key === 'strokeData' && value && typeof value === 'object' ? (value as { rev?: number }).rev ?? 1 : value
  for (const t of traces) add(JSON.stringify(t, drawingByRevision))
  add(look)
  return `${traces.length}:${(hash >>> 0).toString(36)}`
}

/** Take what's needed as the atrium is left; make the picture after, if it's due. */
export function captureAtriumPreview(lobbyId: string, atrium: AtriumAsLeft) {
  const { traces, links, layers, background } = atrium
  if (!supabase || traces.length === 0) return
  const print = fingerprint(traces, atrium.look)
  let last: PreviewMemory | null = null
  try { last = JSON.parse(localStorage.getItem(memoryKey(lobbyId)) || 'null') } catch { /* none */ }
  if (!previewDue(last, print, Date.now(), AT_MOST_EVERY)) return
  // One made here, or one this device has from anywhere: this device's memory alone
  // would let the first visit from a new place write over everyone's good picture.
  const hasOne = !!last || !!readCards(useGameStore.getState().userId)[lobbyId]?.preview

  // On screen as it's left: the traces whose boxes meet the window, and a
  // frame's whole contents with it (else its off-screen part stands empty).
  // All of them, where none do.
  const shown = new Set<string>()
  for (const el of document.querySelectorAll<HTMLElement>('[data-trace-id]')) {
    const r = el.getBoundingClientRect()
    if (r.width && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight) shown.add(el.dataset.traceId!)
  }
  const inView = traces.filter(trace => shown.has(trace.id) || (trace.frameId && shown.has(trace.frameId)))
  // The view as it's seen, where any of the atrium is in it; else all of it,
  // on its colour.
  const room = inView.length ? atrium.room(MAX_SIDE) : null
  const pictured = inView.length ? inView : traces
  // A picture never gives way to a poorer one: none of the atrium in view, or its
  // own picture not on screen. Nothing's made or sent, and the next leave tries.
  if (hasOne && (!room || room.pictureMissing)) return

  // Through the client of the atrium left (lib/browserAtriums), whichever is current by then.
  const client = supabase, local = isLocalData
  const make = () => void makePreview(client, local, lobbyId, pictured, links, layers, room, background, print, hasOne)
  if ('requestIdleCallback' in window) requestIdleCallback(make, { timeout: 4000 })
  else setTimeout(make, 1500)
}

const remember = (lobbyId: string, memory: PreviewMemory) => {
  try { localStorage.setItem(memoryKey(lobbyId), JSON.stringify(memory)) } catch { /* the next leave tries again */ }
}
async function shareNow(lobbyId: string, blob: Blob, memory: PreviewMemory) {
  const shared = await (await import('./driveSync')).sharePreview(lobbyId, blob).catch(error => {
    console.warn('[preview] not shared:', error)
    return false
  })
  if (shared) remember(lobbyId, { ...memory, unshared: false })
  return shared
}
/** Whether this device's picture is newer than what's shared of the atrium, so stands
 *  over it (lib/driveSync, takePreview); and it's sent, now, if it can be. */
export async function ownPictureStands(lobbyId: string): Promise<boolean> {
  let memory: PreviewMemory | null = null
  try { memory = JSON.parse(localStorage.getItem(memoryKey(lobbyId)) || 'null') } catch { /* none */ }
  if (!memory?.unshared) return false
  const { readLocalFileBytes } = await import('./localDb')
  const bytes = await readLocalFileBytes(`local://traces/${lobbyId}/preview.webp`)
  if (bytes) await shareNow(lobbyId, new Blob([bytes as BlobPart], { type: 'image/webp' }), memory)
  return true
}

async function makePreview(client: any, local: boolean, lobbyId: string, traces: Trace[], links: TraceLink[], layers: Layer[], room: RoomSnapshot | null, background: string, print: string, hasOne: boolean) {
  if (!client) return
  try {
    const under = room && await roomPicture(room)
    if (under?.missed && hasOne) return
    const { blob, images } = await exportImage(traces, links, layers, {
      format: 'png', scale: 1, background, maxSide: MAX_SIDE, type: 'image/webp', quality: 0.8,
      ...(room && {
        frame: { x: -room.view.x / room.view.zoom, y: -room.view.y / room.view.zoom, width: room.width / room.view.zoom, height: room.height / room.view.zoom },
        underlay: under!.canvas,
      }),
    })
    const whole = previewIsWhole({ hadRoom: !!room, roomPictureLost: !!room?.pictureMissing || !!under?.missed, images })
    if (!whole && hasOne) return
    if (!await keepPreview(client, local, lobbyId, blob)) return
    // A Drive atrium's is everyone's: sent there too, if it's fit to be. Said to be
    // waiting first, so a page closed on the way doesn't lose that it is.
    const memory: PreviewMemory = { print, at: Date.now(), whole, unshared: local && whole }
    remember(lobbyId, memory)
    if (local && whole) await shareNow(lobbyId, blob, memory)
  } catch (error) {
    console.warn('[preview] not made:', error)
  }
}

/** A picture kept as an atrium's (`client`'s, `local` if a vault's): its file,
 *  its row, the one it replaces removed, and the atrium browser told. False
 *  if it couldn't be. */
export async function keepPreview(client: any, local: boolean, lobbyId: string, blob: Blob): Promise<boolean> {
  const path = local ? `${lobbyId}/preview.webp` : `${lobbyId}/preview-${Date.now()}.webp`
  const { error } = await client.storage.from('traces').upload(path, blob, { contentType: 'image/webp', upsert: local })
  if (error) { console.warn('[preview] not uploaded:', error); return false }
  const url: string = client.storage.from('traces').getPublicUrl(path).data.publicUrl
  // The vault's file was rewritten in place: what it's read as, read again.
  if (local) await (await import('./localDb')).refreshLocalUrl(url)
  const { data: before } = await (client.from('lobbies') as any).select('preview_url').eq('id', lobbyId).maybeSingle()
  const at = new Date().toISOString()
  const { error: saved } = await (client.from('lobbies') as any).update({ preview_url: url, preview_at: at }).eq('id', lobbyId)
  // Not kept: the file goes too.
  if (saved) {
    console.warn('[preview] not kept:', saved)
    if (!local) void client.storage.from('traces').remove([path])
    return false
  }
  // The one it replaces, gone (its address, less any query an earlier
  // version gave it).
  const previous = !local && typeof before?.preview_url === 'string' ? before.preview_url.split('/object/public/traces/')[1]?.split('?')[0] : null
  if (previous && previous !== path) {
    void client.storage.from('traces').remove([decodeURIComponent(previous)]).then(({ error: kept }: { error: unknown }) => { if (kept) console.warn('[preview] old one not removed:', kept) })
  }
  rememberCard(useGameStore.getState().userId, lobbyId, { preview: url })
  window.dispatchEvent(new CustomEvent<PreviewDetail>('atrium:preview', { detail: { lobbyId, url, at } }))
  return true
}

// The room under the traces, as it was seen: its colour; its picture as
// placed, under a veil of the colour as strong as the picture is faint (as
// the scene's backdrop paints it); then the canvas's own layers.
async function roomPicture(room: RoomSnapshot): Promise<{ canvas: HTMLCanvasElement; missed: boolean }> {
  const k = Math.min(1, MAX_SIDE / Math.max(room.width, room.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(room.width * k))
  canvas.height = Math.max(1, Math.round(room.height * k))
  const ctx = canvas.getContext('2d')!
  ctx.scale(k, k)
  ctx.fillStyle = room.colour
  ctx.fillRect(0, 0, room.width, room.height)
  const placed = room.picture
  // The copy the scene has it from, with no asking; else from where it's kept.
  const picture = placed && (placed.file ? await pictureOf(placed.file) : await loadPicture(placed.url))
  if (placed && picture) {
    if (placed.repeat) {
      const tiles = ctx.createPattern(picture.source, 'repeat')
      tiles?.setTransform(new DOMMatrix([placed.w / picture.width, 0, 0, placed.h / picture.height, placed.x, placed.y]))
      ctx.fillStyle = tiles ?? room.colour
      ctx.fillRect(0, 0, room.width, room.height)
    } else {
      ctx.drawImage(picture.source, placed.x, placed.y, placed.w, placed.h)
    }
    ctx.globalAlpha = 1 - placed.opacity
    ctx.fillStyle = room.colour
    ctx.fillRect(0, 0, room.width, room.height)
    ctx.globalAlpha = 1
  }
  if (room.layer) ctx.drawImage(room.layer, 0, 0, room.width, room.height)
  return { canvas, missed: !!placed && !picture }
}
