// The app's own colour picker, in place of the system's dialog (the user's,
// 2026-11-06: it looked out of date): a field of the hue's shades -- across from
// grey to full, up to light -- a strip of hues, its hex, and the eyedropper
// (lib/eyedropper). ColourPicker is the picker; ColourPopover, it hung from
// something on the page (in the top layer, over whatever panel it's in);
// ColourInput, a swatch that opens it -- for where a colour input was.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from '../lib/i18n'
import { hexToHsv, hsvToHex, type Hsv } from '../lib/colourSpace'
import { pickColour } from '../lib/eyedropper'

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
const HUES = 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)'
const EYEDROPPER = 'M11 7l6 6M4 16l11.7 -11.7a1 1 0 0 1 1.4 0l2.6 2.6a1 1 0 0 1 0 1.4l-11.7 11.7h-4v-4z'
const clamp = (n: number) => Math.min(1, Math.max(0, n))

/** `bare`: without its hex and eyedropper, where the row it opens from has them. */
export function ColourPicker({ value, onChange, bare = false }: { value: string; onChange: (hex: string) => void; bare?: boolean }) {
  const { t } = useTranslation()
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value))
  // Changed from outside (a swatch, the hex, an undo): followed -- keeping the
  // hue where a grey has none to read, so the strip doesn't jump to red.
  useEffect(() => {
    if (!HEX.test(value) || hsvToHex(hsv) === hsvToHex(hexToHsv(value))) return
    const next = hexToHsv(value)
    setHsv(was => (next.s === 0 || next.v === 0 ? { ...next, h: was.h } : next))
  }, [value])
  const set = (next: Hsv) => { setHsv(next); onChange(hsvToHex(next)) }

  // A press on the field or the strip, and the drag after it: the colour where the pointer is.
  const follow = (at: (x: number, y: number) => void) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const put = (ev: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect()
      at(clamp((ev.clientX - r.left) / r.width), clamp((ev.clientY - r.top) / r.height))
    }
    put(e)
    const move = (ev: PointerEvent) => put(ev)
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up) }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }
  // The arrows, a step at a time; with Shift, ten.
  const keys = (axes: (dx: number, dy: number) => void) => (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.01
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
    if (!d) return
    e.preventDefault()
    axes(d[0], d[1])
  }

  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  const commit = () => { if (HEX.test(draft)) set(hexToHsv(draft)); else setDraft(value) }
  const shown = hsvToHex(hsv)
  const thumb = 'absolute pointer-events-none border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.55),0_1px_3px_rgba(0,0,0,0.5)]'
  return (
    <div data-colour-picker="" className="space-y-2 select-none">
      <div
        data-colour-field=""
        role="slider"
        tabIndex={0}
        aria-label={t('atrium.colour.shade')}
        aria-valuetext={shown}
        onPointerDown={follow((x, y) => set({ ...hsv, s: x, v: 1 - y }))}
        onKeyDown={keys((dx, dy) => set({ ...hsv, s: clamp(hsv.s + dx), v: clamp(hsv.v - dy) }))}
        className="relative h-32 cursor-crosshair touch-none focus:outline-none focus-visible:ring-1 focus-visible:ring-nier-border"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${hsv.h} 100% 50%)` }}
      >
        <span className={`${thumb} w-3.5 h-3.5 rounded-full -translate-x-1/2 -translate-y-1/2`} style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: shown }} />
      </div>
      <div
        data-colour-hue=""
        role="slider"
        tabIndex={0}
        aria-label={t('atrium.colour.hue')}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        onPointerDown={follow(x => set({ ...hsv, h: x * 360 }))}
        onKeyDown={keys(dx => set({ ...hsv, h: (hsv.h + dx * 360 + 360) % 360 }))}
        className="relative h-3 cursor-pointer touch-none focus:outline-none focus-visible:ring-1 focus-visible:ring-nier-border"
        style={{ background: HUES }}
      >
        <span className={`${thumb} top-1/2 w-2 h-4 -translate-x-1/2 -translate-y-1/2`} style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: `hsl(${hsv.h} 100% 50%)` }} />
      </div>
      {!bare && (
        <div className="flex items-center gap-1.5">
          <span className="w-7 h-7 shrink-0 border border-nier-border/50" style={{ backgroundColor: shown }} />
          <input
            type="text"
            data-colour-hex=""
            value={draft}
            aria-label={t('atrium.colour.hex')}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') commit() }}
            className="flex-1 min-w-0 h-7 px-2 bg-nier-black border border-nier-border/30 text-nier-bg focus:outline-none focus:border-nier-border/60 font-mono text-xs uppercase"
          />
          <button
            type="button"
            onClick={async () => { const colour = await pickColour(); if (colour) set(hexToHsv(colour)) }}
            title={t('atrium.customize.pickColour')}
            aria-label={t('atrium.customize.pickColour')}
            className="w-7 h-7 shrink-0 flex items-center justify-center border border-nier-border/30 text-nier-bg hover:border-nier-border/60 hover:text-nier-strong transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={EYEDROPPER} /></svg>
          </button>
        </div>
      )}
    </div>
  )
}

const WIDTH = 236
/** The picker hung under `anchor` (over it, where there's no room below), in the
 *  top layer: a press elsewhere or Escape closes it. Where it's rendered in the
 *  page, though -- inside its panel, so a press on it is a press in the panel
 *  (nothing deselected, a hover menu kept open) -- and a click in it never
 *  works a <label> it's in. */
export function ColourPopover({ anchor, value, onChange, onClose }: { anchor: HTMLElement; value: string; onChange: (hex: string) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    el.setAttribute('popover', 'auto')
    try { el.showPopover() } catch { /* no top layer here: fixed over the page, then */ }
    const r = anchor.getBoundingClientRect(), h = el.offsetHeight
    const below = r.bottom + 6 + h <= window.innerHeight
    setAt({
      left: Math.max(8, Math.min(window.innerWidth - WIDTH - 8, r.left)),
      top: below ? r.bottom + 6 : Math.max(8, r.top - 6 - h),
    })
    const closed = (e: Event) => { if ((e as Event & { newState?: string }).newState === 'closed') onClose() }
    el.addEventListener('toggle', closed)
    return () => el.removeEventListener('toggle', closed)
  }, [anchor])
  const style: CSSProperties = {
    position: 'fixed', inset: 'auto', margin: 0, width: WIDTH, padding: 8,
    left: at?.left ?? -9999, top: at?.top ?? -9999,
    backgroundColor: 'rgb(var(--c-ground) / 0.98)', color: 'inherit', zIndex: 10000200,
  }
  return (
    <div ref={box} data-colour-popover="" data-ui-element="true" className="border border-nier-border/50 shadow-2xl font-mono" style={style} onWheel={e => e.stopPropagation()} onClick={e => e.preventDefault()}>
      <ColourPicker value={value} onChange={onChange} />
    </div>
  )
}

/** A swatch that opens the picker: where a colour input was. `onCommit`: the
 *  colour chosen, once it's closed -- for what's costly to do on every move. */
export function ColourInput({ value, onChange, onCommit, label, className, style, disabled, ...rest }: {
  value: string; onChange: (hex: string) => void; onCommit?: (hex: string) => void; label?: string; className?: string; style?: CSSProperties; disabled?: boolean
} & Record<`data-${string}`, string>) {
  const button = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const latest = useRef(value)
  latest.current = value
  const openedWith = useRef(value)
  // A press on the swatch while it's open closes it (a press elsewhere) before
  // the click would open it again.
  const closedAt = useRef(0)
  return (
    <>
      <button
        ref={button}
        type="button"
        {...rest}
        disabled={disabled}
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (performance.now() - closedAt.current < 250) return
          openedWith.current = value
          setOpen(was => !was)
        }}
        className={className}
        style={{ backgroundColor: HEX.test(value) ? value : 'transparent', ...style }}
      />
      {open && button.current && (
        <ColourPopover anchor={button.current} value={value} onChange={onChange} onClose={() => {
          closedAt.current = performance.now()
          setOpen(false)
          if (latest.current !== openedWith.current) onCommit?.(latest.current)
        }} />
      )}
    </>
  )
}
