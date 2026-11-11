// What a layer change did, as the difference between the atrium before and
// after it: groups made, removed or changed (name, place, parent); traces
// added or removed whole, or changed in the fields layer changes touch; and
// connections that went or came with them. Undoing the change applies it
// backwards, redoing it forwards (lib/layerUndo) -- only what this change
// touched, so nothing done before or since is disturbed.
//
// Kept free of the app -- the database and the store are handed in -- so it
// can be tested.

import type { Layer, Trace } from '../types/database'
import type { TraceLink } from './traceLinks.ts'

export interface LayerSnapshot {
  traces: Trace[]
  links: TraceLink[]
  layers: Layer[]
}

// The fields of a trace a layer change writes: where it is in the layers
// (its group and place), its name there, and what the Layer panel toggles --
// and the slot it's in, with the crop and stretch that slot gave it: put under its slot,
// it's out of it (LayerPanel), and an undo puts it back in.
export const TRACKED_TRACE_FIELDS = ['layerId', 'orderKey', 'layerName', 'content', 'isLocked', 'ignoreClicks', 'enableInteraction', 'frameId', 'cropX', 'cropY', 'cropWidth', 'cropHeight', 'scaleX', 'scaleY'] as const
export type TrackedField = typeof TRACKED_TRACE_FIELDS[number]
export type TrackedValues = Partial<Pick<Trace, TrackedField>>

export const TRACKED_LAYER_FIELDS = ['name', 'orderKey', 'parentId'] as const
export type LayerValues = Partial<Pick<Layer, typeof TRACKED_LAYER_FIELDS[number]>>

export interface LayerDelta {
  layersAdded: Layer[]
  layersRemoved: Layer[]
  layersChanged: { id: string; before: LayerValues; after: LayerValues }[]
  tracesAdded: Trace[]
  tracesRemoved: Trace[]
  tracesChanged: { id: string; before: TrackedValues; after: TrackedValues }[]
  linksAdded: TraceLink[]
  linksRemoved: TraceLink[]
}

// A missing value and a null one are the same place: no group, no key.
const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null)

function changes<T extends object, K extends keyof T>(before: T, after: T, fields: readonly K[]) {
  const was: Partial<T> = {}, now: Partial<T> = {}
  let any = false
  for (const field of fields) {
    if (same(before[field], after[field])) continue
    was[field] = before[field] ?? (null as any)
    now[field] = after[field] ?? (null as any)
    any = true
  }
  return any ? { before: was, after: now } : null
}

export function layerDelta(before: LayerSnapshot, after: LayerSnapshot): LayerDelta {
  const byId = <T extends { id: string }>(list: T[]) => new Map(list.map(item => [item.id, item]))
  const layersBefore = byId(before.layers), layersAfter = byId(after.layers)
  const tracesBefore = byId(before.traces), tracesAfter = byId(after.traces)
  const linksBefore = byId(before.links), linksAfter = byId(after.links)

  const delta: LayerDelta = {
    layersAdded: after.layers.filter(l => !layersBefore.has(l.id)),
    layersRemoved: before.layers.filter(l => !layersAfter.has(l.id)),
    layersChanged: [],
    tracesAdded: after.traces.filter(t => !tracesBefore.has(t.id)),
    tracesRemoved: before.traces.filter(t => !tracesAfter.has(t.id)),
    tracesChanged: [],
    linksAdded: after.links.filter(l => !linksBefore.has(l.id)),
    linksRemoved: before.links.filter(l => !linksAfter.has(l.id)),
  }
  for (const layer of after.layers) {
    const was = layersBefore.get(layer.id)
    const change = was && was !== layer ? changes(was, layer, TRACKED_LAYER_FIELDS) : null
    if (change) delta.layersChanged.push({ id: layer.id, ...change })
  }
  for (const trace of after.traces) {
    const was = tracesBefore.get(trace.id)
    const change = was && was !== trace ? changes(was, trace, TRACKED_TRACE_FIELDS) : null
    if (change) delta.tracesChanged.push({ id: trace.id, ...change })
  }
  return delta
}

export const deltaIsEmpty = (d: LayerDelta) =>
  !d.layersAdded.length && !d.layersRemoved.length && !d.layersChanged.length &&
  !d.tracesAdded.length && !d.tracesRemoved.length && !d.tracesChanged.length &&
  !d.linksAdded.length && !d.linksRemoved.length

// The same change the other way: undoing it is doing this.
export function reverseDelta(d: LayerDelta): LayerDelta {
  return {
    layersAdded: d.layersRemoved,
    layersRemoved: d.layersAdded,
    layersChanged: d.layersChanged.map(c => ({ id: c.id, before: c.after, after: c.before })),
    tracesAdded: d.tracesRemoved,
    tracesRemoved: d.tracesAdded,
    tracesChanged: d.tracesChanged.map(c => ({ id: c.id, before: c.after, after: c.before })),
    linksAdded: d.linksRemoved,
    linksRemoved: d.linksAdded,
  }
}

// What a delta is applied to: the store, every change in it marked to be
// written with the next Save (lib/traceSave) -- group changes wait for Save as
// trace changes do (the user, 2026-11-11) -- and a note of each trace it brings
// in (lib/layerUndo).
export interface LayerDeltaTarget {
  store: () => {
    layers: Layer[]
    traces: Trace[]
    putLayer(layer: Layer): void
    forgetLayer(id: string): void
    markLayerChanged(id: string): void
    markLayerDeleted(id: string): void
    addTrace(trace: Trace): void
    removeTrace(id: string): void
    markTraceChanged(id: string): void
    markTraceDeleted(id: string): void
    unmarkTraceDeleted(id: string): void
    putLink(link: TraceLink): void
    dropLink(id: string): void
  }
  adopt(traceId: string): void
}

// Makes the store what `delta` leads to, in the order the save will write it:
// groups come back before the traces that go into them and go after the traces
// leave them; connections go before their traces and come back after both their ends.
export async function applyLayerDelta(delta: LayerDelta, to: LayerDeltaTarget): Promise<void> {
  const { store } = to
  for (const layer of delta.layersAdded) {
    store().putLayer(layer)
    store().markLayerChanged(layer.id)
  }
  for (const change of delta.layersChanged) {
    const now = store().layers.find(l => l.id === change.id)
    if (!now) continue
    store().putLayer({ ...now, ...change.after })
    store().markLayerChanged(change.id)
  }
  for (const trace of delta.tracesAdded) {
    to.adopt(trace.id)
    store().addTrace(trace)
    store().unmarkTraceDeleted(trace.id)
    store().markTraceChanged(trace.id)
  }
  for (const change of delta.tracesChanged) {
    const now = store().traces.find(t => t.id === change.id)
    if (!now) continue
    store().addTrace({ ...now, ...change.after })
    store().markTraceChanged(change.id)
  }
  for (const link of delta.linksRemoved) store().dropLink(link.id)
  for (const trace of delta.tracesRemoved) {
    store().removeTrace(trace.id)
    store().markTraceDeleted(trace.id)
  }
  for (const link of delta.linksAdded) store().putLink(link)
  for (const layer of delta.layersRemoved) {
    store().forgetLayer(layer.id)
    store().markLayerDeleted(layer.id)
  }
}
