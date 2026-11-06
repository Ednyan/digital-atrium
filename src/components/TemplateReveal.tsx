// A template made, shown off as a prize is (the user's idea, 2026-11-05, after gacha
// pulls): its own traces, scattered around the screen, are pulled together one after
// another as by a magnet -- slow to start, snapping home faster and faster, each
// landing with sparks along its seams and a thump -- and the last one lands with an
// impact frame, a flash, rays and a burst, and it's shown: its picture, its name,
// what's in it. Gold, always: it's their own, the rarest there is. Any press skips
// to the end, Done lets it go. Shown still with reduced motion; not at all when
// turned off in Profile (store templateReveal).

import { useEffect, useRef, useState } from 'react'
import { tCount, useTranslation } from '../lib/i18n'
import { drawRanks } from '../lib/order'
import { isSlot } from '../lib/frames'
import type { ExportResult } from '../lib/exportImage'
import type { Layer, Trace } from '../types/database'

const APPEAR_MS = 320
const PULL_MS = 260
const SETTLE_MS = 160
const MARK = { WebkitMaskImage: 'url(/atrium-mark.png)', maskImage: 'url(/atrium-mark.png)', WebkitMaskSize: 'contain', maskSize: 'contain', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat', WebkitMaskPosition: 'center', maskPosition: 'center' } as const

// The template's picture, and each of its traces drawn alone at the same scale --
// where it lies in that picture, in pixels -- bottom first, as they're drawn.
export interface Assembly { width: number; height: number; pieces: { src: Blob; x: number; y: number; w: number; h: number }[] }

/** The pieces of `whole` (exportImage of `traces`), for the reveal to pull together. */
export async function assemblyOf(traces: Trace[], layers: Layer[], whole: ExportResult, background: string): Promise<Assembly> {
  const { exportImage } = await import('../lib/exportImage')
  const ranks = drawRanks(traces, layers)
  // A slot holding something is drawn as nothing (lib/frames slotLook).
  const filled = new Set(traces.flatMap(t => (t.frameId ? [t.frameId] : [])))
  const shown = traces.filter(t => !(isSlot(t) && filled.has(t.id))).sort((a, b) => (ranks.get(a.id) ?? 0) - (ranks.get(b.id) ?? 0))
  const pieces = await Promise.all(shown.map(trace =>
    exportImage([trace], [], layers, { format: 'png', scale: whole.scale, background, clear: true, type: 'image/webp', quality: 0.9 })
      .then(made => ({ src: made.blob, x: (made.x - whole.x) * whole.scale, y: (made.y - whole.y) * whole.scale, w: made.width, h: made.height }))
      .catch(() => null)))
  return { width: whole.width, height: whole.height, pieces: pieces.filter(piece => piece !== null) }
}

// When each piece is pulled in: the cascade quickens, as a magnet's pull grows near.
const pullAt = (i: number, n: number) => APPEAR_MS + Math.min(1100, Math.max(380, n * 85)) * (n > 1 ? Math.pow(i / (n - 1), 0.62) : 0)

interface Spark { x: number; y: number; vx: number; vy: number; size: number; life: number; age: number; hue: number; fall: number }

export default function TemplateReveal({ name, picture, assembly, traces, values, onDone }: {
  name: string; picture: Blob | null; assembly: Assembly | null; traces: number; values: number; onDone: () => void
}) {
  const { t } = useTranslation()
  const box = useRef<HTMLDialogElement>(null)
  const sky = useRef<HTMLCanvasElement>(null)
  const held = useRef<HTMLDivElement>(null)
  const pieceEls = useRef<(HTMLImageElement | null)[]>([])
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const pieces = still ? [] : assembly?.pieces ?? []
  const [open, setOpen] = useState(still)
  const [src] = useState(() => (picture ? URL.createObjectURL(picture) : null))
  const [pieceSrcs] = useState(() => pieces.map(piece => URL.createObjectURL(piece.src)))
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); pieceSrcs.forEach(url => URL.revokeObjectURL(url)) }, [src, pieceSrcs])
  useEffect(() => { box.current?.showModal() }, [])

  // The picture's place: as big as fits, its own shape.
  const [size] = useState(() => {
    const width = assembly?.width || 4, height = assembly?.height || 3
    const fit = Math.min(Math.min(520, innerWidth * 0.86) / width, Math.min(innerHeight * 0.5, 440) / height)
    return { fit, w: width * fit, h: height * fit }
  })
  // Where each piece starts: out from the middle the way it lies, turned and
  // smaller, kept on the screen. When it's pulled.
  const [flights] = useState(() => pieces.map((piece, i) => {
    const cx = (piece.x + piece.w / 2) * size.fit - size.w / 2, cy = (piece.y + piece.h / 2) * size.fit - size.h / 2
    const angle = (Math.hypot(cx, cy) < 8 ? Math.random() * Math.PI * 2 : Math.atan2(cy, cx)) + (Math.random() - 0.5) * 1.1
    const reach = (0.3 + Math.random() * 0.2) * Math.min(innerWidth, innerHeight)
    const room = { x: innerWidth / 2 - 40, y: innerHeight / 2 - 40 }
    const clamp = (v: number, most: number) => Math.max(-most, Math.min(most, v))
    return {
      dx: clamp(cx + Math.cos(angle) * reach, room.x) - cx,
      dy: clamp(cy + Math.sin(angle) * reach, room.y) - cy,
      turn: (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 30),
      scale: 0.72 + Math.random() * 0.2,
      appear: 80 + Math.random() * 220,
      at: pullAt(i, pieces.length),
    }
  }))

  // Sparks, and the light they leave: thrown where pieces meet, and out of the
  // middle as it opens.
  const sparks = useRef<Spark[]>([])
  const throwSparks = (x: number, y: number, count: number, speed: number, fall = 0.12) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.7)
      sparks.current.push({ x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v - speed * 0.15, size: 0.8 + Math.random() * 2.2, life: 0.35 + Math.random() * 0.6, age: 0, hue: 38 + Math.random() * 16, fall })
    }
  }
  useEffect(() => {
    const canvas = sky.current
    if (still || !canvas) return
    const ctx = canvas.getContext('2d')!
    const scale = Math.min(2, devicePixelRatio || 1)
    canvas.width = innerWidth * scale
    canvas.height = innerHeight * scale
    ctx.scale(scale, scale)
    let frame = 0, last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      ctx.clearRect(0, 0, innerWidth, innerHeight)
      ctx.globalCompositeOperation = 'lighter'
      sparks.current = sparks.current.filter(s => (s.age += dt) < s.life * 3)
      for (const s of sparks.current) {
        const left = 1 - s.age / (s.life * 3)
        s.vx *= 0.97; s.vy = s.vy * 0.97 + s.fall
        s.x += s.vx; s.y += s.vy
        ctx.fillStyle = `hsla(${s.hue}, 95%, 68%, ${left})`
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.size * (0.6 + left * 0.6), 0, Math.PI * 2)
        ctx.fill()
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [still])

  // The pull: each piece drifts a little further out, then snaps home faster and
  // faster, a touch too far, and settles. Landing, it throws sparks from its
  // seams and jolts what's gathered; the last one opens it.
  const flying = useRef<Animation[]>([])
  const landings = useRef<number[]>([])
  useEffect(() => {
    if (still) return
    if (flights.length === 0) {
      const timer = setTimeout(() => setOpen(true), 450)
      return () => clearTimeout(timer)
    }
    const area = pieces.reduce((sum, piece) => sum + piece.w * piece.h, 0) || 1
    flights.forEach((f, i) => {
      const el = pieceEls.current[i]
      if (!el) return
      const total = f.at + PULL_MS + SETTLE_MS
      const at = (dx: number, dy: number, turn: number, scale: number) => `translate(${dx}px, ${dy}px) rotate(${turn}deg) scale(${scale})`
      flying.current.push(el.animate([
        { offset: 0, transform: at(f.dx * 0.85, f.dy * 0.85, f.turn * 0.6, f.scale * 0.4), opacity: 0, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
        { offset: f.appear / total, transform: at(f.dx, f.dy, f.turn, f.scale), opacity: 1, easing: 'ease-in-out' },
        { offset: f.at / total, transform: at(f.dx * 1.08, f.dy * 1.08, f.turn * 1.2, f.scale), opacity: 1, easing: 'cubic-bezier(0.6, 0, 1, 0.5)' },
        { offset: (f.at + PULL_MS) / total, transform: at(0, 0, 0, 1.06), opacity: 1, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
        { offset: 1, transform: at(0, 0, 0, 1), opacity: 1 },
      ], { duration: total, fill: 'both' }))
      landings.current.push(window.setTimeout(() => {
        const r = el.getBoundingClientRect()
        const share = (pieces[i].w * pieces[i].h) / area
        // Along its seams: the more edge, the more sparks.
        const along = Math.min(28, 6 + Math.round((r.width + r.height) / 40))
        for (let k = 0; k < along; k++) {
          const side = Math.random() * 2 * (r.width + r.height)
          const x = side < r.width ? r.x + side : side < r.width * 2 ? r.x + side - r.width : side < r.width * 2 + r.height ? r.x : r.right
          const y = side < r.width ? r.y : side < r.width * 2 ? r.bottom : side < r.width * 2 + r.height ? r.y + side - r.width * 2 : r.y + side - r.width * 2 - r.height
          throwSparks(x, y, 1, 3.5, 0.08)
        }
        const jolt = 1.5 + Math.min(5, share * 14)
        held.current?.animate([{ translate: '0 0' }, { translate: `${(Math.random() - 0.5) * 2 * jolt}px ${jolt}px` }, { translate: '0 0' }], { duration: 120, easing: 'ease-out' })
      }, f.at + PULL_MS))
    })
    const last = Math.max(...flights.map(f => f.at)) + PULL_MS + 90
    landings.current.push(window.setTimeout(() => setOpen(true), last))
    return () => {
      landings.current.forEach(clearTimeout)
      flying.current.forEach(anim => anim.cancel())
      landings.current = []
      flying.current = []
    }
  }, [])

  // Opened -- by the last piece, or a press that skips there: all of it home at
  // once, and the burst.
  useEffect(() => {
    if (!open || still) return
    landings.current.forEach(clearTimeout)
    flying.current.forEach(anim => anim.finish())
    throwSparks(innerWidth / 2, innerHeight / 2 - 40, 150, 11)
  }, [open, still])

  const done = () => { box.current?.close(); onDone() }
  return (
    <dialog
      ref={box}
      data-template-reveal=""
      data-open={open ? '' : undefined}
      aria-label={t('templates.revealTitle')}
      onCancel={event => { event.preventDefault(); if (open) done(); else setOpen(true) }}
      // Any press before it's open: straight to it.
      onPointerDown={() => { if (!open) setOpen(true) }}
      className="template-reveal"
    >
      <canvas ref={sky} aria-hidden="true" className="template-reveal-sky" />
      <div className="template-reveal-stage">
        <div aria-hidden="true" className="template-reveal-rays" />
        <div className="template-reveal-card">
          <div ref={held} className="template-reveal-held">
            <div className="template-reveal-picture" style={{ width: size.w, height: size.h }}>
              {pieceSrcs.map((url, i) => {
                const piece = pieces[i]
                return (
                  <img
                    key={i}
                    ref={el => { pieceEls.current[i] = el }}
                    src={url}
                    alt=""
                    data-template-piece=""
                    className="template-reveal-piece"
                    style={{ left: piece.x * size.fit, top: piece.y * size.fit, width: piece.w * size.fit, height: piece.h * size.fit }}
                  />
                )
              })}
              {src ? <img src={src} alt="" className="template-reveal-whole" /> : <span className="template-reveal-mark" style={MARK} />}
              <span aria-hidden="true" className="template-reveal-foil" />
            </div>
          </div>
          <div className="template-reveal-words">
            <span className="template-reveal-eyebrow">{t('templates.revealTitle')}</span>
            <b data-template-reveal-name="">{name}</b>
            <span>{tCount('templates.revealTraces', traces)} · {tCount('templates.revealValues', values)}</span>
          </div>
        </div>
        <button type="button" data-template-reveal-done="" onClick={done} className="template-reveal-done atrium-btn cut-corner">
          {t('templates.revealDone')}
        </button>
      </div>
      <div aria-hidden="true" className="template-reveal-impact" />
    </dialog>
  )
}
