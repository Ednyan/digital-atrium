// Pinterest, for every account and for the desktop app (src/lib/pinterest.ts
// and src/lib/pinterestDesktop.ts in the app): its sign-in's code exchanged,
// and its boards and pins read, on their behalf -- Pinterest's API takes no
// calls from a browser, and its tokens must never reach one. The app's
// secret is a secret here (PINTEREST_CLIENT_SECRET); each connection's
// tokens are sealed in the directory (src/people.ts), bound to who holds
// them: an account, or a desktop app's link (`link:` its token's hash).
//
// The desktop app has no account and no https address for Pinterest to come
// back to: it sends its person to the website, which connects Pinterest on
// its behalf (`exchange`, mode desktop, nobody signed in) and shows a short
// code; the app trades that for a link token (`link`), the one thing it keeps.
//
// Moved from Supabase (phase 10, step 6): an existing account's connection,
// and a desktop link Supabase made, are handed over the first time they're
// used here (supabase/functions/pinterest-handover), and kept here from then on.
//
// Pins shown (`show`): Pinterest's rules don't let what's read from it be kept
// (docs/PINTEREST.md), so an atrium keeps a pin as its id, its board and whose
// connection imported it, and every time it's opened its pins are read here
// through that connection -- for anyone who can see the atrium, a public one's
// visitors too -- and passed on, kept nowhere. A pin on a board that isn't
// public is shown to the one who imported it alone.

import { allowedNow, tablesIn } from './people'
import { fromBase64, keyFrom, outbound, replies, toBase64, whoIs, type Env } from './who'

const API = 'https://api.pinterest.com/v5'
// Renewed a little before it runs out, so no request races it.
const RENEW_BEFORE_MS = 60_000
// The desktop's pairing code: eight of these, for ten minutes.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 8
const PAIRING_MS = 10 * 60_000
// Pins asked for at once, and calls to Pinterest made for them (a Worker makes
// at most 50 of its own a request): what's beyond them is asked for again.
const MOST_PINS = 500
const MOST_CALLS = 40
// Asks a visitor may make an hour: an atrium opened is one or two.
const SHOWS_AN_HOUR = 240

interface Tokens { access: string; refresh: string | null; until: number }

export async function pinterest(request: Request, env: Env, what: string): Promise<Response> {
  const { allowed, answer } = replies(request)
  if (!allowed) return answer(403, { error: 'origin' })
  const db = env.PEOPLE
  if (!db || !env.PINTEREST_CLIENT_ID || !env.PINTEREST_CLIENT_SECRET || !env.GOOGLE_CLIENT_SECRET) return answer(503, { error: 'Pinterest app not configured on the server' })
  let asked: Record<string, unknown>
  try {
    asked = await request.json()
  } catch {
    return answer(400, { error: 'body' })
  }
  await tablesIn(db)
  const key = await keyFrom(env.GOOGLE_CLIENT_SECRET, 'atrium pinterest', 'AES-GCM', ['encrypt', 'decrypt'])

  // Pins shown where they're placed: anyone may ask, signed in or not.
  if (what === 'show') {
    if (!(await allowedNow(db, `pins:${request.headers.get('CF-Connecting-IP') ?? 'local'}`, SHOWS_AN_HOUR, undefined, 10))) return answer(429, { error: 'wait' })
    const wanted = (Array.isArray(asked.pins) ? asked.pins : []).slice(0, MOST_PINS).flatMap(pin => {
      const { id, board, by } = (pin ?? {}) as Record<string, unknown>
      return typeof id === 'string' && /^\d{1,24}$/.test(id) && typeof by === 'string' && by && by.length <= 200
        ? [{ id, by, board: typeof board === 'string' && /^\d{1,24}$/.test(board) ? board : null }] : []
    })
    // Who asks: to be shown pins of a board that isn't public, the one who imported them.
    const link = typeof asked.link === 'string' && asked.link ? asked.link : null
    const asker = link ? `link:${await sha256Hex(link)}` : (await whoIs(typeof asked.token === 'string' ? asked.token : null, env).catch(() => null))?.id ?? null
    return answer(200, await showPins(env, db, key, wanted, asker))
  }
  const keepFor = async (holder: string, tokens: Tokens, username: string | null) => db.prepare(`insert into pinterest (account, sealed, username, updated_at) values (?, ?, ?, ?)
    on conflict (account) do update set sealed = excluded.sealed, username = excluded.username, updated_at = excluded.updated_at`)
    .bind(holder, await seal(key, holder, tokens), username, Date.now()).run()

  // The desktop's: the code shown on the website, traded for a link token.
  if (what === 'link') {
    const code = typeof asked.code === 'string' ? asked.code.toUpperCase().replace(/[^A-Z0-9]/g, '') : ''
    if (code.length !== CODE_LENGTH) return answer(400, { error: 'That code is not the right shape.' })
    const pairing = `pairing:${await sha256Hex(code)}`
    const row = await db.prepare('select sealed, username, updated_at from pinterest where account = ?').bind(pairing).first<{ sealed: string; username: string | null; updated_at: number }>()
    const tokens = row && Date.now() - row.updated_at < PAIRING_MS ? await open(key, pairing, row.sealed) : null
    await db.prepare('delete from pinterest where account = ?').bind(pairing).run()
    if (!tokens) return answer(404, { error: 'That code is not valid any more. Generate a new one.' })
    const token = toUrl(crypto.getRandomValues(new Uint8Array(32)))
    await keepFor(`link:${await sha256Hex(token)}`, tokens, row!.username)
    return answer(200, { token })
  }

  // The code from Pinterest's sign-in, exchanged: an account connected -- or,
  // the desktop's (nobody signed in here), a pairing code for its app.
  if (what === 'exchange') {
    const code = typeof asked.code === 'string' ? asked.code : '', redirectUri = typeof asked.redirectUri === 'string' ? asked.redirectUri : ''
    if (!code || !redirectUri) return answer(400, { error: 'Missing code or redirectUri' })
    const desktop = asked.mode === 'desktop'
    const who = desktop ? null : await whoIs(typeof asked.token === 'string' ? asked.token : null, env)
    if (!desktop && !who) return answer(401, { error: 'Not authenticated' })
    const got = await fromPinterest(env, { grant_type: 'authorization_code', code, redirect_uri: redirectUri })
    if (!got) return answer(502, { error: 'Pinterest rejected the authorization code' })
    let username: string | null = null
    const account = await fetch(outbound(env, `${API}/user_account`), { headers: { Authorization: `Bearer ${got.access}` } }).catch(() => null)
    if (account?.ok) username = ((await account.json()) as { username?: string }).username ?? null
    if (desktop) {
      // Codes never traded in, gone once they've run out.
      await db.prepare("delete from pinterest where account like 'pairing:%' and updated_at < ?").bind(Date.now() - PAIRING_MS).run()
      const plain = [...crypto.getRandomValues(new Uint8Array(CODE_LENGTH))].map(byte => CODE_ALPHABET[byte & 31]).join('')
      await keepFor(`pairing:${await sha256Hex(plain)}`, got, username)
      return answer(200, { success: true, username, code: plain })
    }
    await keepFor(who!.id, got, username)
    return answer(200, { success: true, username })
  }

  // Whose connection this is: the signed-in account's, or a desktop link's.
  const link = typeof asked.link === 'string' && asked.link ? asked.link : null
  const who = link ? null : await whoIs(typeof asked.token === 'string' ? asked.token : null, env)
  if (!link && !who) return answer(401, { error: 'Not authenticated' })
  const holder = link ? `link:${await sha256Hex(link)}` : who!.id
  // Supabase's, the first time: an existing account's, or a link Supabase made.
  if ((link || who!.kind === 'supabase') && !(await db.prepare('select 1 from pinterest where account = ?').bind(holder).first())) {
    const handed = await handover(env, link ? { link } : { token: asked.token as string })
    if (handed) await keepFor(holder, handed.tokens, handed.username)
  }

  if (what === 'status') {
    const row = await db.prepare('select username from pinterest where account = ?').bind(holder).first<{ username: string | null }>()
    return answer(200, { linked: !link || !!row, connected: !!row, username: row?.username ?? null })
  }

  if (what === 'disconnect' || what === 'unlink') {
    await db.prepare('delete from pinterest where account = ?').bind(holder).run()
    return answer(200, { connected: false })
  }

  // Boards, and a board's pins, a page at a time.
  if (what === 'api') {
    const bookmark = typeof asked.bookmark === 'string' ? `&bookmark=${encodeURIComponent(asked.bookmark)}` : ''
    let path: string
    if (asked.action === 'boards') path = `/boards?page_size=100${bookmark}`
    else if (asked.action === 'pins' && typeof asked.boardId === 'string' && asked.boardId) path = `/boards/${encodeURIComponent(asked.boardId)}/pins?page_size=100${bookmark}`
    else return answer(400, { error: asked.action === 'pins' ? 'Missing boardId' : 'Unknown action' })
    const access = await accessFor(env, db, key, holder)
    if (!access) return answer(409, { error: 'Pinterest not connected' })
    const response = await fetch(outbound(env, `${API}${path}`), { headers: { Authorization: `Bearer ${access}` } })
    if (!response.ok) {
      console.error('[pinterest] Pinterest refused:', response.status, await response.text())
      return answer(502, { error: 'Pinterest API request failed' })
    }
    return answer(200, await response.json())
  }
  return answer(400, { error: 'body' })
}

// A connection Supabase kept, handed over to this worker (and gone from there).
async function handover(env: Env, from: { token: string } | { link: string }): Promise<{ tokens: Tokens; username: string | null } | null> {
  if (!env.SUPABASE_WORKER_KEY) return null
  const response = await fetch(`${env.SUPABASE_URL}/functions/v1/pinterest-handover`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_ANON_KEY, 'x-worker-key': env.SUPABASE_WORKER_KEY, 'Content-Type': 'application/json',
      Authorization: `Bearer ${'token' in from ? from.token : env.SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify('link' in from ? { link: from.link } : {}),
  }).catch(() => null)
  const got = response?.ok ? await response.json().catch(() => null) as { access_token?: string; refresh_token?: string | null; token_expires_at?: string | null; pinterest_username?: string | null } | null : null
  if (!got?.access_token) return null
  const until = got.token_expires_at ? Date.parse(got.token_expires_at) : NaN
  return { tokens: { access: got.access_token, refresh: got.refresh_token ?? null, until: Number.isFinite(until) ? until : 0 }, username: got.pinterest_username ?? null }
}

// The holder's access token: as kept, or renewed (and kept so) when it's
// about to run out. Null if it's not connected, or its connection is dead.
async function accessFor(env: Env, db: D1Database, key: CryptoKey, holder: string): Promise<string | null> {
  const row = await db.prepare('select sealed from pinterest where account = ?').bind(holder).first<{ sealed: string }>()
  const tokens = row ? await open(key, holder, row.sealed) : null
  if (!tokens) return null
  if (tokens.until - Date.now() > RENEW_BEFORE_MS || !tokens.refresh) return tokens.access
  const renewed = await fromPinterest(env, { grant_type: 'refresh_token', refresh_token: tokens.refresh })
  if (!renewed) return null
  const kept = { ...renewed, refresh: renewed.refresh ?? tokens.refresh }
  await db.prepare('update pinterest set sealed = ?, updated_at = ? where account = ?').bind(await seal(key, holder, kept), Date.now(), holder).run()
  return kept.access
}

// Pinterest's token address, asked with the app's id and secret.
async function fromPinterest(env: Env, form: Record<string, string>): Promise<Tokens | null> {
  const response = await fetch(outbound(env, `${API}/oauth/token`), {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${env.PINTEREST_CLIENT_ID}:${env.PINTEREST_CLIENT_SECRET}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
  })
  if (!response.ok) {
    console.error('[pinterest] token:', response.status, await response.text())
    return null
  }
  const got = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number }
  if (!got.access_token) return null
  return { access: got.access_token, refresh: got.refresh_token ?? null, until: Date.now() + Number(got.expires_in ?? 0) * 1000 }
}

const sha256Hex = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(byte => byte.toString(16).padStart(2, '0')).join('')
const toUrl = (bytes: Uint8Array) => toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

// Tokens sealed to their holder: opened only as that holder's.
async function seal(key: CryptoKey, holder: string, tokens: Tokens): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(holder) }, key, new TextEncoder().encode(JSON.stringify(tokens))))
  return toBase64(new Uint8Array([...iv, ...sealed]))
}
async function open(key: CryptoKey, holder: string, sealed: string): Promise<Tokens | null> {
  try {
    const bytes = fromBase64(sealed)
    return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12), additionalData: new TextEncoder().encode(holder) }, key, bytes.subarray(12))))
  } catch {
    return null
  }
}

// ---- Pins shown ---------------------------------------------------------------

interface Shown { image: string; width: number; height: number; title: string; board: string | null }

// A mid-size picture (fast, still sharp) over the original: as the import picks (src/lib/pinterest.ts).
function pictureOf(images: Record<string, { url: string; width: number; height: number }> | undefined) {
  if (!images) return null
  for (const size of ['600x', '400x300', '1200x', 'orig', '150x150']) if (images[size]) return images[size]
  return Object.values(images)[0] ?? null
}
function shownOf(pin: any): Shown | null {
  const picture = pictureOf(pin?.media?.images)
  return picture ? { image: picture.url, width: picture.width, height: picture.height, title: String(pin.title || pin.alt_text || '').slice(0, 200), board: pin.board_id ? String(pin.board_id) : null } : null
}

/** What Pinterest says of each pin, through its importer's connection: null for
 *  one it won't give (gone, or on a board not public to someone else), and the
 *  ids left for another ask once this one has made as many calls as it may. */
async function showPins(env: Env, db: D1Database, key: CryptoKey, wanted: { id: string; by: string; board: string | null }[], asker: string | null) {
  const pins: Record<string, Shown | null> = {}
  const later: string[] = []
  let calls = 0
  const call = async (path: string, access: string) => {
    calls++
    const response = await fetch(outbound(env, `${API}${path}`), { headers: { Authorization: `Bearer ${access}` } }).catch(() => null)
    return response?.ok ? response.json().catch(() => null) as Promise<any> : null
  }
  const byWhom = new Map<string, typeof wanted>()
  for (const pin of wanted) byWhom.set(pin.by, [...(byWhom.get(pin.by) ?? []), pin])
  for (const [by, theirs] of byWhom) {
    if (calls >= MOST_CALLS) { later.push(...theirs.map(pin => pin.id)); continue }
    calls++ // its token, perhaps renewed
    const access = await accessFor(env, db, key, by).catch(() => null)
    if (!access) { for (const pin of theirs) pins[pin.id] = null; continue }
    // A board's privacy, asked once: its pins shown to others only when it's public.
    const open = new Map<string, boolean>()
    const isOpen = async (board: string | null) => {
      if (asker === by) return true
      if (!board) return false
      if (!open.has(board)) open.set(board, (await call(`/boards/${board}`, access))?.privacy === 'PUBLIC')
      return open.get(board)!
    }
    const left = new Map(theirs.map(pin => [pin.id, pin]))
    // A board at a time, a hundred pins a call, while any of its pins is still wanted.
    const boards = [...new Set(theirs.map(pin => pin.board).filter((board): board is string => !!board))]
    for (const board of boards) {
      if (calls >= MOST_CALLS) break
      if (!(await isOpen(board))) {
        for (const pin of theirs) if (pin.board === board) { pins[pin.id] = null; left.delete(pin.id) }
        continue
      }
      let bookmark = ''
      while (calls < MOST_CALLS && [...left.values()].some(pin => pin.board === board)) {
        const page = await call(`/boards/${board}/pins?page_size=100${bookmark ? `&bookmark=${encodeURIComponent(bookmark)}` : ''}`, access)
        if (!page) break
        for (const item of page.items ?? []) {
          if (!left.has(String(item.id))) continue
          pins[String(item.id)] = shownOf(item)
          left.delete(String(item.id))
        }
        if (!page.bookmark) break
        bookmark = page.bookmark
      }
    }
    // The rest one at a time: no board kept (an older pin), or moved off it.
    for (const pin of left.values()) {
      if (calls >= MOST_CALLS) { later.push(pin.id); continue }
      const item = await call(`/pins/${pin.id}`, access)
      const shown = item ? shownOf(item) : null
      pins[pin.id] = shown && await isOpen(shown.board) ? shown : null
    }
  }
  return { pins, later }
}
