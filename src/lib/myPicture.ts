// One's profile picture: made small here (256 pixels square covers its largest
// showing, Profile's 112, on a 2x screen), and kept as a public file at an address
// nobody can guess, read from there and cached for good, so showing it asks this
// app's server nothing. The device remembers where it is. On the desktop with no
// account signed in, it's kept on the device alone, as the rest of its profile is.

import { useSyncExternalStore } from 'react'
import { useGameStore } from '../store/gameStore'
import { cropOf, type CropView } from './pictureCrop'
import { filesUrl, workerUrl } from './rooms'
import { ACCOUNT_EVENT, workerAccount } from './signedIn'
import { isDesktop } from './supabase'
import { toWorker } from './worker'

export const PICTURE_SIDE = 256
const ENOUGH_BYTES = 24 * 1024
const CHANGED = 'atrium:my-picture'

const keyOf = () => `atrium.picture.${workerAccount()?.id ?? useGameStore.getState().userId}`
const onDeviceOnly = () => isDesktop && !workerAccount()
const read = () => { try { return localStorage.getItem(keyOf()) } catch { return null } }
function keep(picture: string | null) {
  try {
    if (picture === read()) return
    if (picture) localStorage.setItem(keyOf(), picture)
    else localStorage.removeItem(keyOf())
  } catch { /* shown till the next look */ }
  window.dispatchEvent(new Event(CHANGED))
}

// A file's address, from its key -- by the worker, where there's a local one.
const addressOf = (picture: string) => /^(data|blob):/.test(picture) ? picture : `${filesUrl() || workerUrl()}/${picture}`

/** One's picture to show, or null: from this device, kept up to date. */
export function useMyPicture(): string | null {
  const picture = useSyncExternalStore(changed => {
    window.addEventListener(CHANGED, changed)
    window.addEventListener(ACCOUNT_EVENT, changed)
    return () => {
      window.removeEventListener(CHANGED, changed)
      window.removeEventListener(ACCOUNT_EVENT, changed)
    }
  }, read)
  return picture && addressOf(picture)
}

/** What the account says, as it's read for other reasons (lib/stats, lib/profile). */
export function notePictureFrom(settings: { picture?: unknown } | undefined) {
  if (onDeviceOnly()) return
  keep(typeof settings?.picture === 'string' ? settings.picture : null)
}

/** Forgotten here: the account's gone. */
export const forgetMyPicture = () => keep(null)

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) => new Promise<Blob | null>(done => canvas.toBlob(done, type, quality))

/** The crop as the smallest file that still looks right, `width` pixels wide:
 *  halved down to its size (one big step blurs, or shimmers, in some browsers),
 *  then WebP, less fine only if it's over `enough` bytes. JPEG on a white ground
 *  where a browser can't write WebP. One's picture, unless said otherwise. */
export async function pictureFile(image: HTMLImageElement, view: CropView, frame: number, aspect = 1, width = PICTURE_SIDE, enough = ENOUGH_BYTES): Promise<Blob> {
  const crop = cropOf(view, image.naturalWidth, image.naturalHeight, frame, aspect)
  const height = Math.round(width / aspect)
  let from: CanvasImageSource = image, x = crop.x, y = crop.y, w = crop.w, h = crop.h
  const canvasOf = (cw: number, ch: number) => Object.assign(document.createElement('canvas'), { width: cw, height: ch })
  while (w > width * 2) {
    const step = canvasOf(Math.ceil(w / 2), Math.ceil(h / 2))
    const pen = step.getContext('2d')!
    pen.imageSmoothingQuality = 'high'
    pen.drawImage(from, x, y, w, h, 0, 0, step.width, step.height)
    from = step; x = 0; y = 0; w = step.width; h = step.height
  }
  const done = canvasOf(width, height)
  const pen = done.getContext('2d')!
  pen.imageSmoothingQuality = 'high'
  pen.drawImage(from, x, y, w, h, 0, 0, width, height)
  let blob: Blob | null = null
  for (const quality of [0.8, 0.7, 0.6]) {
    blob = await toBlob(done, 'image/webp', quality)
    if (!blob || blob.type !== 'image/webp') { blob = null; break }
    if (blob.size <= enough) return blob
  }
  if (blob) return blob
  pen.globalCompositeOperation = 'destination-over'
  pen.fillStyle = '#fff'
  pen.fillRect(0, 0, width, height)
  for (const quality of [0.8, 0.65]) {
    blob = await toBlob(done, 'image/jpeg', quality)
    if (blob && blob.size <= enough) return blob
  }
  if (!blob) throw new Error('This browser could not make the picture')
  return blob
}

const asDataUrl = (blob: Blob) => new Promise<string>((done, failed) => {
  const reader = new FileReader()
  reader.onload = () => done(String(reader.result))
  reader.onerror = () => failed(reader.error)
  reader.readAsDataURL(blob)
})

/** Saved as one's picture, the old one gone. Throws if it couldn't be. */
export async function saveMyPicture(blob: Blob): Promise<void> {
  const url = await asDataUrl(blob)
  if (onDeviceOnly()) { keep(url); return }
  const { ok, answer } = await toWorker<{ picture?: string }>('/people/picture', { picture: url.slice(url.indexOf(',') + 1) }, true)
  if (!ok || !answer?.picture) throw new Error('The picture was not saved')
  keep(answer.picture)
}

export async function removeMyPicture(): Promise<void> {
  if (!onDeviceOnly()) {
    const { ok } = await toWorker('/people/picture', {}, true)
    if (!ok) throw new Error('The picture was not removed')
  }
  keep(null)
}
