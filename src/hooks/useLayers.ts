import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { liveTable, TRACES_RECEIVED_EVENT } from '../lib/liveChanges'
import { useGameStore } from '../store/gameStore'
import type { Layer } from '../types/database'
import type { TemplateValues } from '../lib/templateValues'
import { drawRanks, keysOnTop, topLevel } from '../lib/order'
import { outOfSlot, underTheirSlots } from '../lib/frames'

export function mapRowToLayer(row: any): Layer {
  return {
    id: row.id,
    createdAt: row.created_at,
    name: row.name,
    orderKey: row.order_key ?? null,
    isGroup: row.is_group,
    parentId: row.parent_id,
    template: row.template && Array.isArray(row.template.values) ? row.template : null,
    userId: row.user_id,
    lobbyId: row.lobby_id,
  }
}

// A group as the database keeps it: the columns a save writes, and the whole
// row it inserts when the group isn't there yet (lib/traceSave). Its template
// only when it has one -- or had and lost it, null -- so a database without
// the column still takes an ordinary group.
export function layerColumns(layer: Layer): Record<string, unknown> {
  return {
    name: layer.name,
    order_key: layer.orderKey ?? null,
    is_group: layer.isGroup,
    parent_id: layer.parentId ?? null,
    ...(layer.template !== undefined ? { template: layer.template ?? null } : {}),
  }
}
export const layerRow = (layer: Layer): Record<string, unknown> => ({
  id: layer.id,
  lobby_id: layer.lobbyId ?? null,
  user_id: layer.userId,
  ...(layer.createdAt ? { created_at: layer.createdAt } : {}),
  ...layerColumns(layer),
})

// Reads the atrium's groups again, keeping what's waiting here (setLayers):
// another person's change, through the live feed.
export async function reloadLayers(lobbyId: string) {
  if (!supabase) return
  const { data, error } = await (supabase.from('layers') as any).select('*').eq('lobby_id', lobbyId)
  if (!error && Array.isArray(data)) {
    useGameStore.getState().setLayers(data.map(mapRowToLayer))
  }
}

// Every change to a group here is made in the store and marked for the next
// Save (lib/traceSave), as a trace's is -- the user, 2026-11-11: written as
// they were made, they outlived Don't Save and leaving without saving. Undoable
// when run inside withLayerUndo, as their callers do.

// A group's new place in the stack.
export async function writeGroupKey(layer: Layer, orderKey: string, _lobbyId?: string) {
  const live = useGameStore.getState().layers.find(l => l.id === layer.id) ?? layer
  useGameStore.getState().putLayer({ ...live, orderKey })
  useGameStore.getState().markLayerChanged(layer.id)
}

// What a change of order left under its slot, out of it (lib/frames
// underTheirSlots): inside the same withLayerUndo as that change (layerDelta
// tracks frameId and the crop), so an undo puts it back in.
export async function letGoUnderSlots() {
  const { traces, layers } = useGameStore.getState()
  for (const trace of underTheirSlots(traces, drawRanks(traces, layers))) {
    const out = outOfSlot(trace, traces.find(t => t.id === trace.frameId))
    const now = useGameStore.getState().traces.find(t => t.id === trace.id) ?? trace
    useGameStore.getState().addTrace({ ...now, frameId: null, ...out })
    useGameStore.getState().markTraceChanged(trace.id)
    // What the canvas still draws for it from a drag gives way to this.
    window.dispatchEvent(new CustomEvent(TRACES_RECEIVED_EVENT, { detail: [trace.id] }))
  }
}

// A group's template values (lib/templateValues), changed.
// Not undone with its traces: a value undone away from them stays, used by none.
export async function writeGroupTemplate(layer: Layer, template: TemplateValues | null, _lobbyId?: string) {
  // Onto the group as it is now: an undo writes long after `layer` was read.
  const live = useGameStore.getState().layers.find(l => l.id === layer.id) ?? layer
  useGameStore.getState().putLayer({ ...live, template })
  useGameStore.getState().markLayerChanged(layer.id)
}

// A new group -- on top of everything, unless given its place in the stack.
// Two people doing this at the same moment may pick the same key; the tie is
// broken by id, the same way for everyone.
export async function createGroup(lobbyId: string, name: string, userId: string | null, orderKey?: string, template: TemplateValues | null = null): Promise<Layer> {
  const { traces, layers } = useGameStore.getState()
  const layer: Layer = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    name,
    orderKey: orderKey ?? keysOnTop(topLevel(traces, layers))[0],
    isGroup: true,
    parentId: null,
    template,
    userId: userId ?? '',
    lobbyId,
  }
  useGameStore.getState().putLayer(layer)
  useGameStore.getState().markLayerChanged(layer.id)
  return layer
}

// The atrium's groups: loaded with it and kept live, like its traces. Changes
// made here are in the store already; others' arrive through the live feed.
export function useLayers(lobbyId: string | null) {
  useEffect(() => {
    if (!supabase || !lobbyId) return
    const reload = () => { void reloadLayers(lobbyId) }
    reload()
    // Others' changes (lib/liveChanges): through the room, or Supabase's feed.
    const stopLive = liveTable(lobbyId, 'layers', () => {
      const channel = supabase
        .channel(`lobby-${lobbyId}-layers`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'layers', filter: `lobby_id=eq.${lobbyId}` }, reload)
        .subscribe()
      return () => { channel.unsubscribe() }
    }, reload)
    return () => { stopLive() }
  }, [lobbyId])
}
