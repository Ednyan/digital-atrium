// The template editor (docs/IDEAS.md, "Making your own"): an atrium of its own in
// this browser's vault, as the tutorial's is (lib/tutorial), made when a template is
// begun and gone once it's saved or let go. What it's making -- its name, its values,
// the atrium it was begun from -- is kept here beside it, one at a time.

import { useEffect, useState } from 'react'
import type { TemplateValue } from './templateValues'
import { isDesktop, supabase } from './supabase'

// The most traces a template holds: Save refuses more (TemplateWorkshop).
export const TEMPLATE_TRACES = 50

export interface Workshop { lobbyId: string; name: string; values: TemplateValue[]; from: string | null }

const KEY = 'atrium.workshop'
const CHANGED = 'atrium:workshop'

function read(): Workshop | null {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return kept && typeof kept.lobbyId === 'string' ? { name: '', values: [], from: null, ...kept } : null
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

/** The workshop's name or values changed. */
export function keepWorkshop(change: Partial<Pick<Workshop, 'name' | 'values'>>) {
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

/** A template begun: its atrium made in the vault -- this browser's, or the
 *  desktop's own -- with the look of the one it's begun from. Its id, to go to. */
export async function beginWorkshop(name: string, from: string | null, theme: unknown): Promise<string> {
  await endWorkshop()
  const { browserEngine, rememberBrowserAtrium } = await import('./browserAtriums')
  const client = isDesktop ? supabase : (await browserEngine()).localClient
  const { data: { user } } = await client.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data, error } = await (client.from('lobbies') as any)
    .insert({ name, owner_user_id: user.id, password_hash: null, is_public: false, max_players: 1, theme_settings: theme ?? null })
    .select()
    .single()
  if (error || !data) throw error ?? new Error('the workshop was not made')
  if (!isDesktop) rememberBrowserAtrium(data.id)
  write({ lobbyId: data.id, name, values: [], from })
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
