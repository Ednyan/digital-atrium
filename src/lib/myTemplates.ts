// A person's own templates (docs/IDEAS.md, "Making your own"): made in the template
// editor (lib/workshop) and shown in the Templates panel's My templates.
//
// Signed in, they're the account's: each one's .atrium file and picture in the
// hosted store (lib/hostedStore, workers/rooms src/store.ts), in a folder of its
// own, and their list in the account's private app data -- the same on every
// device. Signed out, or with the account out of reach, they're this device's:
// the files in IndexedDB. Those move to the account the next time it's looked at.
// The account's are copied here as they're read, to be had offline.
// The list shown is kept in localStorage either way, so the panel has it at once.
//
// The panel's quick slots and one's folders go with them: on the account signed in,
// on the device signed out.

import { useEffect, useState } from 'react'
import { parseAtriumFile, type AtriumFile } from './atriumFormat'
import { accountHere } from './platformAdmin'
import { whoIsSignedIn } from './signedIn'

// `account`: kept on that account -- its files' ids in the hosted store.
// `bytes`: what it takes in the account's space, its file and picture (from 2026-11-06).
// `folder`: which of one's folders it's in; none, at the top of My templates.
export interface MyTemplate {
  id: string; name: string; madeAt: number; traces: number; values: number; bytes?: number; folder?: string | null
  account?: { owner: string; file: string; picture: string | null }
}
// The account's list (its app data): where its folder is, what's in it, and the
// quick slots (none yet: the device's become the account's).
// ponytail: one small file of at most 16 KB (workers/rooms MOST_APPDATA_BYTES),
// about 60 templates; a file in the folder once there are more.
interface Index { folder: string | null; list: MyTemplate[]; quick?: string[]; folders?: MyFolder[] }
/** One's own folder in My templates, inside another (`parent`) or at the top. */
export interface MyFolder { id: string; name: string; parent: string | null }

/** The most one template may take, its file and picture together (the user, 2026-11-06). */
export const TEMPLATE_MOST_BYTES = 10 * 1024 * 1024

const LIST = 'atrium.myTemplates'
const CHANGED = 'atrium:my-templates'
const DB = 'atrium-templates'
const FILES = 'files'
const APP_DATA = 'templates.json'

function keptList(): MyTemplate[] {
  try {
    const kept = JSON.parse(localStorage.getItem(LIST) ?? '[]')
    return Array.isArray(kept) ? kept.filter(t => t && typeof t.id === 'string') : []
  } catch { return [] }
}
/** One's templates here: this device's, and the account's signed in. */
export function myTemplates(): MyTemplate[] {
  const account = accountHere()
  return keptList().filter(t => !t.account || t.account.owner === account)
}
function writeList(list: MyTemplate[]) {
  try { localStorage.setItem(LIST, JSON.stringify([...list].sort((a, b) => b.madeAt - a.madeAt))) } catch { /* shown this visit only */ }
  window.dispatchEvent(new Event(CHANGED))
}

/** The list, kept up to date -- and, once a visit, the account's looked at. */
export function useMyTemplates(): MyTemplate[] {
  const [list, setList] = useState(myTemplates)
  useEffect(() => {
    const changed = () => setList(myTemplates())
    window.addEventListener(CHANGED, changed)
    void lookAtAccount()
    return () => window.removeEventListener(CHANGED, changed)
  }, [])
  return list
}

// ---------------------------------------------------------------- this device

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const asked = indexedDB.open(DB, 1)
    asked.onupgradeneeded = () => asked.result.createObjectStore(FILES)
    asked.onsuccess = () => resolve(asked.result)
    asked.onerror = () => reject(asked.error)
  })
}
async function inStore<T>(mode: IDBTransactionMode, act: (files: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open()
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(FILES, mode)
      const request = act(tx.objectStore(FILES))
      tx.oncomplete = () => resolve(request ? request.result : undefined)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}
const onDevice = (id: string, part: 'atrium' | 'picture') => inStore<Blob>('readonly', files => files.get(`${id}.${part}`)).catch(() => undefined)

// ---------------------------------------------------------------- the account

const store = async () => (await import('./hostedStore')).hostedStore
async function readIndex(): Promise<Index> {
  const bytes = await (await store()).readAppData(APP_DATA)
  if (!bytes) return { folder: null, list: [] }
  const kept = JSON.parse(new TextDecoder().decode(bytes))
  return {
    folder: typeof kept?.folder === 'string' ? kept.folder : null,
    list: Array.isArray(kept?.list) ? kept.list : [],
    ...(Array.isArray(kept?.quick) ? { quick: asQuick(kept.quick) } : {}),
    ...(Array.isArray(kept?.folders) ? { folders: asFolders(kept.folders) } : {}),
  }
}
const writeIndex = async (index: Index) => (await store()).writeAppData(APP_DATA, new TextEncoder().encode(JSON.stringify(index)))
const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer())

// One template's files written into the account's folder (made the first time).
async function upload(index: Index, owner: string, template: MyTemplate, file: Blob, picture: Blob | null): Promise<MyTemplate> {
  const hosted = await store()
  index.folder ??= (await hosted.createFolder('templates')).id
  const parent = { parent: index.folder }
  const fileId = (await hosted.write(`${template.id}.atrium`, await bytesOf(file), parent)).id
  const pictureId = picture ? (await hosted.write(`${template.id}.webp`, await bytesOf(picture), parent)).id : null
  return { ...template, account: { owner, file: fileId, picture: pictureId } }
}

// Who's signed in, when the account can be asked; null when not.
const account = async () => (await whoIsSignedIn().catch(() => null))?.id ?? null

// The account's list, read once a visit: the list here made its, and this
// device's templates moved to it.
let looked: { owner: string; done: Promise<void> } | null = null
function lookAtAccount(): Promise<void> {
  const owner = accountHere()
  if (!owner) return Promise.resolve()
  if (looked?.owner === owner) return looked.done
  const done = (async () => {
    if ((await account()) !== owner) return
    const index = await readIndex()
    // The quick slots: the account's, where it has them; else this device's become its.
    const quickHere = !index.quick && keptQuick().length > 0
    if (index.quick) writeQuick(index.quick)
    else if (quickHere) index.quick = keptQuick()
    // And the folders: the account's, or this device's made its.
    const foldersHere = !index.folders && keptFolders().length > 0
    if (index.folders) writeFolders(index.folders)
    else if (foldersHere) index.folders = keptFolders()
    const theirs = index.list.map(t => ({ ...t, account: t.account && { ...t.account, owner } }))
    const here = keptList()
    const devices = here.filter(t => !t.account)
    writeList([...devices, ...theirs, ...here.filter(t => t.account && t.account.owner !== owner)])
    // Made here while signed out, or with the account out of reach: up to it.
    // ponytail: one that fails part way leaves the files it wrote unlisted, in
    // the account's space; tried again whole on the next look.
    const moved: MyTemplate[] = []
    for (const template of devices) {
      const file = await onDevice(template.id, 'atrium')
      if (file) moved.push(await upload(index, owner, template, file, (await onDevice(template.id, 'picture')) ?? null))
    }
    if (!moved.length) {
      if (quickHere || foldersHere) await writeIndex(index)
      return
    }
    // One of the account's changed here out of its reach: this one, now.
    const movedIds = new Set(moved.map(t => t.id))
    index.list = [...moved, ...index.list.filter(t => !movedIds.has(t.id))]
    await writeIndex(index)
    await inStore('readwrite', files => { for (const { id } of moved) { files.delete(`${id}.atrium`); files.delete(`${id}.picture`) } }).catch(() => undefined)
    const gone = new Set(moved.map(t => t.id))
    writeList([...moved, ...keptList().filter(t => !gone.has(t.id))])
  })().catch(error => {
    console.warn('My templates: the account could not be looked at', error)
    looked = null
  })
  looked = { owner, done }
  return done
}

// ---------------------------------------------------------------- either

const find = (id: string) => keptList().find(t => t.id === id)

/** A template made -- or, `replacing` one of one's own, changed: kept on the account
 *  signed in, else on this device; listed first. */
export async function keepTemplate(name: string, file: Blob, picture: Blob | null, counts: { traces: number; values: number }, replacing?: string | null, folder?: string | null): Promise<MyTemplate> {
  const old = replacing ? find(replacing) : undefined
  const made: MyTemplate = { id: old?.id ?? crypto.randomUUID(), name, madeAt: Date.now(), ...counts, bytes: file.size + (picture?.size ?? 0), folder: old ? old.folder ?? null : folder ?? null }
  const others = () => keptList().filter(t => t.id !== made.id)
  // Its files on this device: the template, or the copy of the account's (partOf).
  const onHere = () => inStore('readwrite', files => {
    files.put(file, `${made.id}.atrium`)
    if (picture) files.put(picture, `${made.id}.picture`)
    else files.delete(`${made.id}.picture`)
  })
  const owner = await account()
  if (owner) {
    try {
      // Its list as it is now, so one made on another device since stays in it.
      const index = await readIndex()
      const kept = await upload(index, owner, made, file, picture)
      await writeIndex({ ...index, list: [kept, ...index.list.filter(t => t.id !== made.id)] })
      writeList([kept, ...others()])
      await onHere().catch(() => undefined)
      // What it was, let go once what it is now is listed.
      if (old?.account) {
        const hosted = await store()
        for (const id of [old.account.file, old.account.picture]) if (id) await hosted.remove(id).catch(() => undefined)
      }
      return kept
    } catch (error) {
      console.warn('My templates: kept on this device, the account out of reach', error)
    }
  }
  await onHere()
  writeList([made, ...others()])
  return made
}

// An account's file, read once a visit -- the panel asks for every one each time
// it opens -- and a copy kept on the device, for when the account is out of reach
// (offline, on the desktop above all).
const read = new Map<string, Promise<Blob | undefined>>()
async function partOf(id: string, part: 'atrium' | 'picture'): Promise<Blob | undefined> {
  const where = find(id)?.account
  if (!where) return onDevice(id, part)
  const fileId = part === 'atrium' ? where.file : where.picture
  if (!fileId) return undefined
  if (!read.has(fileId)) {
    read.set(fileId, store()
      .then(async hosted => {
        const blob = new Blob([await hosted.readByLink(fileId) as BlobPart])
        void inStore('readwrite', files => { files.put(blob, `${id}.${part}`) }).catch(() => undefined)
        return blob
      })
      .catch(() => { read.delete(fileId); return onDevice(id, part) }))
  }
  return read.get(fileId)
}

/** A template's file, read: null if it's gone or isn't one. */
export async function templateFile(id: string): Promise<AtriumFile | null> {
  const blob = await partOf(id, 'atrium')
  if (!blob) return null
  try { return parseAtriumFile(await blob.text()) } catch { return null }
}

export const templatePicture = (id: string) => partOf(id, 'picture')

/** A template deleted: from wherever it's kept. */
export async function forgetTemplate(id: string) {
  const where = find(id)?.account
  if (where) {
    // Out of the account's list first: listed still, until it can be.
    try {
      const index = await readIndex()
      await writeIndex({ ...index, list: index.list.filter(t => t.id !== id) })
    } catch (error) {
      console.warn('My templates: the account could not be reached to delete it', error)
      return
    }
    const hosted = await store()
    for (const file of [where.file, where.picture]) if (file) await hosted.remove(file).catch(() => undefined)
  }
  // Its files here: this device's, or the copy of the account's.
  await inStore('readwrite', files => { files.delete(`${id}.atrium`); files.delete(`${id}.picture`) }).catch(() => undefined)
  writeList(keptList().filter(t => t.id !== id))
  if (keptQuick().includes(MINE + id)) await setQuickSlots(keptQuick().filter(slot => slot !== MINE + id))
}

// ---------------------------------------------------------------- folders

const FOLDERS = 'atrium.myTemplates.folders'
const asFolders = (rows: unknown[]): MyFolder[] => rows.flatMap(row => {
  const { id, name, parent } = (row ?? {}) as Record<string, unknown>
  return typeof id === 'string' && typeof name === 'string' ? [{ id, name: name.slice(0, 80), parent: typeof parent === 'string' ? parent : null }] : []
})
function keptFolders(): MyFolder[] {
  try {
    const kept = JSON.parse(localStorage.getItem(FOLDERS) ?? '[]')
    return Array.isArray(kept) ? asFolders(kept) : []
  } catch { return [] }
}
function writeFolders(folders: MyFolder[]) {
  try { localStorage.setItem(FOLDERS, JSON.stringify(folders)) } catch { /* this visit's, then */ }
  window.dispatchEvent(new Event(CHANGED))
}

/** One's folders, kept up to date with the templates (useMyTemplates looks at the account). */
export function useMyFolders(): MyFolder[] {
  const [folders, setFolders] = useState(keptFolders)
  useEffect(() => {
    const changed = () => setFolders(keptFolders())
    window.addEventListener(CHANGED, changed)
    return () => window.removeEventListener(CHANGED, changed)
  }, [])
  return folders
}

// One change to one's list and folders: here at once, and on the account signed in.
type Kept = { list: MyTemplate[]; folders: MyFolder[] }
async function changeKept(change: (kept: Kept) => Kept): Promise<void> {
  const here = change({ list: keptList(), folders: keptFolders() })
  writeList(here.list)
  writeFolders(here.folders)
  const owner = accountHere()
  if (!owner || (await account()) !== owner) return
  try {
    const index = await readIndex()
    const there = change({ list: index.list, folders: index.folders ?? keptFolders() })
    await writeIndex({ ...index, list: there.list, folders: there.folders })
  } catch (error) {
    console.warn('My templates: changed on this device, the account out of reach', error)
  }
}

/** Whether `inside` is `folder` or anywhere within it. */
export function isWithin(folders: MyFolder[], inside: string | null, folder: string): boolean {
  for (let at = inside, n = 0; at && n <= folders.length; n++, at = folders.find(f => f.id === at)?.parent ?? null) if (at === folder) return true
  return false
}

/** A new folder, in `parent` (or at the top): its id. */
export async function makeFolder(name: string, parent: string | null): Promise<string> {
  const id = crypto.randomUUID()
  await changeKept(kept => ({ ...kept, folders: [...kept.folders, { id, name, parent }] }))
  return id
}
export const renameFolder = (id: string, name: string) =>
  changeKept(kept => ({ ...kept, folders: kept.folders.map(f => (f.id === id ? { ...f, name } : f)) }))
/** A folder put inside another (or at the top) -- never inside itself. */
export const moveFolder = (id: string, parent: string | null) =>
  changeKept(kept => (parent && isWithin(kept.folders, parent, id) ? kept : { ...kept, folders: kept.folders.map(f => (f.id === id ? { ...f, parent } : f)) }))
/** A folder gone: what was in it -- templates and folders -- moved up to where it was. */
export const deleteFolder = (id: string) => changeKept(kept => {
  const parent = kept.folders.find(f => f.id === id)?.parent ?? null
  return {
    list: kept.list.map(t => (t.folder === id ? { ...t, folder: parent } : t)),
    folders: kept.folders.filter(f => f.id !== id).map(f => (f.parent === id ? { ...f, parent } : f)),
  }
})
export const moveTemplate = (id: string, folder: string | null) =>
  changeKept(kept => ({ ...kept, list: kept.list.map(t => (t.id === id ? { ...t, folder } : t)) }))
export const renameTemplate = (id: string, name: string) =>
  changeKept(kept => ({ ...kept, list: kept.list.map(t => (t.id === id ? { ...t, name } : t)) }))

// ---------------------------------------------------------------- quick slots

// A few templates at the foot of the panel, to hand: the Digital Atrium's by their
// ids, one's own as MINE + its id.
export const MINE = 'mine:'
export const MOST_QUICK = 8
const QUICK = 'atrium.templates.quick'
const QUICK_CHANGED = 'atrium:templates-quick'
const asQuick = (ids: unknown[]) => ids.filter((id): id is string => typeof id === 'string').slice(0, MOST_QUICK)

function keptQuick(): string[] {
  try {
    const kept = JSON.parse(localStorage.getItem(QUICK) ?? '[]')
    return Array.isArray(kept) ? asQuick(kept) : []
  } catch { return [] }
}
function writeQuick(ids: string[]) {
  try { localStorage.setItem(QUICK, JSON.stringify(ids)) } catch { /* this visit's, then */ }
  window.dispatchEvent(new Event(QUICK_CHANGED))
}

/** The quick slots, changed: here at once, and on the account signed in -- the
 *  same then on every device it's signed in on. */
export async function setQuickSlots(ids: string[]) {
  const quick = asQuick(ids)
  writeQuick(quick)
  const owner = accountHere()
  if (!owner || (await account()) !== owner) return
  try {
    await writeIndex({ ...(await readIndex()), quick })
  } catch (error) {
    console.warn('Quick slots: kept on this device, the account out of reach', error)
  }
}

/** The quick slots, kept up to date: the account's once it's been looked at (useMyTemplates). */
export function useQuickSlots(): string[] {
  const [quick, setQuick] = useState(keptQuick)
  useEffect(() => {
    const changed = () => setQuick(keptQuick())
    window.addEventListener(QUICK_CHANGED, changed)
    return () => window.removeEventListener(QUICK_CHANGED, changed)
  }, [])
  return quick
}
