import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { liveTable } from '../lib/liveChanges'
import { useGameStore } from '../store/gameStore'
import type { Layer } from '../types/database'
import type { TemplateValues } from '../lib/templateValues'
import { keysOnTop, topLevel } from '../lib/order'

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

// Reads the atrium's groups again. Changes made here put themselves in the
// store as they go; this is for everything else -- another person's change on
// the web, or anything that only announced itself (atrium:layers-changed).
export async function reloadLayers(lobbyId: string) {
  if (!supabase) return
  const { data, error } = await (supabase.from('layers') as any).select('*').eq('lobby_id', lobbyId)
  if (!error && Array.isArray(data)) {
    useGameStore.getState().setLayers(data.map(mapRowToLayer))
  }
}

// A group's new place in the stack: shown at once, then written. .select() so
// a refusal can't pass for success -- RLS doesn't raise on a forbidden UPDATE,
// the row just isn't matched -- and on one, the groups are read back as they
// are. Undoable when run inside withLayerUndo, as its callers do.
export async function writeGroupKey(layer: Layer, orderKey: string, lobbyId: string) {
  if (!supabase) return
  useGameStore.getState().putLayer({ ...layer, orderKey })
  const { data, error } = await (supabase.from('layers') as any)
    .update({ order_key: orderKey }).eq('id', layer.id).select('id')
  if (error || !Array.isArray(data) || data.length === 0) {
    console.error('Error moving group:', error ?? 'no row updated -- gone, or write access denied')
    await reloadLayers(lobbyId)
  }
}

// A group's template values (lib/templateValues), changed: as a group's place is.
// Not undone with its traces: a value undone away from them stays, used by none.
export async function writeGroupTemplate(layer: Layer, template: TemplateValues | null, lobbyId: string) {
  if (!supabase) return
  // Onto the group as it is now: an undo writes long after `layer` was read.
  const live = useGameStore.getState().layers.find(l => l.id === layer.id) ?? layer
  useGameStore.getState().putLayer({ ...live, template })
  const { data, error } = await (supabase.from('layers') as any)
    .update({ template }).eq('id', layer.id).select('id')
  if (error || !Array.isArray(data) || data.length === 0) {
    console.error('Error keeping the values:', error ?? 'no row updated -- gone, or write access denied')
    await reloadLayers(lobbyId)
  }
  window.dispatchEvent(new Event('atrium:layers-changed'))
}

// A new group -- on top of everything, unless given its place in the stack --
// put in the store and announced. Two people doing this at the same moment
// may pick the same key; the tie is broken by id, the same way for everyone.
export async function createGroup(lobbyId: string, name: string, userId: string | null, orderKey?: string, template: TemplateValues | null = null): Promise<Layer> {
  const { traces, layers } = useGameStore.getState()
  const { data, error } = await (supabase!.from('layers') as any)
    .insert({ name, order_key: orderKey ?? keysOnTop(topLevel(traces, layers))[0], is_group: true, user_id: userId, lobby_id: lobbyId, ...(template ? { template } : {}) })
    .select()
    .single()
  if (error || !data) throw new Error(error?.message || 'the group was not made')
  const layer = mapRowToLayer(data)
  useGameStore.getState().putLayer(layer)
  // Desktop has no realtime to tell anyone else.
  window.dispatchEvent(new Event('atrium:layers-changed'))
  return layer
}

// The atrium's groups: loaded with it and kept live, like its traces. On
// desktop the channel is the local shim's and never fires, so a change made
// outside the store says so with atrium:layers-changed.
export function useLayers(lobbyId: string | null) {
  useEffect(() => {
    if (!supabase || !lobbyId) return
    const reload = () => { void reloadLayers(lobbyId) }
    reload()
    window.addEventListener('atrium:layers-changed', reload)
    // Others' changes (lib/liveChanges): through the room, or Supabase's feed.
    const stopLive = liveTable(lobbyId, 'layers', () => {
      const channel = supabase
        .channel(`lobby-${lobbyId}-layers`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'layers', filter: `lobby_id=eq.${lobbyId}` }, reload)
        .subscribe()
      return () => { channel.unsubscribe() }
    }, reload)
    return () => {
      window.removeEventListener('atrium:layers-changed', reload)
      stopLive()
    }
  }, [lobbyId])
}
