// The template editor (docs/IDEAS.md, "Making your own"): an atrium of its own in
// this browser's vault, as the tutorial's is (lib/tutorial), made when a template is
// begun and gone once it's saved or let go. What it's making -- its name, its values,
// the atrium it was begun from -- is kept here beside it, one at a time.

import { useEffect, useState } from 'react'
import type { TemplateValue } from './templateValues'
import type { AtriumFile } from './atriumFormat'
import { isDesktop, supabase } from './supabase'

// The most traces a template holds: Save refuses more (TemplateWorkshop).
export const TEMPLATE_TRACES = 50

// `editing`: the template of one's own being changed (lib/myTemplates), which Save
// replaces; its traces are put in once (`loaded`) as the editor opens (LobbyScene).
export interface Workshop { lobbyId: string; name: string; values: TemplateValue[]; from: string | null; editing: string | null; loaded: boolean }

const KEY = 'atrium.workshop'
const CHANGED = 'atrium:workshop'

function read(): Workshop | null {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return kept && typeof kept.lobbyId === 'string' ? { name: '', values: [], from: null, editing: null, loaded: true, ...kept } : null
  } catch { return null }
}
function write(workshop: Workshop | null) {
  try {
    if (workshop) localStorage.setItem(KEY, JSON.stringify(workshop))
    else localStorage.removeItem(KEY)
  } catch { /* for this visit, then */ }
  window.dispatchEvent(new Event(CHANGED))
}

export const workshopOf = (lobbyId: string) => { const kept = read(); return kept?.lobbyId === lobbyId ? kept : null }
export const isWorkshop = (lobbyId: string) => read()?.lobbyId === lobbyId
// One begun and left some other way than Save or Cancel -- a closed tab -- to be let go.
export const workshopLeft = () => read()?.lobbyId ?? null

// Into the editor and back out to the atrium it was begun from: at once, without
// the atrium's crossing (App). Asked for as it's left, for a moment.
let quiet: { lobbyId: string; until: number } | null = null
export const enterQuietly = (lobbyId: string) => { quiet = { lobbyId, until: Date.now() + 10_000 } }
export const quietEntry = (lobbyId: string) => isWorkshop(lobbyId) || (quiet?.lobbyId === lobbyId && Date.now() < quiet.until)

/** The workshop's name or values changed, or what it's editing put in. */
export function keepWorkshop(change: Partial<Pick<Workshop, 'name' | 'values' | 'loaded'>>) {
  const kept = read()
  if (kept) write({ ...kept, ...change })
}

/** This atrium's workshop, kept up to date: null for any other atrium. */
export function useWorkshop(lobbyId: string): Workshop | null {
  const [workshop, setWorkshop] = useState(() => workshopOf(lobbyId))
  useEffect(() => {
    const changed = () => setWorkshop(workshopOf(lobbyId))
    changed()
    window.addEventListener(CHANGED, changed)
    return () => window.removeEventListener(CHANGED, changed)
  }, [lobbyId])
  return workshop
}

/** A template saved, as the editor has it: its traces and groups out of the
 *  template's own group (saveTemplate in LobbyScene puts them in it), and its values. */
export function templateParts(file: AtriumFile): { file: AtriumFile; values: TemplateValue[] } {
  const root = file.layers.find(layer => layer.template && !layer.parent_id)
  if (!root) return { file, values: [] }
  const out = (id: string | null | undefined) => (id === root._local_id ? null : id ?? null)
  return {
    file: {
      ...file,
      layers: file.layers.filter(layer => layer !== root).map(layer => ({ ...layer, parent_id: out(layer.parent_id) })),
      traces: file.traces.map(row => ({ ...row, _local_layer_id: out(row._local_layer_id) })),
    },
    values: root.template?.values ?? [],
  }
}

/** A template begun -- or one of one's own, to change (`edit`): its atrium made in
 *  the vault, this browser's or the desktop's own. Its look is the interface's
 *  (LobbyScene). Its id, to go to. */
export async function beginWorkshop(name: string, from: string | null, edit?: { id: string; values: TemplateValue[] }): Promise<string> {
  await endWorkshop()
  const { browserEngine, rememberBrowserAtrium } = await import('./browserAtriums')
  const client = isDesktop ? supabase : (await browserEngine()).localClient
  const { data: { user } } = await client.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data, error } = await (client.from('lobbies') as any)
    .insert({ name, owner_user_id: user.id, password_hash: null, is_public: false, max_players: 1, theme_settings: null })
    .select()
    .single()
  if (error || !data) throw error ?? new Error('the workshop was not made')
  if (!isDesktop) rememberBrowserAtrium(data.id)
  write({ lobbyId: data.id, name, values: edit?.values ?? [], from, editing: edit?.id ?? null, loaded: !edit })
  return data.id
}

/** The workshop let go: its atrium deleted, as the tutorial's is. */
export async function endWorkshop() {
  const kept = read()
  if (!kept) return
  write(null)
  const { clientFor, forgetBrowserAtrium } = await import('./browserAtriums')
  try {
    await (await clientFor(kept.lobbyId)).from('lobbies').delete().eq('id', kept.lobbyId)
  } catch (error) {
    console.warn('The template workshop left behind:', error)
  }
  forgetBrowserAtrium(kept.lobbyId)
}
