// Frames: traces (type 'frame') that hold other traces, and carry them when
// they move.
//
// What a frame holds is written on each trace it holds (frameId), rather than
// read off where things happen to lie, so a frame dragged across other traces
// doesn't take them with it. A trace or a group joins a frame when it's put
// in one -- dropped in it, wrapped in it, or a frame made around it -- and
// leaves when it's taken out. It's in when all of it is: half in, half out, it
// isn't, and the frame doesn't carry it (the user's, 2026-11-06). A slot or a
// frame that arranges what's put in it sizes that to fit, so for those its
// middle is enough (frameFor). A group joins and leaves whole, by the box
// round all of it, so a frame never carries half a group away. Frames hold no
// frames.
//
// A deleted frame leaves its traces' frameId behind, pointing at nothing,
// which reads as no frame; undo brings the frame back holding what it held.

import type { Trace } from '../types/database'

export interface FrameBox {
  cx: number
  cy: number
  halfW: number
  halfH: number
}

export interface Framed {
  id: string
  type: string
  layerId?: string | null
  frameId?: string | null
}

export const isFrame = (trace: { type: string }) => trace.type === 'frame'

// A new frame over `box`, as every frame starts: titled `name`, outlined in
// the atrium's colours, no background, its id the database's to give. At
// `orderKey` -- the bottom of the stack, so what it holds is drawn over it.
export function newFrame(
  box: FrameBox, name: string, who: { userId: string; username: string },
  colours: { border: string; fill: string }, orderKey: string,
): Trace {
  return {
    id: '',
    userId: who.userId,
    username: who.username,
    type: 'frame',
    content: name,
    x: box.cx,
    y: box.cy,
    width: Math.round(box.halfW * 2),
    height: Math.round(box.halfH * 2),
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    createdAt: '',
    showBorder: true,
    showBackground: false,
    showShadow: false,
    showFilename: false,
    borderColor: colours.border,
    fillColor: colours.fill,
    borderWidth: 2,
    borderRadius: 8,
    orderKey,
  }
}

export const boxContains = (box: FrameBox, x: number, y: number) =>
  Math.abs(x - box.cx) <= box.halfW && Math.abs(y - box.cy) <= box.halfH

// A box inside another, all of it (with a hair's give, for what was put flush).
export const boxInside = (inner: FrameBox, outer: FrameBox) =>
  inner.cx - inner.halfW >= outer.cx - outer.halfW - 0.5 && inner.cx + inner.halfW <= outer.cx + outer.halfW + 0.5 &&
  inner.cy - inner.halfH >= outer.cy - outer.halfH - 0.5 && inner.cy + inner.halfH <= outer.cy + outer.halfH + 0.5

// A frame where something might be put: `arranged` when it sizes what's put in
// it (a slot, masonry).
export interface FramePlace { id: string; box: FrameBox; arranged?: boolean }

/** The frame something (its box) is in: the smallest that holds it -- all of
 *  it, for a frame; its middle, for an arranged one -- so a small frame lying on
 *  a big one takes what is put in it. */
export function frameFor(frames: FramePlace[], unit: FrameBox): string | null {
  let best: { id: string; area: number } | null = null
  for (const { id, box, arranged } of frames) {
    if (!(arranged ? boxContains(box, unit.cx, unit.cy) : boxInside(unit, box))) continue
    const area = box.halfW * box.halfH
    if (!best || area < best.area) best = { id, area }
  }
  return best?.id ?? null
}

// The frame a point is in: the smallest that holds it.
export function frameAt(frames: { id: string; box: FrameBox }[], x: number, y: number): string | null {
  let best: { id: string; area: number } | null = null
  for (const { id, box } of frames) {
    if (!boxContains(box, x, y)) continue
    const area = box.halfW * box.halfH
    if (!best || area < best.area) best = { id, area }
  }
  return best?.id ?? null
}

// The traces a frame holds, when it exists: frames in `frameIds`, among
// `traces`. For carrying them along in a drag.
export function heldBy<T extends Framed>(frameIds: Set<string>, traces: T[]): T[] {
  if (frameIds.size === 0) return []
  return traces.filter(t => !isFrame(t) && t.frameId != null && frameIds.has(t.frameId))
}

// These traces as what they are: a frame with what it holds, as copying or
// exporting a frame means all of it. In the order of `all`.
export function withHeld<T extends Framed>(chosen: T[], all: T[]): T[] {
  const picked = new Set(chosen.map(t => t.id))
  for (const t of heldBy(new Set(chosen.filter(isFrame).map(f => f.id)), all)) picked.add(t.id)
  return all.filter(t => picked.has(t.id))
}

// The frame a trace's copy belongs to (lib/traceCopy): its frame's copy, if
// that was copied too (`ids`, old to new); its original's, if it stays in its
// original's group, as a group is one unit; or the one it lands in.
export function frameOfCopy(
  trace: Framed, ids: Map<string, string>, keepsGroup: boolean,
  frames: FramePlace[], landed: FrameBox,
): string | null {
  if (isFrame(trace)) return null
  const copied = trace.frameId ? ids.get(trace.frameId) : undefined
  if (copied) return copied
  if (keepsGroup) return trace.frameId && frames.some(f => f.id === trace.frameId) ? trace.frameId : null
  return frameFor(frames, landed)
}

/** The groups (by id) a copy of `sources` makes anew (lib/traceCopy): one copied
 *  whole -- every trace of it, as Duplicate on a group or a template copies --
 *  or one a copied frame holds. Any other copy stays in its original's group. */
export function groupsCopiedWhole<T extends Framed>(sources: T[], traces: T[], groupIds: Set<string>): Set<string> {
  const ids = new Set(sources.map(t => t.id))
  const frames = new Set(sources.filter(isFrame).map(f => f.id))
  const out = new Set<string>()
  for (const t of sources) {
    if (!t.layerId || !groupIds.has(t.layerId) || out.has(t.layerId)) continue
    if ((t.frameId && frames.has(t.frameId)) || traces.every(o => o.layerId !== t.layerId || ids.has(o.id))) out.add(t.layerId)
  }
  return out
}

// The traces taken as one: every trace of a group together, or one trace on
// its own. Frames are never held, so they are no unit. `of` limits it to the
// units that have a trace among those ids; `groups` are the ids of the groups
// that exist (a trace naming one that doesn't is on its own).
export function unitsOf<T extends Framed>(traces: T[], groups: Set<string>, of?: Set<string>): T[][] {
  const byGroup = new Map<string, T[]>()
  const units: T[][] = []
  for (const t of traces) {
    if (isFrame(t)) continue
    if (t.layerId && groups.has(t.layerId)) {
      const unit = byGroup.get(t.layerId)
      if (unit) unit.push(t)
      else {
        const fresh = [t]
        byGroup.set(t.layerId, fresh)
        units.push(fresh)
      }
    } else {
      units.push([t])
    }
  }
  return of ? units.filter(unit => unit.some(t => of.has(t.id))) : units
}

// The box around all of a unit's traces.
export const unitBox = <T>(unit: T[], boxOf: (trace: T) => FrameBox): FrameBox => frameAround(unit.map(boxOf), 0)
// Its middle.
export function unitMiddle<T>(unit: T[], boxOf: (trace: T) => FrameBox): { x: number; y: number } {
  const box = unitBox(unit, boxOf)
  return { x: box.cx, y: box.cy }
}

// Where each of these units now belongs (frameFor: all of it in a frame, its
// middle in an arranged one) -- only the traces whose frame changes: trace id
// to frame id, or null for none. A frameId left pointing at a deleted frame is
// cleared here, once its trace has been placed somewhere else.
export function placeUnits<T extends Framed>(
  units: T[][],
  frames: FramePlace[],
  boxOf: (trace: T) => FrameBox,
): Map<string, string | null> {
  const changes = new Map<string, string | null>()
  for (const unit of units) {
    const frame = frameFor(frames, unitBox(unit, boxOf))
    for (const t of unit) if ((t.frameId ?? null) !== frame) changes.set(t.id, frame)
  }
  return changes
}

// Every unit put into one frame, whatever frame it was in: wrapping a
// selection. Only the traces whose frame changes.
export function putInFrame<T extends Framed>(units: T[][], frameId: string): Map<string, string | null> {
  const changes = new Map<string, string | null>()
  for (const unit of units) for (const t of unit) if (t.frameId !== frameId) changes.set(t.id, frameId)
  return changes
}

// A frame drawn around these boxes: their bounds, with room around them.
export function frameAround(boxes: FrameBox[], padding: number): FrameBox {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
  for (const b of boxes) {
    left = Math.min(left, b.cx - b.halfW)
    right = Math.max(right, b.cx + b.halfW)
    top = Math.min(top, b.cy - b.halfH)
    bottom = Math.max(bottom, b.cy + b.halfH)
  }
  return {
    cx: (left + right) / 2,
    cy: (top + bottom) / 2,
    halfW: (right - left) / 2 + padding,
    halfH: (bottom - top) / 2 + padding,
  }
}

// Old trace ids to new ones, for an atrium carried somewhere else (an import,
// an upload, a restore as a copy), made up front so a frame and what it holds
// can be written in any order; and a row's frame_id carried across by it.
export function freshIds(rows: { id?: string }[], fresh: () => string): Map<string, string> {
  return new Map(rows.filter(r => r.id).map(r => [r.id!, fresh()]))
}
export const carriedFrameId = (frameId: unknown, ids: Map<string, string>): string | null =>
  typeof frameId === 'string' ? ids.get(frameId) ?? null : null

// ---- Arranged frames (Trace.frameArrange 'masonry') -----------------------
//
// What an arranged frame holds, laid out Pinterest-style: columns of one
// width across it, as many as fit about ARRANGE_COLUMN wide; each unit -- a
// trace, or a group whole -- brought to the column's width at its own shape
// and put at the foot of the shortest column, in reading order (by its top,
// then its left). That's the order a laid-out frame reads back in, so
// arranging it again changes nothing, and a unit dragged somewhere else in it
// takes its turn from there. The frame keeps its left, top and width, and
// ends below its tallest column.
export const ARRANGE_GAP = 24
export const ARRANGE_COLUMN = 240

// A unit to lay out: its box, and the part of its half-size that doesn't
// scale with it (a trace's border).
export interface ArrangeUnit extends FrameBox { edge?: number }
export interface Placement { factor: number; cx: number; cy: number }

export function readingOrder<U extends FrameBox>(units: U[]): U[] {
  const key = (u: U) => [Math.round(u.cy - u.halfH), u.cx - u.halfW]
  return [...units].sort((a, b) => {
    const [at, al] = key(a), [bt, bl] = key(b)
    return at - bt || al - bl
  })
}

export function masonry(frame: FrameBox, units: ArrangeUnit[]): { frame: FrameBox; placed: Placement[] } {
  const left = frame.cx - frame.halfW, top = frame.cy - frame.halfH
  const inner = frame.halfW * 2 - ARRANGE_GAP * 2
  const columns = Math.max(1, Math.round((inner + ARRANGE_GAP) / (ARRANGE_COLUMN + ARRANGE_GAP)))
  const width = Math.max(1, (inner - (columns - 1) * ARRANGE_GAP) / columns)
  // Where each column's next unit starts.
  const feet: number[] = Array(columns).fill(top + ARRANGE_GAP)
  const placed = units.map(unit => {
    const edge = unit.edge ?? 0
    const factor = Math.max(0.01, (width - 2 * edge) / Math.max(1e-6, unit.halfW * 2 - 2 * edge))
    const height = (unit.halfH * 2 - 2 * edge) * factor + 2 * edge
    // The shortest, the leftmost of those as short.
    let column = 0
    for (let i = 1; i < columns; i++) if (feet[i] < feet[column] - 0.5) column = i
    const cx = left + ARRANGE_GAP + column * (width + ARRANGE_GAP) + width / 2
    const cy = feet[column] + height / 2
    feet[column] += height + ARRANGE_GAP
    return { factor, cx, cy }
  })
  if (units.length === 0) return { frame, placed }
  const bottom = Math.max(...feet)
  return { frame: { cx: frame.cx, halfW: frame.halfW, cy: (top + bottom) / 2, halfH: (bottom - top) / 2 }, placed }
}

// ---- Slots (Trace.frameArrange 'fill' | 'fit' | 'stretch') -----------------
// A template's frame for one thing (docs/IDEAS.md, "Making your own"): a trace or
// a group put in it takes its place and size -- covering it (a picture cropped to
// its shape), all of it inside it, or pulled to its shape.

export type SlotFit = 'fill' | 'fit' | 'stretch'
export const SLOT_FITS: SlotFit[] = ['fill', 'fit', 'stretch']
export const isSlot = (trace: { frameArrange?: string | null }) => (SLOT_FITS as (string | null | undefined)[]).includes(trace.frameArrange)
/** A frame that sizes what's put in it -- a slot, masonry -- so takes it by its middle (frameFor). */
export const isArranged = (trace: { frameArrange?: string | null }) => trace.frameArrange === 'masonry' || isSlot(trace)
/** Each fit's name and what it does, as the interface says them (translation keys). */
export const SLOT_FIT_WORDS = {
  fill: ['templates.slotFill', 'templates.slotFillHint'],
  fit: ['templates.slotFitWhole', 'templates.slotFitWholeHint'],
  stretch: ['templates.slotStretch', 'templates.slotStretchHint'],
} as const satisfies Record<SlotFit, readonly [string, string]>

/** How a slot is drawn -- on the canvas and in a picture of it alike: never with a
 *  title; empty, as the dashed place it is; holding something, as nothing at all,
 *  so what it holds is all that's seen. Any other trace as it is. */
export function slotLook<T extends Pick<Trace, 'frameArrange' | 'showBorder' | 'showBackground'>>(trace: T, filled: boolean): T {
  return isSlot(trace) && filled ? { ...trace, showBorder: false, showBackground: false } : trace
}

/** A trace leaving `slot`, without what the slot did to it: a picture whole
 *  again, if the slot filled it -- that crop was the slot's; its own shape again,
 *  if the slot stretched it, as big as fits where it was. What to change on it
 *  (nothing, mostly). */
export function outOfSlot(
  trace: Pick<Trace, 'type' | 'scaleX' | 'scaleY'>, slot: Pick<Trace, 'frameArrange'> | undefined,
): Partial<Pick<Trace, 'cropX' | 'cropY' | 'cropWidth' | 'cropHeight' | 'scaleX' | 'scaleY'>> {
  if (slot?.frameArrange === 'fill' && (trace.type === 'image' || trace.type === 'video')) return { cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1 }
  const sx = trace.scaleX ?? 1, sy = trace.scaleY ?? 1
  if (slot?.frameArrange === 'stretch' && Math.abs(sx - sy) > 1e-6) return { scaleX: Math.min(sx, sy), scaleY: Math.min(sx, sy) }
  return {}
}

/** What's in a slot but drawn under it (`ranks`, lib/order drawRanks): put there by
 *  hand in the Layer panel, so out of it, on its own again -- what's in a slot is
 *  always in front of it (the user's, 2026-11-06). */
export function underTheirSlots<T extends Framed & Pick<Trace, 'frameArrange'>>(traces: T[], ranks: Map<string, number>): T[] {
  const slots = new Set(traces.filter(isSlot).map(t => t.id))
  return traces.filter(t => !!t.frameId && slots.has(t.frameId) && (ranks.get(t.id) ?? 0) < (ranks.get(t.frameId) ?? 0))
}

/** Where what a slot holds goes: its middle on the slot's, scaled `fx` across and
 *  `fy` down -- the same both ways, to fit, unless `stretch`. `slot` is its inside;
 *  the held's `edge` (its border) stays as it is while the rest scales. */
export function slotPlacement(slot: FrameBox, held: FrameBox & { edge: number }, stretch: boolean): { cx: number; cy: number; fx: number; fy: number } {
  const fx = Math.max(0.5, slot.halfW - held.edge) / Math.max(0.5, held.halfW - held.edge)
  const fy = Math.max(0.5, slot.halfH - held.edge) / Math.max(0.5, held.halfH - held.edge)
  const f = Math.min(fx, fy)
  return { cx: slot.cx, cy: slot.cy, fx: stretch ? fx : f, fy: stretch ? fy : f }
}

/** A picture `aspect` wide to high, cropped about its middle to a slot `slotAspect`
 *  wide to high: the window kept, as shares of the whole (lib/traceCrop Crop). */
export function fillCrop(aspect: number, slotAspect: number): { x: number; y: number; w: number; h: number } {
  if (aspect > slotAspect) {
    const w = slotAspect / aspect
    return { x: (1 - w) / 2, y: 0, w, h: 1 }
  }
  const h = aspect / slotAspect
  return { x: 0, y: (1 - h) / 2, w: 1, h }
}
