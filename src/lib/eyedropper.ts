// A colour off the canvas, for the palette (lib/palette): what's under a
// point on screen -- a shape's fill, a line's, text's or a frame's border, as
// the trace has it; a picture's or a video's pixel there, read from a copy of
// it asked for with CORS. A picture from a site that doesn't allow that, or
// an embedded page, can't be read; Chrome and Edge have a picker of their own
// for those (nativePick), which reads any pixel on screen. The desktop app's
// webview has one too, and it opens nothing: there, as where there's none, the
// atrium is picked from (pickOnAtrium).

import type { Trace } from '../types/database'
import { isDesktop } from './supabase'
import { useGameStore } from '../store/gameStore'
import { isPathTrace } from './pathBounds'
import { shownValue } from './traceStyle'
import { borderColourOf } from './traceGeometry'
import { addColour, normalHex, paletteNow } from './palette'
import { showToast } from './toast'
import { t } from './i18n'

import { count } from './stats'

export type Picked = { colour: string } | { problem: 'unreadable' | 'nothing' }

const hexOf = (r: number, g: number, b: number) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
const asHex = (value: unknown) => (typeof value === 'string' ? normalHex(value) : null)

// A trace's own colour, where it has one that is the colour it shows.
function ownColour(trace: Trace): string | null {
  if (trace.strokeData) return null
  if (isPathTrace(trace)) return asHex(shownValue(trace, 'shapeOutlineColor'))
  if (trace.type === 'shape') return asHex(shownValue(trace, 'shapeColor'))
  if (trace.type === 'audio') return asHex(trace.shapeColor ?? trace.borderColor)
  if (trace.type === 'text') return asHex(shownValue(trace, 'textColor'))
  if (trace.type === 'frame') return asHex(trace.borderColor ?? borderColourOf('frame'))
  return null
}

// The pixel under (x, y) of a picture or video drawn in `el` with object-fit:
// contain, as traces draw theirs.
async function pixelOf(el: HTMLImageElement | HTMLVideoElement, x: number, y: number): Promise<string | null> {
  const image = el instanceof HTMLImageElement
  const naturalW = image ? el.naturalWidth : el.videoWidth
  const naturalH = image ? el.naturalHeight : el.videoHeight
  if (!naturalW || !naturalH) return null
  const box = el.getBoundingClientRect()
  const scale = Math.min(box.width / naturalW, box.height / naturalH)
  const px = (x - box.left - (box.width - naturalW * scale) / 2) / scale
  const py = (y - box.top - (box.height - naturalH * scale) / 2) / scale
  if (px < 0 || py < 0 || px >= naturalW || py >= naturalH) return null
  let source: CanvasImageSource = el
  if (image && el.crossOrigin !== 'anonymous') {
    // What's on screen wasn't asked for with CORS, so can't be read: a copy
    // that is (the browser's cache usually has it).
    const copy = new Image()
    copy.crossOrigin = 'anonymous'
    copy.src = el.currentSrc || el.src
    await copy.decode()
    source = copy
  }
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.drawImage(source, Math.floor(px), Math.floor(py), 1, 1, 0, 0, 1, 1)
  // Throws for a picture from a site that doesn't allow reading it.
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data
  return hexOf(r, g, b)
}

export async function colourAt(x: number, y: number, traces: Trace[]): Promise<Picked> {
  const host = document.elementsFromPoint(x, y)
    .map(el => el.closest<HTMLElement>('[data-trace-element][data-trace-id]'))
    .find((el): el is HTMLElement => !!el)
  const trace = host && traces.find(t => t.id === host.dataset.traceId)
  if (!host || !trace) return { problem: 'nothing' }
  const own = ownColour(trace)
  if (own) return { colour: own }
  const media = host.querySelector<HTMLImageElement | HTMLVideoElement>('img, video')
  if (!media) return { problem: 'unreadable' }
  try {
    const colour = await pixelOf(media, x, y)
    return colour ? { colour } : { problem: 'nothing' }
  } catch {
    return { problem: 'unreadable' }
  }
}

/** The browser's own picker (Chrome, Edge): any pixel on screen. Not the desktop's:
 *  WebView2 has it, and its picker never opens -- nothing happened. */
export const hasNativePicker = () => !isDesktop && typeof window !== 'undefined' && 'EyeDropper' in window
export async function nativePick(): Promise<string | null> {
  try {
    const picker = new (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper()
    const { sRGBHex } = await picker.open()
    return normalHex(sRGBHex)
  } catch {
    // Escaped, or not allowed.
    return null
  }
}

/** A colour picked off the atrium, where there's no picker of the browser's: the
 *  next press takes the colour under it (colourAt) -- the pointer a dropper till
 *  then, over everything (a popover, in the top layer). Null if it's escaped, or
 *  there's nothing there (said). */
export function pickOnAtrium(): Promise<string | null> {
  return new Promise(resolve => {
    const layer = document.createElement('div')
    layer.dataset.picking = ''
    layer.className = 'pick-layer'
    const hint = document.createElement('div')
    hint.className = 'pick-hint'
    hint.textContent = t('atrium.palette.pickHint')
    layer.append(hint)
    const done = (colour: string | null) => {
      window.removeEventListener('keydown', key, true)
      layer.remove()
      resolve(colour)
    }
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      done(null)
    }
    layer.addEventListener('pointerdown', event => {
      event.preventDefault()
      event.stopPropagation()
      layer.remove()
      void colourAt(event.clientX, event.clientY, useGameStore.getState().traces).then(picked => {
        if ('colour' in picked) return done(picked.colour)
        showToast(t(picked.problem === 'unreadable' ? 'atrium.palette.unreadable' : 'atrium.palette.nothing'))
        done(null)
      })
    })
    window.addEventListener('keydown', key, true)
    document.body.append(layer)
    try { layer.setAttribute('popover', 'manual'); layer.showPopover() } catch { /* fixed over the page, then */ }
  })
}

/** A colour from wherever one can be picked here: the browser's picker, else the atrium. */
export const pickColour = (): Promise<string | null> => (hasNativePicker() ? nativePick() : pickOnAtrium())

/** A colour into the palette, saying how it went. */
export function takeColour(colour: string) {
  const hex = normalHex(colour)
  if (!hex) return
  if (paletteNow().includes(hex)) { showToast(t('atrium.palette.already', { hex })); return }
  showToast(addColour(hex) === null ? t('atrium.palette.full') : t('atrium.palette.added', { hex }))
}

/** The colour under (x, y) into the palette (the I key, the dropper). */
export async function takeColourAt(x: number, y: number, traces: Trace[]) {
  const picked = await colourAt(x, y, traces)
  if ('colour' in picked) {
    takeColour(picked.colour)
    count('colours')
  }
  else showToast(t(picked.problem === 'unreadable' ? 'atrium.palette.unreadable' : 'atrium.palette.nothing'))
}
