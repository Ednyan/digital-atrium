// One's own profile, whichever kind of account is signed in (lib/signedIn):
// what the profile screens show and change, and one's own atrium themes --
// one's entry in the directory (lib/people), the name public, the colour and
// themes private there, as one's email is (docs/DECENTRALIZING.md, phase 6).
// An existing account's Supabase profile is taken in there the first time
// (phase 10, step 6); until the cutover each change is copied back to it too,
// as its sign-in still reads it (App). The desktop's is its vault's -- or, with
// an account signed in there by the site, the account's, the same as on the web.
import { cloudClient, isDesktop, supabase } from './supabase'
import { workerAccount } from './signedIn'
import { myEntry } from './people'
import { toWorker } from './worker'
import { pictureAddress } from './myPicture'
import { NO_STATS, type Stats } from './achievements'

/** Whether one's profile is this device's own: the desktop's, with no account signed in. */
export const profileOnDevice = () => isDesktop && !workerAccount()
// Where one's profile is kept when it isn't the directory's: the desktop's vault
// (its data client, set once the vault's open), or an existing account's Supabase.
const keptIn = () => (isDesktop ? supabase : cloudClient)

// `findable`: whether others may find it (asked once: none till then); the directory's accounts only.
export interface MyProfile { username: string; displayName: string; color: string | null; nameChangedAt: number | null; findable?: boolean | null }

// A display name changes once in this long on the web (the directory holds
// Google accounts to it too); the desktop's, freely.
const NAME_EVERY_DAYS = 15
const DAY_MS = 24 * 60 * 60 * 1000

export async function loadMyProfile(userId: string): Promise<MyProfile | null> {
  if (!profileOnDevice()) {
    const entry = await myEntry().catch(() => null)
    if (entry?.username || workerAccount()) {
      if (!entry) return null
      return {
        username: entry.username ?? '', displayName: entry.display_name || entry.username || '', color: entry.settings?.player_color ?? null,
        nameChangedAt: entry.name_changed_at ?? null, findable: typeof entry.settings?.findable === 'boolean' ? entry.settings.findable : null,
      }
    }
  }
  if (!keptIn()) return null
  const { data } = await (keptIn().from('profiles') as any)
    .select('username, display_name, display_name_last_changed, player_color')
    .eq('id', userId)
    .maybeSingle()
  if (!data) return null
  const changed = data.display_name_last_changed ? Date.parse(data.display_name_last_changed) : NaN
  return { username: data.username, displayName: data.display_name || data.username, color: data.player_color ?? null, nameChangedAt: Number.isFinite(changed) ? changed : null }
}

/** Days until the display name may change again: 0, now (never changed, or
 *  the desktop's own). From when it was changed, or when it may be again. */
export function daysUntilNameChange(changedAt: number | null, nextAt = changedAt === null ? null : changedAt + NAME_EVERY_DAYS * DAY_MS): number {
  if (profileOnDevice() || nextAt === null) return 0
  return Math.max(0, Math.ceil((nextAt - Date.now()) / DAY_MS))
}

/** The name and colour changed as asked. A name changed too soon is refused
 *  (`NAME_TOO_SOON`, with `until`). */
export async function saveMyProfile(userId: string, change: { displayName?: string; color?: string }): Promise<void> {
  if (!profileOnDevice()) {
    await myEntry({
      ...(change.displayName !== undefined ? { display_name: change.displayName } : {}),
      ...(change.color ? { settings: { player_color: change.color } } : {}),
    })
    if (workerAccount()) return
  }
  if (!keptIn()) throw new Error('Not signed in')
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (change.color) update.player_color = change.color
  if (change.displayName !== undefined) {
    update.display_name = change.displayName
    // The desktop's name is its username too.
    if (isDesktop) update.username = change.displayName
    else update.display_name_last_changed = new Date().toISOString()
  }
  const { error } = await (keptIn().from('profiles') as any).update(update).eq('id', userId)
  if (error) throw error
}

/** One's own atrium themes (lib/customThemes), as stored -- unchecked: the
 *  account's, or with `onDevice`, the desktop vault's. */
export async function loadMyThemes(userId: string, onDevice = false): Promise<unknown> {
  if (!onDevice) {
    const entry = await myEntry().catch(() => null)
    if (workerAccount()) return entry?.settings?.custom_themes ?? []
    // An existing account's, once taken in; until then (or if they couldn't be), Supabase's.
    if (entry?.settings?.custom_themes !== undefined) return entry.settings.custom_themes
  }
  const kept = onDevice ? supabase : cloudClient
  if (!kept) return []
  const { data, error } = await (kept.from('profiles') as any).select('custom_themes').eq('id', userId).maybeSingle()
  if (error) throw error
  return data?.custom_themes ?? []
}
export async function saveMyThemes(userId: string, themes: unknown[], onDevice = false): Promise<void> {
  if (!onDevice) {
    await myEntry({ settings: { custom_themes: themes } })
    if (workerAccount()) return
  }
  const kept = onDevice ? supabase : cloudClient
  if (!kept) throw new Error('Not signed in')
  const { error } = await (kept.from('profiles') as any).update({ custom_themes: themes }).eq('id', userId)
  if (error) throw error
}

// ---------------------------------------------------------------- others

/** Whether others may find one's profile, searching one's username: one's choice. */
export const setFindable = (on: boolean) => myEntry({ settings: { findable: on } })

export interface Found { username: string; name: string; picture: string | null }
export interface TheirProfile extends Found { colour: string | null; stats: Stats; joined: number | null }

/** Those who let themselves be found, by the start of their username or part of their name. */
export async function findPeople(q: string): Promise<Found[]> {
  const { ok, answer } = await toWorker<{ username: string; display_name: string | null; picture: string | null }[]>('/people/search', { q }, true)
  if (!ok || !Array.isArray(answer)) return []
  return answer.map(row => ({ username: row.username, name: row.display_name || row.username, picture: row.picture ? pictureAddress(row.picture) : null }))
}

/** One of them, as their profile page shows them: none if they can't be found. */
export async function theirProfile(username: string): Promise<TheirProfile | null> {
  const { ok, answer } = await toWorker<any>('/people/profile', { username }, true)
  if (!ok || !answer?.username) return null
  return {
    username: answer.username, name: answer.display_name || answer.username, picture: answer.picture ? pictureAddress(answer.picture) : null,
    colour: typeof answer.colour === 'string' ? answer.colour : null, joined: typeof answer.created_at === 'number' ? answer.created_at : null,
    stats: { ...NO_STATS, ...(answer.stats && typeof answer.stats === 'object' ? answer.stats : {}), pinned: Array.isArray(answer.stats?.pinned) ? answer.stats.pinned : [] },
  }
}
