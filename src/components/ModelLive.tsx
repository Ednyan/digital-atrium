// A 3D model trace opened (lib/model3d): the model itself in its box, turned by
// dragging and brought nearer by scrolling, over nothing -- what's behind it
// shows through, as through its still. One at a time: a browser keeps only so
// many live 3D views, and the rest of the atrium needs none.
//
// Let go (Done, Escape, a press anywhere else), a view that changed is drawn as
// a new still and handed back (onDone), to be kept as the trace's picture.

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { Trace } from '../types/database'
import { DEFAULT_VIEW, makeStage, parseModel, sameView, stillSize, STILL_SIDE, type ModelView, type Stage } from '../lib/model3d'
import { fetchMedia } from '../lib/exportImage'
import { useTranslation } from '../lib/i18n'

// Its drawing's longer side at most, in pixels, however near the atrium is.
const MOST_PIXELS = 2048
const CHIP = 'pointer-events-auto h-7 px-2.5 border text-[11px] tracking-[0.12em] uppercase whitespace-nowrap transition-colors'

export default function ModelLive({ trace, scale, editable, style, onReady, onDone, onSnapshot }: {
  trace: Trace
  // Screen pixels to one of its box's: the atrium's zoom times the trace's own size.
  scale: number
  editable: boolean
  // The picture's crop and look, worn the same way.
  style?: CSSProperties
  onReady: () => void
  onDone: (turned: { png: Blob; view: ModelView } | null) => void
  onSnapshot?: (png: Blob) => void
}) {
  const { t } = useTranslation()
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const stage = useRef<Stage | null>(null)
  const controls = useRef<{ update(): void } | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | { error: string }>('loading')
  const started = useRef<ModelView>(trace.model?.view ?? DEFAULT_VIEW)

  // Its drawing as big as it's shown, no bigger than it need be.
  const fit = () => {
    const box = host.current, now = stage.current
    if (!box || !now || !box.clientWidth || !box.clientHeight) return
    const density = Math.max(0.01, scale) * (window.devicePixelRatio || 1)
    const shrink = Math.min(1, MOST_PIXELS / (Math.max(box.clientWidth, box.clientHeight) * density))
    now.setSize(Math.max(1, Math.round(box.clientWidth * density * shrink)), Math.max(1, Math.round(box.clientHeight * density * shrink)))
    now.render()
  }
  const fitRef = useRef(fit)
  fitRef.current = fit

  useEffect(() => {
    let live = true
    let made: Stage | null = null
    let orbit: { dispose(): void } | null = null
    void (async () => {
      try {
        const file = trace.imageUrl ? await fetchMedia(trace.imageUrl) : null
        if (!file) throw new Error(t('atrium.model.missing'))
        const object = await parseModel(await file.arrayBuffer(), trace.model!.format)
        if (!live || !canvas.current) return
        made = await makeStage(object, canvas.current)
        if (!live) { made.dispose(); return }
        stage.current = made
        fitRef.current()
        made.place(started.current)
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js')
        if (!live) return
        const turning = new OrbitControls(made.camera, canvas.current)
        turning.target.copy(made.center)
        turning.enablePan = false
        turning.minDistance = made.base() * 0.05
        turning.maxDistance = made.base() * 20
        const drawn = made
        turning.addEventListener('change', () => drawn.render())
        turning.update()
        orbit = turning
        controls.current = turning
        made.render()
        setStatus('ready')
        onReady()
      } catch (error) {
        if (live) setStatus({ error: error instanceof Error ? error.message : String(error) })
      }
    })()
    return () => {
      live = false
      orbit?.dispose()
      made?.dispose()
      stage.current = null
      controls.current = null
    }
    // One model a trace: what it's turned to is its own, from then on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trace.id, trace.imageUrl])

  useEffect(() => { fit() }, [scale, status])

  // Let go of, once.
  const finished = useRef(false)
  const finish = async () => {
    if (finished.current) return
    finished.current = true
    const now = stage.current, box = host.current
    const view = now?.viewNow()
    if (!editable || !now || !box || !view || sameView(view, started.current)) { onDone(null); return }
    const { width, height } = stillSize(box.clientWidth / box.clientHeight)
    try {
      onDone({ png: await now.picture(width, height), view })
    } catch {
      onDone(null)
    }
  }
  const finishRef = useRef(finish)
  finishRef.current = finish

  // Its buttons ride above its box on the screen, outside it -- a trace's box
  // clips what's in it -- the same size at any zoom, followed every frame.
  const bar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let frame = 0
    const follow = () => {
      const box = host.current, buttons = bar.current
      if (box && buttons) {
        const r = box.getBoundingClientRect()
        const above = r.top > buttons.offsetHeight + 16
        const right = Math.min(window.innerWidth - 8, Math.max(buttons.offsetWidth + 8, r.right))
        buttons.style.transform = `translate(${right - buttons.offsetWidth}px, ${above ? r.top - buttons.offsetHeight - 8 : Math.min(window.innerHeight - buttons.offsetHeight - 8, r.bottom + 8)}px)`
      }
      frame = requestAnimationFrame(follow)
    }
    follow()
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const box = host.current
    if (!box) return
    // Its own presses and scrolls are its: never the atrium's, to pan or zoom.
    const keep = (event: Event) => event.stopPropagation()
    box.addEventListener('wheel', keep)
    const away = (event: PointerEvent) => {
      const on = event.target as Node
      if (!box.contains(on) && !bar.current?.contains(on)) void finishRef.current()
    }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') void finishRef.current() }
    window.addEventListener('pointerdown', away, true)
    window.addEventListener('keydown', key, true)
    return () => {
      box.removeEventListener('wheel', keep)
      window.removeEventListener('pointerdown', away, true)
      window.removeEventListener('keydown', key, true)
    }
  }, [])

  const reset = () => {
    const now = stage.current
    if (!now) return
    now.place(now.framed(DEFAULT_VIEW))
    controls.current?.update()
    now.render()
  }
  const snapshot = async () => {
    const now = stage.current, box = host.current
    if (!now || !box || !onSnapshot) return
    const { width, height } = stillSize(box.clientWidth / box.clientHeight, STILL_SIDE * 2)
    onSnapshot(await now.picture(width, height))
  }

  const ready = status === 'ready'
  const keep = (event: { stopPropagation(): void }) => event.stopPropagation()
  return (
    <div
      ref={host}
      data-model-live={trace.id}
      className="absolute inset-0"
      style={{ pointerEvents: 'auto', cursor: ready ? 'grab' : 'progress' }}
      onMouseDown={keep}
      onTouchStart={keep}
      onClick={keep}
      onDoubleClick={keep}
      onContextMenu={keep}
    >
      <canvas ref={canvas} className="absolute inset-0 w-full h-full" style={{ ...style, opacity: ready ? 1 : 0 }} />
      {createPortal(
      <div
        ref={bar}
        data-ui-element=""
        data-model-bar={trace.id}
        className="fixed left-0 top-0 flex items-center gap-1.5"
        style={{ zIndex: 'var(--layer-menu)', pointerEvents: 'none' }}
      >
        <span data-model-status="" className="px-2 h-7 flex items-center bg-nier-black/85 border border-nier-border/40 text-[11px] tracking-[0.08em] text-nier-bg/85 whitespace-nowrap">
          {status === 'loading' ? t('atrium.model.loading') : ready ? t('atrium.model.hint') : status.error}
        </span>
        {ready && editable && onSnapshot && (
          <button type="button" data-model-snapshot="" onClick={() => void snapshot()} className={`${CHIP} bg-nier-black/85 border-nier-border/50 text-nier-strong hover:border-nier-border`}>{t('atrium.model.snapshot')}</button>
        )}
        {ready && <button type="button" data-model-reset="" onClick={reset} className={`${CHIP} bg-nier-black/85 border-nier-border/50 text-nier-strong hover:border-nier-border`}>{t('atrium.model.reset')}</button>}
        <button type="button" data-model-done="" onClick={() => void finish()} className={`${CHIP} bg-nier-strong text-nier-black border-nier-strong`}>{t('atrium.model.done')}</button>
      </div>,
      document.body)}
    </div>
  )
}
