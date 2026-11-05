// A template made, shown off as a prize is (the user's idea, 2026-11-05, after gacha
// pulls): a sealed card comes down and gathers light, bursts and turns over to show
// it -- its picture, its name, what's in it. Gold, always: it's their own, the rarest
// there is. Any press skips to the end, Done lets it go. Shown still with reduced
// motion; not at all when turned off in Profile (store templateReveal).

import { useEffect, useRef, useState } from 'react'
import { tCount, useTranslation } from '../lib/i18n'

const GATHER_MS = 1350
const MARK = { WebkitMaskImage: 'url(/atrium-mark.png)', maskImage: 'url(/atrium-mark.png)', WebkitMaskSize: 'contain', maskSize: 'contain', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat', WebkitMaskPosition: 'center', maskPosition: 'center' } as const

export default function TemplateReveal({ name, picture, traces, values, onDone }: {
  name: string; picture: Blob | null; traces: number; values: number; onDone: () => void
}) {
  const { t } = useTranslation()
  const box = useRef<HTMLDialogElement>(null)
  const sky = useRef<HTMLCanvasElement>(null)
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const [open, setOpen] = useState(still)
  const [src] = useState(() => (picture ? URL.createObjectURL(picture) : null))
  useEffect(() => () => { if (src) URL.revokeObjectURL(src) }, [src])
  useEffect(() => { box.current?.showModal() }, [])
  // Gathered long enough: it opens.
  useEffect(() => {
    if (open) return
    const timer = setTimeout(() => setOpen(true), GATHER_MS)
    return () => clearTimeout(timer)
  }, [open])

  // Opened: sparks thrown out from the card, falling slow, gone in a few seconds.
  useEffect(() => {
    const canvas = sky.current
    if (!open || still || !canvas) return
    const ctx = canvas.getContext('2d')!
    const scale = Math.min(2, devicePixelRatio || 1)
    canvas.width = innerWidth * scale
    canvas.height = innerHeight * scale
    ctx.scale(scale, scale)
    const cx = innerWidth / 2, cy = innerHeight / 2
    const sparks = Array.from({ length: 140 }, () => {
      const angle = Math.random() * Math.PI * 2, speed = 2 + Math.random() * 9
      return { x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 2, size: 1 + Math.random() * 2.6, life: 0.6 + Math.random() * 0.9, hue: 38 + Math.random() * 16 }
    })
    let frame = 0, last = performance.now(), age = 0
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      age += dt
      ctx.clearRect(0, 0, innerWidth, innerHeight)
      ctx.globalCompositeOperation = 'lighter'
      let alive = 0
      for (const s of sparks) {
        const left = 1 - age / (s.life * 3)
        if (left <= 0) continue
        alive++
        s.vx *= 0.97; s.vy = s.vy * 0.97 + 0.12
        s.x += s.vx; s.y += s.vy
        ctx.fillStyle = `hsla(${s.hue}, 95%, 68%, ${left})`
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.size * (0.6 + left * 0.6), 0, Math.PI * 2)
        ctx.fill()
      }
      if (alive) frame = requestAnimationFrame(tick)
      else ctx.clearRect(0, 0, innerWidth, innerHeight)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
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
          <div className="template-reveal-back" aria-hidden="true">
            <span className="template-reveal-mark" style={MARK} />
          </div>
          <div className="template-reveal-front">
            <div className="template-reveal-picture">
              {src ? <img src={src} alt="" /> : <span className="template-reveal-mark" style={MARK} />}
            </div>
            <div className="template-reveal-words">
              <span className="template-reveal-eyebrow">{t('templates.revealTitle')}</span>
              <b data-template-reveal-name="">{name}</b>
              <span>{tCount('templates.revealTraces', traces)} · {tCount('templates.revealValues', values)}</span>
            </div>
          </div>
        </div>
        <button type="button" data-template-reveal-done="" onClick={done} className="template-reveal-done atrium-btn cut-corner">
          {t('templates.revealDone')}
        </button>
      </div>
    </dialog>
  )
}
