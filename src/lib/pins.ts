// Pins from Pinterest (docs/PINTEREST.md): what one is, and Pinterest's rules for
// showing one -- its picture as Pinterest delivers it, resized only (no crop, no
// flip, no colour change, no rounded corners), and its mark always there. Free of
// the app, so the store and the look can apply them, and tests can.

import type { PinSource, Trace } from '../types/database'

// An embed, as the import makes them -- never one's own picture given a pin's link,
// whose file is its own (a row's type said where it's known).
export const isPin = (trace: Pick<Trace, 'linkUrl'> & { type?: string }) =>
  !!trace.linkUrl && /^https:\/\/www\.pinterest\.com\/pin\//.test(trace.linkUrl) && (trace.type === undefined || trace.type === 'embed')

// What a pin can't have: each setting that would change its picture, as it is with none.
const AS_DELIVERED = { cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1, flipHorizontal: false, flipVertical: false, look: undefined, borderRadius: 0 } as const
const differs = (trace: Partial<Trace>) =>
  (Object.keys(AS_DELIVERED) as (keyof typeof AS_DELIVERED)[]).some(key => trace[key] !== undefined && trace[key] !== AS_DELIVERED[key])

/** A trace as it may be shown: a pin with nothing changing its picture (the same
 *  object where nothing does, so what's kept as it was isn't drawn again). */
export function asDelivered<T extends Partial<Trace>>(trace: T): T {
  return isPin(trace) && differs(trace) ? { ...trace, ...AS_DELIVERED } : trace
}

/** The Pinterest mark's box on a pin `width` x `height` on screen: always there, its
 *  full size on a pin big enough, smaller on a small one, never gone. */
export function pinMarkSize(width: number, height: number) {
  const size = Math.round(Math.max(12, Math.min(24, Math.min(width, height) * 0.35)))
  const inset = Math.round(Math.min(8, size / 3))
  return { width: size, height: size, left: inset, bottom: inset }
}

// Pinterest's mark, on a 24 x 24 box (PinterestMark, and a pin's card in an export).
export const PINTEREST_MARK = 'M12 2a10 10 0 0 0-3.65 19.31c-.09-.78-.17-1.98.03-2.83.19-.79 1.2-5.02 1.2-5.02s-.3-.61-.3-1.51c0-1.42.82-2.48 1.85-2.48.87 0 1.29.66 1.29 1.44 0 .88-.56 2.19-.85 3.41-.24 1.02.51 1.85 1.52 1.85 1.83 0 3.23-1.93 3.23-4.71 0-2.46-1.77-4.18-4.29-4.18-2.92 0-4.64 2.19-4.64 4.46 0 .88.34 1.83.76 2.35.08.1.1.19.07.29-.08.32-.25.98-.28 1.12-.05.19-.15.23-.35.14-1.28-.6-2.08-2.46-2.08-3.96 0-3.22 2.34-6.18 6.75-6.18 3.54 0 6.3 2.52 6.3 5.9 0 3.52-2.22 6.35-5.3 6.35-1.03 0-2.01-.54-2.34-1.18l-.64 2.43c-.23.89-.85 2-1.27 2.68A10 10 0 1 0 12 2z'

/** A pin's id on Pinterest, from its link: what's kept of it. */
export const pinIdOf = (trace: Pick<Trace, 'linkUrl'>) => /^https:\/\/www\.pinterest\.com\/pin\/(\d+)/.exec(trace.linkUrl ?? '')?.[1] ?? null
export const pinLink = (id: string) => `https://www.pinterest.com/pin/${id}/`

/** A stored pin_source, read: none where it isn't one. */
export function asPinSource(value: unknown): PinSource | undefined {
  const source = typeof value === 'string' ? (() => { try { return JSON.parse(value) } catch { return null } })() : value
  if (!source || typeof source !== 'object' || typeof (source as PinSource).by !== 'string') return undefined
  const board = (source as PinSource).board
  return { board: typeof board === 'string' && board ? board : null, by: (source as PinSource).by }
}

/** A trace's row as it may be kept: a pin's picture and preview dropped -- for
 *  rows copied whole (an .atrium file, an atrium moved online). */
export function keptRow<T extends Record<string, any>>(row: T): T {
  return isPin({ linkUrl: row.link_url, type: row.type }) && (row.media_url || row.image_url) ? { ...row, media_url: null, image_url: null } : row
}
