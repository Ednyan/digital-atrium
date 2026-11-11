// The colour DRAWN under a point of the screen, as it looks there -- for the
// eyedropper (lib/eyedropper), the user's, 2026-11-10. It used to answer with
// a trace's own setting (a text's colour wherever on it the press fell, its
// background never; nothing for the room itself), and a picture's pixel read
// as if the picture were never turned, flipped or cropped.
//
// No browser but Chrome and Edge lets a page read the screen (eyedropper's
// nativePick), so what's there is worked out as the browser paints it: every
// element under the point, the topmost first, each giving what it draws
// there -- a letter's ink, a picture's, film's or canvas's pixel, a shape's
// outline or fill, a border, a background picture, a background colour --
// laid over one another with their opacity, till nothing shows through. The
// room's own canvas (its ground, grid and particles) is drawn again just
// before, so its pixels can be read (sceneRender). A picture from a site that
// doesn't allow reading, or an embedded page, still can't be read. Not drawn
// here: shadows and glows, gradients past their first colour, blend modes.

export type Picked = { colour: string } | { problem: 'unreadable' | 'nothing' }

/** The atrium's canvas drawn now (LobbyScene): a WebGL canvas can be read only in the turn it was drawn in. */
export const sceneRender: { now: (() => void) | null } = { now: null }

// Red, green, blue (0-255) and how solid (0-1).
type Rgba = [number, number, number, number]
type At = { x: number; y: number }

// One pixel to paint into and read back: any CSS colour, any picture's pixel, through any CSS filter.
let pixel: CanvasRenderingContext2D | null = null
function painted(paint: (context: CanvasRenderingContext2D) => void, filter = ''): Rgba {
  if (!pixel) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    pixel = canvas.getContext('2d', { willReadFrequently: true })
  }
  if (!pixel) return [0, 0, 0, 0]
  pixel.clearRect(0, 0, 1, 1)
  // Where the browser has it (not Safari): the look a trace is given is a filter.
  if ('filter' in pixel) pixel.filter = filter || 'none'
  paint(pixel)
  // Throws for a picture from a site that doesn't allow reading it.
  const [r, g, b, a] = pixel.getImageData(0, 0, 1, 1).data
  return [r, g, b, a / 255]
}
const colourOf = (css: string, filter = ''): Rgba =>
  (!css || css === 'none' || css === 'transparent' ? [0, 0, 0, 0] : painted(context => { context.fillStyle = css; context.fillRect(0, 0, 1, 1) }, filter))

// The filters `el` is seen through, its own first; a blur or a shadow says nothing of one pixel.
function filtersOn(el: Element): string {
  const all: string[] = []
  for (let node: Element | null = el; node; node = node.parentElement) {
    const filter = getComputedStyle(node).filter
    if (filter && filter !== 'none') all.push(filter.replace(/(blur|drop-shadow|url)\((?:[^()]|\([^()]*\))*\)/g, '').trim())
  }
  return all.filter(Boolean).join(' ')
}
const opacityOn = (el: Element): number => {
  let opacity = 1
  for (let node: Element | null = el; node; node = node.parentElement) opacity *= parseFloat(getComputedStyle(node).opacity || '1') || 0
  return opacity
}

// (x, y) of the screen in `el`'s own space, from its padding edge, whatever turns,
// flips, scales or moves it and what it's in: what a mouse event says of itself.
const PROBE = 'atrium-colour-probe'
function inside(el: Element, x: number, y: number): At | null {
  let at: At | null = null
  const read = (event: Event) => { at = { x: (event as MouseEvent).offsetX, y: (event as MouseEvent).offsetY } }
  el.addEventListener(PROBE, read)
  el.dispatchEvent(new MouseEvent(PROBE, { clientX: x, clientY: y }))
  el.removeEventListener(PROBE, read)
  const found = at as At | null
  return found && Number.isFinite(found.x) && Number.isFinite(found.y) ? found : null
}

// A picture readable: a copy asked for with CORS (the cache usually has it).
const copies = new Map<string, Promise<HTMLImageElement>>()
function readable(src: string): Promise<HTMLImageElement> {
  let copy = copies.get(src)
  if (!copy) {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.src = src
    copy = image.decode().then(() => image)
    copies.set(src, copy)
    if (copies.size > 24) copies.delete(copies.keys().next().value as string)
  }
  return copy
}

// The pixel of `source` (natural size nw x nh) shown at `at` of a w x h box it's fitted in as `fit` says.
function fitted(source: CanvasImageSource, nw: number, nh: number, w: number, h: number, fit: string, at: At, filter: string): Rgba | null {
  if (!nw || !nh || !w || !h) return null
  let sx = w / nw, sy = h / nh
  if (fit === 'contain' || fit === 'scale-down') sx = sy = Math.min(sx, sy, fit === 'scale-down' ? 1 : Infinity)
  else if (fit === 'cover') sx = sy = Math.max(sx, sy)
  else if (fit === 'none') sx = sy = 1
  const px = (at.x - (w - nw * sx) / 2) / sx
  const py = (at.y - (h - nh * sy) / 2) / sy
  if (px < 0 || py < 0 || px >= nw || py >= nh) return null
  // As much of it as one screen pixel shows: a picture drawn small is the mean of many.
  const rw = Math.max(1, 1 / sx), rh = Math.max(1, 1 / sy)
  return painted(context => context.drawImage(source, Math.max(0, px - rw / 2), Math.max(0, py - rh / 2), rw, rh, 0, 0, 1, 1), filter)
}

async function mediaAt(el: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement, x: number, y: number): Promise<Rgba | null> {
  const at = inside(el, x, y)
  if (!at) return null
  const style = getComputedStyle(el)
  const filter = filtersOn(el)
  if (el instanceof HTMLCanvasElement) return fitted(el, el.width, el.height, el.clientWidth, el.clientHeight, 'fill', at, filter)
  if (el instanceof HTMLVideoElement) return fitted(el, el.videoWidth, el.videoHeight, el.clientWidth, el.clientHeight, style.objectFit || 'contain', at, filter)
  const src = el.currentSrc || el.src
  const source = el.crossOrigin === 'anonymous' || /^(blob|data):/.test(src) ? el : await readable(src)
  return fitted(source, el.naturalWidth, el.naturalHeight, el.clientWidth, el.clientHeight, style.objectFit || 'fill', at, filter)
}

// Whether a letter's ink is at (x, y): the letter whose box holds the point,
// drawn alone as the element draws it and looked at where the point falls in
// it. Between letters, and in a letter's counters, there's none.
const DETAIL = 4
function inkAt(el: HTMLElement, x: number, y: number, style: CSSStyleDeclaration): boolean {
  const range = document.createRange()
  for (const node of el.childNodes) {
    if (node.nodeType !== Node.TEXT_NODE) continue
    const text = node.nodeValue ?? ''
    if (!text.trim() || text.length > 20_000) continue
    range.selectNodeContents(node)
    const all = range.getBoundingClientRect()
    if (x < all.left || x > all.right || y < all.top || y > all.bottom) continue
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i)
      if (code >= 0xdc00 && code <= 0xdfff) continue
      const length = code >= 0xd800 && code <= 0xdbff ? 2 : 1
      const letter = text.slice(i, i + length)
      if (!letter.trim()) continue
      range.setStart(node, i)
      range.setEnd(node, i + length)
      const box = [...range.getClientRects()].find(r => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)
      if (!box) continue
      const middle = inside(el, box.left + box.width / 2, box.top + box.height / 2)
      const at = inside(el, x, y)
      if (!middle || !at) continue
      const shown = style.textTransform === 'uppercase' ? letter.toUpperCase() : style.textTransform === 'lowercase' ? letter.toLowerCase() : letter
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) continue
      const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      context.font = font
      const measured = context.measureText(shown)
      const up = measured.fontBoundingBoxAscent ?? measured.actualBoundingBoxAscent
      const down = measured.fontBoundingBoxDescent ?? measured.actualBoundingBoxDescent
      const wide = measured.width
      if (!(wide > 0) || !(up + down > 0)) continue
      canvas.width = Math.ceil(wide * DETAIL) + 2
      canvas.height = Math.ceil((up + down) * DETAIL) + 2
      context.scale(DETAIL, DETAIL)
      context.font = font
      context.textBaseline = 'alphabetic'
      context.fillText(shown, 0, up)
      // The letter's box, in the element's space: about its middle.
      const px = Math.round((at.x - (middle.x - wide / 2)) * DETAIL)
      const py = Math.round((at.y - (middle.y - (up + down) / 2)) * DETAIL)
      if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue
      if (context.getImageData(px, py, 1, 1).data[3] > 90) return true
    }
  }
  return false
}

// A list in a computed style, split at its outer commas.
const listed = (value: string): string[] => {
  const parts: string[] = []
  let depth = 0, from = 0
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++
    else if (value[i] === ')') depth--
    else if (value[i] === ',' && depth === 0) { parts.push(value.slice(from, i).trim()); from = i + 1 }
  }
  parts.push(value.slice(from).trim())
  return parts
}
const nth = (list: string[], i: number) => list[i % list.length] ?? ''

// One layer of a background picture at `at`: a gradient by its first colour, a file by its pixel.
async function backgroundAt(el: HTMLElement, style: CSSStyleDeclaration, i: number, layer: string, at: At, filter: string): Promise<Rgba | null> {
  if (layer.includes('gradient(')) {
    const first = layer.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b|color\([^)]*\)/i)
    return first ? colourOf(first[0], filter) : null
  }
  const url = layer.match(/^url\(["']?(.*?)["']?\)$/)?.[1]
  if (!url) return null
  const image = await readable(url)
  const W = el.clientWidth, H = el.clientHeight
  const nw = image.naturalWidth, nh = image.naturalHeight
  if (!nw || !nh || !W || !H) return null
  const size = nth(listed(style.backgroundSize), i)
  let tw = nw, th = nh
  if (size === 'cover' || size === 'contain') {
    const scale = size === 'cover' ? Math.max(W / nw, H / nh) : Math.min(W / nw, H / nh)
    tw = nw * scale; th = nh * scale
  } else if (size && size !== 'auto') {
    const [a, b = 'auto'] = size.split(/\s+/)
    const length = (v: string, of: number) => (v.endsWith('%') ? (parseFloat(v) / 100) * of : parseFloat(v))
    if (a !== 'auto') tw = length(a, W)
    th = b !== 'auto' ? length(b, H) : a !== 'auto' ? (tw * nh) / nw : nh
    if (a === 'auto' && b !== 'auto') tw = (th * nw) / nh
  }
  if (!(tw > 0) || !(th > 0)) return null
  const [px = '0%', py = '0%'] = nth(listed(style.backgroundPosition), i).split(/\s+/)
  const start = (v: string, room: number) => (v.endsWith('%') ? (parseFloat(v) / 100) * room : parseFloat(v) || 0)
  let lx = at.x - start(px, W - tw), ly = at.y - start(py, H - th)
  if (nth(listed(style.backgroundRepeat), i).includes('no-repeat')) {
    if (lx < 0 || ly < 0 || lx >= tw || ly >= th) return null
  } else {
    lx = ((lx % tw) + tw) % tw
    ly = ((ly % th) + th) % th
  }
  return fitted(image, nw, nh, tw, th, 'fill', { x: lx, y: ly }, filter)
}

// Everything under (x, y), the topmost first -- what takes no presses too (most
// of what's drawn doesn't: pictures in their traces, the room's canvas).
function under(x: number, y: number): Element[] {
  const all = document.createElement('style')
  all.textContent = '* { pointer-events: auto !important; }'
  document.head.append(all)
  try {
    // Not one's own cursor, nor the layer a colour is picked through.
    return document.elementsFromPoint(x, y).filter(el => !el.closest('[data-own-cursor], [data-cursor-edge], [data-picking]'))
  } finally {
    all.remove()
  }
}

export async function colourAt(x: number, y: number): Promise<Picked> {
  sceneRender.now?.()
  // Laid over one another, the topmost first (premultiplied), till nothing shows through.
  let r = 0, g = 0, b = 0, a = 0
  const over = (colour: Rgba | null, opacity: number) => {
    if (!colour) return
    const solid = colour[3] * opacity * (1 - a)
    r += colour[0] * solid; g += colour[1] * solid; b += colour[2] * solid; a += solid
  }
  const SOLID = 0.995
  try {
    for (const el of under(x, y)) {
      if (a > SOLID) break
      const style = getComputedStyle(el)
      const opacity = opacityOn(el)
      if (opacity <= 0.004) continue
      if (el instanceof HTMLIFrameElement) return { problem: 'unreadable' }
      if (el instanceof SVGElement && !(el instanceof SVGSVGElement)) {
        if (!(el instanceof SVGGeometryElement)) {
          if (el.tagName === 'text' || el.tagName === 'tspan') over(colourOf(style.fill, filtersOn(el)), opacity * (parseFloat(style.fillOpacity) || 1))
          continue
        }
        const to = el.getScreenCTM()
        if (!to) continue
        const at = new DOMPoint(x, y).matrixTransform(to.inverse())
        const filter = filtersOn(el)
        const lined = style.stroke !== 'none' && !style.stroke.startsWith('url') && parseFloat(style.strokeWidth) > 0
        const filled = style.fill !== 'none' && !style.fill.startsWith('url')
        if (lined && el.isPointInStroke(at)) over(colourOf(style.stroke, filter), opacity * (parseFloat(style.strokeOpacity) || 1))
        if (filled && el.isPointInFill(at)) over(colourOf(style.fill, filter), opacity * (parseFloat(style.fillOpacity) || 1))
        continue
      }
      if (el instanceof HTMLImageElement || el instanceof HTMLVideoElement || el instanceof HTMLCanvasElement) over(await mediaAt(el, x, y), opacity)
      if (!(el instanceof HTMLElement)) continue
      const filter = filtersOn(el)
      if (inkAt(el, x, y, style)) over(colourOf(style.color, filter), opacity)
      if (a > SOLID) break
      const at = inside(el, x, y)
      if (at && style.display !== 'inline') {
        const side = at.y < 0 ? 'Top' : at.y >= el.clientHeight ? 'Bottom' : at.x < 0 ? 'Left' : at.x >= el.clientWidth ? 'Right' : null
        const border = style as unknown as Record<string, string>
        if (side && parseFloat(border[`border${side}Width`]) > 0 && !['none', 'hidden'].includes(border[`border${side}Style`])) {
          over(colourOf(border[`border${side}Color`], filter), opacity)
        }
      }
      if (at && style.backgroundImage && style.backgroundImage !== 'none') {
        const layers = listed(style.backgroundImage)
        for (let i = 0; i < layers.length && a <= SOLID; i++) over(await backgroundAt(el, style, i, layers[i], at, filter), opacity)
      }
      over(colourOf(style.backgroundColor, filter), opacity)
    }
  } catch {
    // A picture, film or background from a site that doesn't allow reading it.
    return { problem: 'unreadable' }
  }
  if (a < 0.02) return { problem: 'nothing' }
  const hex = (v: number) => Math.max(0, Math.min(255, Math.round(v / a))).toString(16).padStart(2, '0')
  return { colour: '#' + hex(r) + hex(g) + hex(b) }
}
