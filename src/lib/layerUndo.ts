// Layer changes, undoable.
//
// A layer change -- a group made, renamed, moved or removed, traces moved
// between groups or reordered or locked from the Layer panel, a group deleted
// with its traces -- is made in the store and written with the next Save, as
// every change is (lib/traceSave; the user, 2026-11-11: it used to be written
// as it was made, so Don't Save and leaving without saving left it). Its undo
// is a change in the store too. withLayerUndo runs
// a change and records what it did (lib/layerDelta) as one step in the
// atrium's history (lib/actionHistory); undo and redo apply that difference
// backwards and forwards, through the layer queue like any layer change.

import { useGameStore } from '../store/gameStore'
import { recordAction } from './actionHistory'
import { queueLayerChange } from './layerQueue'
import { applyLayerDelta as applyDelta, deltaIsEmpty, layerDelta, reverseDelta, type LayerDelta, type LayerSnapshot } from './layerDelta'

export function snapshotLayers(): LayerSnapshot {
  const { traces, links, layers } = useGameStore.getState()
  return { traces, links, layers }
}

// Traces that arrive in the store by a layer change or its undo rather than
// by being made -- a duplicated group, a deleted one brought back. TraceOverlay
// records every trace it sees appear as an addition of its own; these it
// takes as known instead, since their step is the layer change's.
const adopted = new Set<string>()
let applying = 0
export const layerChangeAdopts = (id: string) => adopted.delete(id) || applying > 0
// The same for any other change that records its own step (a drawing's
// strokes, LobbyScene): these traces are about to arrive by it. And for
// traces that were never this user's to undo: an atrium's as it loads, and
// others' new ones arriving over realtime (hooks/useTraces).
export const adoptTraces = (ids: Iterable<string>) => { for (const id of ids) adopted.add(id) }

// Makes the store what `delta` leads to, marked for Save (lib/layerDelta).
export async function applyLayerDelta(delta: LayerDelta): Promise<void> {
  applying++
  try {
    await applyDelta(delta, { store: () => useGameStore.getState(), adopt: id => adopted.add(id) })
  } finally {
    applying--
  }
  // Desktop has no realtime to tell the Layer panel.
}

// What a change made, by id, when it says (an import): its step is those
// alone, whatever else happened in the atrium while it ran.
export interface OwnIds { traces: Set<string>; layers: Set<string>; links: Set<string> }

// Only what belongs to `own`.
function ownPart(d: LayerDelta, own: OwnIds): LayerDelta {
  const t = (x: { id: string }) => own.traces.has(x.id), l = (x: { id: string }) => own.layers.has(x.id), k = (x: { id: string }) => own.links.has(x.id)
  return {
    layersAdded: d.layersAdded.filter(l), layersRemoved: d.layersRemoved.filter(l), layersChanged: d.layersChanged.filter(l),
    tracesAdded: d.tracesAdded.filter(t), tracesRemoved: d.tracesRemoved.filter(t), tracesChanged: d.tracesChanged.filter(t),
    linksAdded: d.linksAdded.filter(k), linksRemoved: d.linksRemoved.filter(k),
  }
}

// Runs a layer change and records it, as one step, if it changed anything.
// Called inside the layer queue, as the change itself would be.
//
// A change that runs long while the atrium stays in use (an import) says what
// it made (`own`): then its step is that alone, and a trace someone adds or a
// group they rename meanwhile is theirs, with its own undo -- the before/after
// difference would otherwise take it in. Its traces it adopts itself
// (adoptTraces) rather than every trace that appears while it runs.
export async function withLayerUndo<T>(label: string, change: () => Promise<T>, own?: () => OwnIds): Promise<T> {
  const before = snapshotLayers()
  if (!own) applying++
  let result: T
  try {
    result = await change()
  } finally {
    if (!own) applying--
  }
  const whole = layerDelta(before, snapshotLayers())
  const delta = own ? ownPart(whole, own()) : whole
  // Traces this change made are its own, not additions to record apart.
  for (const trace of delta.tracesAdded) adopted.add(trace.id)
  if (!deltaIsEmpty(delta)) {
    const back = reverseDelta(delta)
    recordAction({
      label,
      undo: () => queueLayerChange(() => applyLayerDelta(back)),
      redo: () => queueLayerChange(() => applyLayerDelta(delta)),
    })
  }
  return result
}
