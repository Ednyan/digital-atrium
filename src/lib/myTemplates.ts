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

import { useEffect, useState } from 'react'
import { parseAtriumFile, type AtriumFile } from './atriumFormat'
import { accountHere } from './platformAdmin'
import { whoIsSignedIn } from './signedIn'

// `account`: kept on that account -- its files' ids in the hosted store.
export interface MyTemplate {
  id: string; name: string; madeAt: number; traces: number; values: number
  account?: { owner: string; file: string; picture: string | null }
}
// The account's list (its app data): where its folder is, and what's in it.
// ponytail: one small file of at most 16 KB (workers/rooms MOST_APPDATA_BYTES),
// about 60 templates; a file in the folder once there are more.
interface Index { folder: string | null; list: MyTemplate[] }

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
  return { folder: typeof kept?.folder === 'string' ? kept.folder : null, list: Array.isArray(kept?.list) ? kept.list : [] }
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
    if (!moved.length) return
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
export async function keepTemplate(name: string, file: Blob, picture: Blob | null, counts: { traces: number; values: number }, replacing?: string | null): Promise<MyTemplate> {
  const old = replacing ? find(replacing) : undefined
  const made: MyTemplate = { id: old?.id ?? crypto.randomUUID(), name, madeAt: Date.now(), ...counts }
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
}
