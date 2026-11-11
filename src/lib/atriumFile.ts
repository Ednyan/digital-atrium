// The .atrium file (its format: lib/atriumFormat): an atrium, or some of its traces, as one file that opens
// again anywhere, as Excalidraw's .excalidraw does -- with its pictures,
// sounds and videos inside it rather than pointing at where they're kept.
// The envelope is the one the atrium download and the desktop's Export Atrium
// write (atriumEnvelope, version 3), so any of them reads as any other.
//
// Import Atrium (components/ImportAtrium) makes a new atrium of one;
// importIntoAtrium adds one's traces to the atrium that's open, where the
// view is, as one step of undo.

import { supabase, isDesktop, isLocalData } from './supabase'
import { useGameStore, LOBBY_SIZE_LIMIT } from '../store/gameStore'
import { mapRowToTrace } from '../hooks/useTraces'
import { createGroup } from '../hooks/useLayers'
import { newTraces } from './traceWrites'
import { atriumEnvelope } from './atriumDownload'
import { traceRow } from './traceInsert'
import { carryLinks, linkRow, mapRowToLink, type TraceLink } from './traceLinks'
import { locationRow } from './locations'
import { carriedFrameId } from './frames'
import { keysBetween, keysOnTop, topLevel } from './order'
import { fileOrderKeys, type AtriumFile } from './atriumFormat'
import { firstFreeName, placeholderNames } from './traceNames'
import { queueLayerChange } from './layerQueue'
import { adoptTraces, withLayerUndo } from './layerUndo'
import { uploadTraceFile } from './traceUpload'
import { fetchMedia } from './exportImage'
import { traceBox } from './traceGeometry'
import { isPathTrace, pathWorldBounds } from './pathBounds'
import { shiftPoints } from './pathGeometry'
import { t } from './i18n'
import type { Layer, LobbyLocation, Trace } from '../types/database'

// Names for a file's traces saved before they had them: its text traces
// numbered Text N (returned, as their layer names), its shapes and drawings
// under a placeholder renamed in place (lib/traceNames). `taken`: text names
// the destination already has.
export function nameFileTraces(file: AtriumFile, taken: string[] = []): Map<Record<string, any>, string> {
  const textNames = new Map<Record<string, any>, string>()
  const namesTaken = [...taken, ...file.traces.filter(tr => tr.type === 'text' && tr.layer_name).map(tr => tr.layer_name)]
  for (const tr of file.traces) {
    if (tr.type !== 'text' || tr.layer_name) continue
    const name = firstFreeName(namesTaken, n => t('atrium.layers.numberedText', { n }))
    namesTaken.push(name)
    textNames.set(tr, name)
  }
  const placeheld = placeholderNames(
    file.traces.map((tr, i) => ({ id: String(i), type: tr.type, shapeType: tr.shape_type, content: tr.content, layerId: tr._local_layer_id ?? null, mediaUrl: tr.media_url, strokeData: tr.stroke_data })),
    file.layers.map(l => l.name),
    {
      shape: n => t('atrium.layers.numberedShape', { n }),
      path: n => t('atrium.layers.numberedPath', { n }),
      stroke: n => t('atrium.layers.numberedStroke', { n }),
      drawing: n => t('atrium.layers.numberedDrawing', { n }),
    },
  )
  file.traces.forEach((tr, i) => { const name = placeheld.get(String(i)); if (name) tr.content = name })
  return textNames
}

export const readAsDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = () => reject(reader.error)
  reader.readAsDataURL(blob)
})

// An .atrium file of these traces -- with the groups they're in, the
// connections between them, and the locations given -- their files inside
// it. A file that can't be read (another site's picture that won't share it)
// is left as its address.
export async function atriumFileBlob(
  scope: { traces: Trace[]; links: TraceLink[]; layers: Layer[]; locations: LobbyLocation[] },
  lobby: { name: string; themeSettings: unknown; isPublic: boolean; maxPlayers: number },
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const ids = new Set(scope.traces.map(tr => tr.id))
  const rows: Record<string, any>[] = scope.traces.map(trace => ({ ...traceRow(trace), layer_id: trace.layerId ?? null }))
  const withFiles = rows.filter(row => [row.media_url, row.image_url].some(u => typeof u === 'string' && u && !u.startsWith('data:')))
  let done = 0
  for (const row of withFiles) {
    for (const key of ['media_url', 'image_url'] as const) {
      const url = row[key]
      // Embeds are addresses, not files.
      if (typeof url !== 'string' || !url || url.startsWith('data:') || row.type === 'embed') continue
      const blob = await fetchMedia(url)
      if (blob) row[key] = await readAsDataUrl(blob)
    }
    onProgress?.(++done, withFiles.length)
  }
  const used = new Set(scope.traces.map(tr => tr.layerId).filter(Boolean))
  const layers = scope.layers.filter(l => used.has(l.id)).map(l => ({ id: l.id, name: l.name, order_key: l.orderKey ?? null, is_group: l.isGroup, parent_id: l.parentId ?? null, ...(l.template ? { template: l.template } : {}) }))
  const links = scope.links.filter(l => ids.has(l.from) && ids.has(l.to)).map(linkRow)
  const envelope = atriumEnvelope(
    isDesktop ? 'Digital Atrium Desktop' : 'Digital Atrium Web',
    { name: lobby.name, theme_settings: lobby.themeSettings ?? null, is_public: lobby.isPublic, max_players: lobby.maxPlayers },
    layers,
    scope.locations.map(locationRow),
    rows,
    links,
  )
  return new Blob([JSON.stringify(envelope)], { type: ATRIUM_FILE_TYPE })
}

// The bytes a data URL holds, near enough.
const dataUrlBytes = (url: unknown) => (typeof url === 'string' && url.startsWith('data:') ? Math.floor((url.length - url.indexOf(',') - 1) * 0.75) : 0)

export class ImportTooLargeError extends Error {
  needed: number
  free: number
  constructor(needed: number, free: number) {
    super('too large')
    this.needed = needed
    this.free = free
  }
}

export interface ImportIntoResult { added: number; missing: number; failed: number; standIns?: number }

// The kinds of trace this app draws. One of another kind -- from a newer
// version -- can't be had here, nor can one a database turns away.
const KNOWN_TYPES: readonly Trace['type'][] = ['text', 'image', 'audio', 'video', 'embed', 'shape', 'document', 'frame', 'sheet', 'chart']
export const isKnownTraceType = (type: unknown): boolean => (KNOWN_TYPES as readonly unknown[]).includes(type)

// Force import (the import's option, remembered here): what can't be had
// comes in anyway as a stand-in -- a picture in its place, at its size and in
// its group, whose address names what it was, shown as the glitch error saying
// so (TraceOverlay). A picture, since any database takes one: the trace's own
// kind is what was refused.
export const UNSUPPORTED = 'unsupported:'
const FORCE_KEY = 'atrium.import.force'
export const forceImport = (): boolean => { try { return localStorage.getItem(FORCE_KEY) === 'true' } catch { return false } }
export const setForceImport = (on: boolean) => { try { localStorage.setItem(FORCE_KEY, String(on)) } catch { /* for this visit, then */ } }
export function standInRow(row: Record<string, any>): Record<string, any> {
  return {
    ...row,
    type: 'image',
    media_url: `${UNSUPPORTED}${String(row.type ?? 'trace')}`,
    image_url: null,
    shape_type: null,
    shape_points: null,
    stroke_data: null,
    width: row.width || 300,
    height: row.height || 200,
  }
}

// A file the desktop made, brought onto the web: its layout comes, its
// pictures and files stay behind for now -- the web atrium's storage is small
// and a desktop vault's needn't be. (Uploading from the desktop to the web has
// always worked this way.) Read from the file's own app name.
export const mediaStaysBehind = (file: Pick<AtriumFile, 'app'>, local = isLocalData) => !local && /desktop/i.test(file.app ?? '')

// What an .atrium file is, to a browser: its own type, so none of them adds
// .json to its name on the way down (it's JSON inside, but an .atrium file).
export const ATRIUM_FILE_TYPE = 'application/vnd.digital-atrium+json'

// A file's traces added to the atrium that's open: as its own groups and
// connections, centred on `at`, on top of everything, as one step of undo
// (lib/layerUndo) -- Ctrl+Z takes the whole import back. Its pictures and
// sounds are saved here as any new file is. Its locations, theme and name
// stay with it: they're the atrium's, not the traces'. How far it's got goes
// to `onProgress`: each file saved and each trace written is one of `total`.
// Its traces are put on the canvas together, once all are written, so it
// arrives as the one action it is.
// Said on window once an import's step is taken, with its traces' ids: the
// canvas lets what landed on a slot or an arranged frame join it (TraceOverlay),
// as it does for a trace dropped there -- after the step, so that's its own.
export const TRACES_PLACED_EVENT = 'atrium:traces-placed'

export function importIntoAtrium(file: AtriumFile, at: { x: number; y: number }, lobbyId: string, userId: string, onProgress?: (done: number, total: number) => void): Promise<ImportIntoResult> {
  const behind = mediaStaysBehind(file)
  // Room for it, on the web, where an atrium has a size.
  if (!isLocalData && !behind) {
    const needed = file.traces.reduce((sum, tr) => sum + dataUrlBytes(tr.media_url) + dataUrlBytes(tr.image_url), 0)
    const free = Math.max(0, LOBBY_SIZE_LIMIT - useGameStore.getState().getLobbySizeBytes())
    if (needed > free) return Promise.reject(new ImportTooLargeError(needed, free))
  }
  // What the import makes, by id: its one step of undo is these alone, so
  // the atrium can be used while it runs (lib/layerUndo).
  const own = { traces: new Set<string>(), layers: new Set<string>(), links: new Set<string>() }
  return queueLayerChange(() => withLayerUndo('import', async () => {
    if (!supabase) return { added: 0, missing: 0, failed: 0 }
    const store = useGameStore.getState()
    const { traceKeyOf, layerKeyOf } = fileOrderKeys(file)
    const textNames = nameFileTraces(file, store.traces.filter(tr => tr.type === 'text').map(tr => tr.layerName ?? ''))

    // The file's traces, as this atrium would have them -- those of a kind it
    // can't have left out, or, forced, as stand-ins.
    const now = new Date().toISOString()
    const force = forceImport()
    let standIns = 0
    const known = file.traces.flatMap(row => isKnownTraceType(row.type) ? [row] : force ? [(standIns++, standInRow(row))] : [])
    const parsed = known.map(row => ({ row, trace: mapRowToTrace({ ...row, id: row.id ?? crypto.randomUUID(), lobby_id: lobbyId, user_id: userId, created_at: now }) }))
    if (parsed.length === 0) return { added: 0, missing: 0, failed: file.traces.length }
    const uploads = behind ? 0 : parsed.reduce((n, { trace }) => n + [trace.mediaUrl, trace.imageUrl].filter(url => typeof url === 'string' && url.startsWith('data:')).length, 0)
    const total = uploads + parsed.length
    let done = 0
    onProgress?.(done, total)

    // Moved so their middle is where the view is.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const { trace } of parsed) {
      const box = isPathTrace(trace) ? pathWorldBounds(trace.shapePoints, trace.shapeOutlineWidth ?? 2) : null
      if (box) {
        minX = Math.min(minX, box.minX); maxX = Math.max(maxX, box.maxX); minY = Math.min(minY, box.minY); maxY = Math.max(maxY, box.maxY)
      } else {
        const b = traceBox(trace)
        minX = Math.min(minX, b.cx - b.halfW); maxX = Math.max(maxX, b.cx + b.halfW); minY = Math.min(minY, b.cy - b.halfH); maxY = Math.max(maxY, b.cy + b.halfH)
      }
    }
    const dx = at.x - (minX + maxX) / 2, dy = at.y - (minY + maxY) / 2

    // Its groups, each a new one here, and its loose traces: on top of
    // everything, in the file's order among themselves.
    const groupsUsed = new Set(file.traces.map(tr => tr._local_layer_id).filter(Boolean))
    const groups = file.layers.filter(l => groupsUsed.has(l._local_id))
    const loose = parsed.filter(({ row }) => !row._local_layer_id || !groupsUsed.has(row._local_layer_id))
    const top: ({ group: AtriumFile['layers'][number] } | { piece: typeof parsed[number] })[] = [
      ...groups.map(group => ({ group })),
      ...loose.map(piece => ({ piece })),
    ]
    const keyOfTop = (item: typeof top[number]) => ('group' in item ? layerKeyOf.get(item.group) : traceKeyOf.get(item.piece.row)) ?? ''
    top.sort((a, b) => (keyOfTop(a) < keyOfTop(b) ? -1 : keyOfTop(a) > keyOfTop(b) ? 1 : 0))
    const topKeys = keysOnTop(topLevel(store.traces, store.layers), top.length)
    const groupIds = new Map<string, string>()
    const newKey = new Map<Record<string, any>, string>()
    for (const [i, item] of top.entries()) {
      if ('group' in item) {
        const made = await createGroup(lobbyId, item.group.name, userId, topKeys[i], item.group.template ?? null)
        own.layers.add(made.id)
        groupIds.set(item.group._local_id, made.id)
        const inside = parsed.filter(({ row }) => row._local_layer_id === item.group._local_id)
          .sort((a, b) => ((traceKeyOf.get(a.row) ?? '') < (traceKeyOf.get(b.row) ?? '') ? -1 : 1))
        keysBetween(null, null, inside.length).forEach((key, j) => newKey.set(inside[j].row, key))
      } else {
        newKey.set(item.piece.row, topKeys[i])
      }
    }

    // New ids up front, so a frame and what it holds point at each other
    // whatever order they go in (lib/frames).
    const ids = new Map<string, string>()
    for (const { row } of parsed) if (row.id) ids.set(row.id, crypto.randomUUID())

    let missing = 0
    const rows: Record<string, any>[] = []
    for (const { row, trace } of parsed) {
      const placed: Trace = {
        ...trace,
        id: (row.id && ids.get(row.id)) || crypto.randomUUID(),
        lobbyId,
        userId,
        layerId: row._local_layer_id ? groupIds.get(row._local_layer_id) ?? null : null,
        frameId: carriedFrameId(row.frame_id, ids),
        orderKey: newKey.get(row) ?? null,
        layerName: trace.type === 'text' ? (trace.layerName ?? textNames.get(row) ?? null) : trace.layerName,
        x: trace.x + dx,
        y: trace.y + dy,
        shapePoints: trace.shapePoints && shiftPoints(trace.shapePoints, dx, dy),
      }
      // Its files saved here, as a file dropped here would be; one left in
      // the vault it came from can't come with it, and is said so.
      for (const key of ['mediaUrl', 'imageUrl'] as const) {
        const url = placed[key]
        if (typeof url !== 'string' || !url) continue
        if (url.startsWith('local://') || (behind && url.startsWith('data:'))) {
          placed[key] = undefined
          missing++
        } else if (url.startsWith('data:')) {
          try {
            const blob = await (await fetch(url)).blob()
            const ext = blob.type.split('/')[1]?.split(/[;+]/)[0] || 'bin'
            placed[key] = await uploadTraceFile(new File([blob], `import.${ext}`, { type: blob.type }), lobbyId, userId)
          } catch {
            placed[key] = undefined
            missing++
          }
          onProgress?.(++done, total)
        }
      }
      rows.push(traceRow(placed))
    }

    // On the canvas all at once, written with the next Save (lib/traceWrites), as
    // every change is -- the user, 2026-11-11: written as it was placed, a
    // template outlived Don't Save. A kind this atrium can't have is a stand-in
    // already (above), if forced.
    for (const row of rows) own.traces.add(row.id)
    adoptTraces(own.traces)
    newTraces(rows)
    done += rows.length
    onProgress?.(done, total)
    const added = rows.length

    // Threads: written with the same Save, after their traces.
    for (const row of carryLinks(file.links, ids)) {
      const link = mapRowToLink({ ...row, lobby_id: lobbyId, id: crypto.randomUUID() })
      own.links.add(link.id)
      useGameStore.getState().putLink(link)
    }
    return { added, missing, failed: file.traces.length - known.length, standIns }
  }, () => own)).then(result => {
    window.dispatchEvent(new CustomEvent(TRACES_PLACED_EVENT, { detail: [...own.traces] }))
    return result
  })
}
