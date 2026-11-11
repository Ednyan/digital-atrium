// The palette (lib/palette), beside the view bar: a row of colours, and two
// more rows opened out. A colour pressed goes on what's selected -- a shape's
// fill, a line's, text's, a frame's border (TraceOverlay) -- or, with nothing
// selected that takes one, is copied as its code. An empty place, pressed,
// takes a colour chosen by hand; the dropper takes one off the canvas (in
// Chrome and Edge, off anything on screen). I, over the canvas, does the same
// where the pointer is (LobbyScene). A colour dragged goes to the place it's
// let go on, those between shifting along (lib/palette moveColour).

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from '../lib/i18n'
import { APPLY_COLOUR_EVENT, PALETTE_ROW, PALETTE_SIZE, moveColour, setColour, usePalette, type ApplyColour } from '../lib/palette'
import { hasNativePicker, pickColour, takeColour } from '../lib/eyedropper'
import { count } from '../lib/stats'
import { showToast } from '../lib/toast'
import { MenuIcon } from './AtriumMenu'
import { ColourPopover } from './ColourPicker'

const DROPPER = 'M11 7l6 6M4 16l11.7 -11.7a1 1 0 0 1 1.4 0l2.6 2.6a1 1 0 0 1 0 1.4l-11.7 11.7h-4v-4z'
const MORE = 'M6 9l6 6l6 -6'

export default function PalettePanel({ open }: { open: boolean }) {
  const { t } = useTranslation()
  const slots = usePalette()
  const [more, setMore] = useState(false)
  const [picking, setPicking] = useState(false)
  // The place a colour is being chosen for, and the swatch the picker hangs from.
  const [choosing, setChoosing] = useState<{ index: number; anchor: HTMLElement } | null>(null)
  const root = useRef<HTMLDivElement>(null)
  // A colour being dragged to another place: which, where the pointer is, and the place under it.
  const [dragging, setDragging] = useState<{ from: number; colour: string; x: number; y: number; over: number | null } | null>(null)
  // A drag just ended: the click it ends with isn't a click on the colour.
  const justDragged = useRef(false)
  // The place under (x, y), by the swatches' own boxes (the pointer's element is the one dragged).
  const placeAt = (x: number, y: number): number | null => {
    for (const el of root.current?.querySelectorAll<HTMLElement>('[data-palette-slot]') ?? []) {
      // The two more rows, folded away, are clipped, not gone: only places that show.
      if (!more && Number(el.dataset.paletteSlot) >= PALETTE_ROW) continue
      const r = el.getBoundingClientRect()
      if (r.width && x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2) return Number(el.dataset.paletteSlot)
    }
    return null
  }
  // Pressed on a colour: past a few pixels it's a drag, followed on the window
  // (pointer capture on a swatch didn't hold through the panel's re-render).
  const press = (index: number, colour: string, event: React.PointerEvent) => {
    if (event.button !== 0) return
    const from = { x: event.clientX, y: event.clientY }
    let moving = false
    const move = (e: PointerEvent) => {
      if (!moving && Math.hypot(e.clientX - from.x, e.clientY - from.y) < 5) return
      moving = true
      setDragging({ from: index, colour, x: e.clientX, y: e.clientY, over: placeAt(e.clientX, e.clientY) })
    }
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (!moving) return
      justDragged.current = true
      window.setTimeout(() => { justDragged.current = false }, 0)
      const to = placeAt(e.clientX, e.clientY)
      setDragging(null)
      if (to !== null && to !== index) moveColour(index, to)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  // Closed, it's still there for its slide: out of reach of Tab and readers.
  useEffect(() => { if (root.current) root.current.inert = !open }, [open])

  const use = (colour: string) => {
    if (justDragged.current) return
    const ask: ApplyColour = { colour, applied: false }
    window.dispatchEvent(new CustomEvent(APPLY_COLOUR_EVENT, { detail: ask }))
    if (ask.applied) return
    void navigator.clipboard?.writeText(colour).then(
      () => showToast(t('atrium.palette.copied', { hex: colour })),
      () => showToast(colour),
    )
  }
  const choose = (index: number) => {
    const anchor = root.current?.querySelector<HTMLElement>(`[data-palette-slot="${index}"]`)
    if (anchor) setChoosing({ index, anchor })
  }
  // The browser's picker, or a press on the atrium (lib/eyedropper): lit till it's done.
  const drop = async () => {
    if (picking) return
    setPicking(true)
    const colour = await pickColour()
    setPicking(false)
    if (!colour) return
    takeColour(colour)
    count('colours')
  }

  const swatch = (index: number) => {
    const colour = slots[index]
    if (!colour) {
      return (
        <button
          key={index}
          type="button"
          data-palette-slot={index}
          onClick={() => { if (!justDragged.current) choose(index) }}
          title={t('atrium.palette.add')}
          aria-label={t('atrium.palette.add')}
          className={`group relative w-9 h-9 border border-dashed transition-colors ${dragging?.over === index ? 'border-nier-strong' : 'border-nier-border/40 hover:border-nier-border/80'}`}
        >
          <svg className="absolute inset-0 w-full h-full text-nier-border/40 group-hover:opacity-0 transition-opacity" preserveAspectRatio="none" viewBox="0 0 100 100" aria-hidden="true">
            <line x1="0" y1="100" x2="100" y2="0" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-nier-strong text-base opacity-0 group-hover:opacity-100 transition-opacity">+</span>
        </button>
      )
    }
    return (
      <div key={index} className="group relative">
        <button
          type="button"
          data-palette-colour={colour}
          data-palette-slot={index}
          onPointerDown={event => press(index, colour, event)}
          onClick={() => use(colour)}
          onContextMenu={e => { e.preventDefault(); choose(index) }}
          title={t('atrium.palette.swatch', { hex: colour })}
          aria-label={t('atrium.palette.swatch', { hex: colour })}
          className={`block w-9 h-9 border p-[3px] transition-colors touch-none ${dragging?.over === index && dragging.from !== index ? 'border-nier-strong outline outline-1 outline-nier-strong' : 'border-nier-border/40 hover:border-nier-bg/80'} ${dragging?.from === index ? 'opacity-30' : ''}`}
        >
          <span className="block w-full h-full" style={{ backgroundColor: colour }} />
        </button>
        <button
          type="button"
          onClick={() => setColour(index, null)}
          title={t('atrium.palette.remove')}
          aria-label={t('atrium.palette.remove')}
          className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center text-[10px] leading-none border border-nier-border/60 text-nier-bg opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
          style={{ backgroundColor: 'rgb(var(--c-ground))' }}
        >
          ×
        </button>
      </div>
    )
  }

  return (
    <div
      ref={root}
      data-palette=""
      data-hud="true"
      aria-hidden={!open}
      className="flex items-start gap-1 p-1 border border-nier-border/40 font-mono pointer-events-auto"
      style={{ backgroundColor: 'rgb(var(--c-ground) / 0.92)' }}
    >
      <div>
        <div className="grid grid-cols-6 gap-1">
          {Array.from({ length: PALETTE_ROW }, (_, i) => swatch(i))}
        </div>
        {/* Two more rows, opened out below. */}
        <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: more ? '1fr' : '0fr' }}>
          <div className="min-h-0 overflow-hidden">
            <div className="grid grid-cols-6 gap-1 pt-1">
              {Array.from({ length: PALETTE_SIZE - PALETTE_ROW }, (_, i) => swatch(PALETTE_ROW + i))}
            </div>
          </div>
        </div>
      </div>
      <div className="flex gap-1 pl-1 border-l border-nier-border/30">
        <button
          type="button"
          data-palette-dropper=""
          onClick={() => void drop()}
          aria-pressed={picking}
          title={hasNativePicker() ? t('atrium.palette.pickAnywhere') : t('atrium.palette.pick')}
          aria-label={t('atrium.palette.pick')}
          className={`w-9 h-9 flex items-center justify-center border transition-colors ${
            picking ? 'bg-nier-bg text-nier-black border-nier-bg' : 'bg-transparent text-nier-bg/80 border-transparent hover:border-nier-border/60 hover:text-nier-bg'
          }`}
        >
          <MenuIcon d={DROPPER} size={18} />
        </button>
        <button
          type="button"
          data-palette-more=""
          onClick={() => setMore(on => !on)}
          aria-expanded={more}
          title={more ? t('atrium.palette.fewer') : t('atrium.palette.more')}
          aria-label={more ? t('atrium.palette.fewer') : t('atrium.palette.more')}
          className="w-9 h-9 flex items-center justify-center border bg-transparent text-nier-bg/80 border-transparent hover:border-nier-border/60 hover:text-nier-bg transition-colors"
        >
          <span className={`transition-transform duration-300 ${more ? 'rotate-180' : ''}`}><MenuIcon d={MORE} size={18} /></span>
        </button>
      </div>
      {/* The colour being dragged, under the pointer: over everything, so outside the panel. */}
      {dragging && createPortal(
        <div
          aria-hidden="true"
          data-palette-dragging=""
          className="fixed z-[var(--layer-menu)] w-9 h-9 p-[3px] border border-nier-strong pointer-events-none shadow-2xl"
          style={{ left: dragging.x - 18, top: dragging.y - 18, backgroundColor: 'rgb(var(--c-ground))' }}
        >
          <span className="block w-full h-full" style={{ backgroundColor: dragging.colour }} />
        </div>,
        document.body,
      )}
      {/* The picker (ColourPicker), for an empty place, or a colour
          right-clicked to change it. */}
      {choosing && (
        <ColourPopover
          anchor={choosing.anchor}
          value={slots[choosing.index] ?? '#ffffff'}
          onChange={colour => setColour(choosing.index, colour)}
          onClose={() => setChoosing(null)}
        />
      )}
    </div>
  )
}
