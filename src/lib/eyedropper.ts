// A colour off the screen, for the palette (lib/palette): what's drawn under
// a point, as it looks there (lib/colourAt) -- or, in Chrome and Edge, by the
// browser's own picker (nativePick), which reads any pixel on screen. The
// desktop app's webview has that picker too, and it opens nothing: there, as
// where there's none, the atrium is picked from (pickOnAtrium).

import { isDesktop } from './supabase'
import { addColour, normalHex, paletteNow } from './palette'
import { colourAt } from './colourAt'
import { showToast } from './toast'
import { t } from './i18n'

import { count } from './stats'

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
    // What a press brings after it, kept from the atrium (the press itself: `press`).
    const PRESS = ['mousedown', 'pointerup', 'mouseup', 'click'] as const
    const swallow = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation() }
    const done = (colour: string | null) => {
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('pointerdown', press, true)
      layer.remove()
      delete document.documentElement.dataset.pickingColour
      // What the press brings after it is still on its way: kept out a moment more.
      window.setTimeout(() => { for (const kind of PRESS) window.removeEventListener(kind, swallow, true) }, 400)
      resolve(colour)
    }
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      done(null)
    }
    // At the window, first: the atrium may hold the pointer (lib TraceOverlay
    // holdPointer), and a browser that honours it hands it the press, not this.
    const press = (event: PointerEvent) => {
      swallow(event)
      layer.remove()
      void colourAt(event.clientX, event.clientY).then(picked => {
        if ('colour' in picked) return done(picked.colour)
        showToast(t(picked.problem === 'unreadable' ? 'atrium.palette.unreadable' : 'atrium.palette.nothing'))
        done(null)
      })
    }
    const scene = document.querySelector<HTMLElement>('.lobby-scene')
    try { if (scene?.hasPointerCapture(1)) scene.releasePointerCapture(1) } catch { /* nothing held */ }
    for (const kind of PRESS) window.addEventListener(kind, swallow, true)
    window.addEventListener('pointerdown', press, true)
    window.addEventListener('keydown', key, true)
    // The atrium's own cursor kept out of it: only the dropper shows (index.css).
    document.documentElement.dataset.pickingColour = ''
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
export async function takeColourAt(x: number, y: number) {
  const picked = await colourAt(x, y)
  if ('colour' in picked) {
    takeColour(picked.colour)
    count('colours')
  }
  else showToast(t(picked.problem === 'unreadable' ? 'atrium.palette.unreadable' : 'atrium.palette.nothing'))
}
