// A 3D model trace opened (lib/model3d): the model itself in its box, turned by
// dragging and brought nearer by scrolling, over nothing -- what's behind it
// shows through, as through its still. One at a time: a browser keeps only so
// many live 3D views, and the rest of the atrium needs none.
//
// A model with a skeleton can be posed: Pose shows its joints; one clicked (or
// chosen from its list) is turned by a gizmo's rings. Reset pose puts it at rest.
//
// Let go (Done, Escape, a press anywhere else), a view or pose that changed is
// drawn as a new still and handed back (onDone), to be kept as the trace's picture.

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { Object3D } from 'three'
import type { Trace } from '../types/database'
import { DEFAULT_LOOK, DEFAULT_VIEW, makeStage, parseModel, sameView, stillSize, STILL_SIDE, type ModelPose, type ModelView, type Stage } from '../lib/model3d'
import { fetchMedia } from '../lib/exportImage'
import { useTranslation } from '../lib/i18n'

// Its drawing's longer side at most, in pixels, however near the atrium is.
const MOST_PIXELS = 2048
const CHIP = 'pointer-events-auto h-7 px-2.5 border text-[11px] tracking-[0.12em] uppercase whitespace-nowrap transition-colors'
const QUIET = `${CHIP} bg-nier-black/85 border-nier-border/50 text-nier-strong hover:border-nier-border`

// A moment of it: how it's seen, and how it's posed.
interface Moment { view: ModelView; pose?: ModelPose }
const samePose = (a?: ModelPose, b?: ModelPose) => {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])
  return [...keys].every(key => {
    const p = a?.[key], q = b?.[key]
    if (!p || !q) return false
    // q and -q are the same turn.
    return Math.abs(Math.abs(p[0] * q[0] + p[1] * q[1] + p[2] * q[2] + p[3] * q[3]) - 1) < 1e-6
  })
}
const sameMoment = (a: Moment, b: Moment) => sameView(a.view, b.view) && samePose(a.pose, b.pose)

// What posing shows over the model: its skeleton, a dot at each joint, the gizmo.
interface Posing {
  helpers: Object3D[]
  markers: Object3D[]
  gizmo: { attach(o: Object3D): void; detach(): void; dragging: boolean; axis: string | null; dispose(): void; enabled: boolean; addEventListener(type: string, listener: (e: any) => void): void }
  pick: (event: PointerEvent) => void
}

export default function ModelLive({ trace, scale, editable, style, onReady, onDone, onSnapshot }: {
  trace: Trace
  // Screen pixels to one of its box's: the atrium's zoom times the trace's own size.
  scale: number
  editable: boolean
  // The picture's crop and look, worn the same way.
  style?: CSSProperties
  onReady: () => void
  onDone: (turned: { png: Blob; view: ModelView; pose?: ModelPose } | null) => void
  onSnapshot?: (png: Blob) => void
}) {
  const { t } = useTranslation()
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const stage = useRef<Stage | null>(null)
  const controls = useRef<{ update(): void; enabled: boolean } | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | { error: string }>('loading')
  const started = useRef<Moment>({ view: trace.model?.view ?? DEFAULT_VIEW, pose: trace.model?.pose })
  // Its moments while it's open, each move let go of one: Ctrl+Z steps back
  // through them, Ctrl+Shift+Z (or Ctrl+Y) on again -- the atrium's own undo is Done's.
  const history = useRef<Moment[]>([])
  const future = useRef<Moment[]>([])
  const now = (): Moment | null => {
    const at = stage.current
    return at ? { view: at.viewNow(), pose: at.poseNow() } : null
  }
  const remember = () => {
    const moment = now()
    if (!moment || (history.current.length && sameMoment(history.current[history.current.length - 1], moment))) return
    history.current.push(moment)
    future.current = []
  }
  const look = trace.model?.look ?? DEFAULT_LOOK
  const lookKey = JSON.stringify(look)
  const [bones, setBones] = useState<string[]>([])
  const [posing, setPosing] = useState(false)
  const [chosen, setChosen] = useState<number | null>(null)
  const posingTools = useRef<Posing | null>(null)

  // Drawn, and where posing, its joints told where they are on the screen.
  const draw = () => {
    const at = stage.current, box = host.current
    if (!at) return
    at.render()
    if (!posingTools.current || !box || !canvas.current) return
    const r = canvas.current.getBoundingClientRect()
    box.dataset.modelJoints = JSON.stringify(at.bones.map(bone => {
      const p = bone.getWorldPosition(at.center.clone()).project(at.camera)
      return [Math.round(r.left + (p.x + 1) / 2 * r.width), Math.round(r.top + (1 - p.y) / 2 * r.height)]
    }))
  }
  const drawRef = useRef(draw)
  drawRef.current = draw

  // Its drawing as big as it's shown, no bigger than it need be.
  const fit = () => {
    const box = host.current, at = stage.current
    if (!box || !at || !box.clientWidth || !box.clientHeight) return
    const density = Math.max(0.01, scale) * (window.devicePixelRatio || 1)
    const shrink = Math.min(1, MOST_PIXELS / (Math.max(box.clientWidth, box.clientHeight) * density))
    at.setSize(Math.max(1, Math.round(box.clientWidth * density * shrink)), Math.max(1, Math.round(box.clientHeight * density * shrink)))
    draw()
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
        made.setLook(look)
        made.setPose(started.current.pose)
        made.place(started.current.view)
        history.current = [started.current]
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js')
        if (!live) return
        const turning = new OrbitControls(made.camera, canvas.current)
        // Turned about its stage's own point, which a pan moves (and the view keeps).
        turning.target = made.target
        turning.enablePan = true
        turning.minDistance = made.base() * 0.05
        turning.maxDistance = made.base() * 20
        turning.addEventListener('change', () => drawRef.current())
        turning.addEventListener('end', remember)
        turning.update()
        orbit = turning
        controls.current = turning
        setBones(made.bones.map((bone, i) => bone.name || `${i + 1}`))
        drawRef.current()
        setStatus('ready')
        onReady()
      } catch (error) {
        if (live) setStatus({ error: error instanceof Error ? error.message : String(error) })
      }
    })()
    return () => {
      live = false
      putAway()
      orbit?.dispose()
      made?.dispose()
      stage.current = null
      controls.current = null
    }
    // One model a trace: what it's turned to is its own, from then on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trace.id, trace.imageUrl])

  useEffect(() => { fit() }, [scale, status])
  useEffect(() => {
    stage.current?.setLook(look)
    draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookKey])

  // ---- Posing ---------------------------------------------------------------------

  const choose = (i: number | null) => {
    const tools = posingTools.current, at = stage.current
    if (!tools || !at) return
    setChosen(i)
    if (i === null) tools.gizmo.detach()
    else tools.gizmo.attach(at.bones[i])
    draw()
  }
  const chooseRef = useRef(choose)
  chooseRef.current = choose

  const takeOut = async () => {
    const at = stage.current, surface = canvas.current
    if (!at || !surface || posingTools.current) return
    const { SkeletonHelper, Mesh, SphereGeometry, MeshBasicMaterial, Raycaster, Vector2, Box3, Sphere } = await import('three')
    const { TransformControls } = await import('three/examples/jsm/controls/TransformControls.js')
    const size = new Box3().setFromObject(at.object).getBoundingSphere(new Sphere()).radius * 0.025 || 0.02
    const skeleton = new SkeletonHelper(at.object)
    const dot = new SphereGeometry(1, 12, 8)
    const paint = new MeshBasicMaterial({ color: 0xff8a3d, depthTest: false, transparent: true, opacity: 0.9 })
    const markers = at.bones.map((bone, i) => {
      const marker = new Mesh(dot, paint)
      marker.renderOrder = 999
      marker.scale.setScalar(size)
      marker.userData.bone = i
      // Where its joint is, as it's drawn.
      marker.onBeforeRender = () => { bone.getWorldPosition(marker.position); marker.updateMatrixWorld() }
      return marker
    })
    const gizmo = new TransformControls(at.camera, surface)
    gizmo.setMode('rotate')
    gizmo.setSpace('local')
    gizmo.setSize(0.8)
    gizmo.addEventListener('change', () => drawRef.current())
    gizmo.addEventListener('dragging-changed', event => { if (controls.current) controls.current.enabled = !event.value })
    gizmo.addEventListener('mouseUp', () => remember())
    const helper = gizmo.getHelper()
    at.scene.add(skeleton, helper, ...markers)
    // A joint's dot pressed: that joint chosen -- before the view takes the press to turn.
    const ray = new Raycaster(), point = new Vector2()
    const pick = (event: PointerEvent) => {
      if (gizmo.dragging || gizmo.axis !== null) return
      const r = surface.getBoundingClientRect()
      point.set((event.clientX - r.left) / r.width * 2 - 1, -((event.clientY - r.top) / r.height * 2 - 1))
      ray.setFromCamera(point, at.camera)
      markers.forEach(marker => marker.updateMatrixWorld())
      const hit = ray.intersectObjects(markers, false)[0]
      if (!hit) return
      event.stopImmediatePropagation()
      chooseRef.current(hit.object.userData.bone as number)
    }
    surface.addEventListener('pointerdown', pick, { capture: true })
    posingTools.current = { helpers: [skeleton, helper], markers, gizmo: gizmo as unknown as Posing['gizmo'], pick }
    drawRef.current()
  }
  const putAway = () => {
    const tools = posingTools.current, at = stage.current
    if (!tools) return
    posingTools.current = null
    canvas.current?.removeEventListener('pointerdown', tools.pick, { capture: true })
    tools.gizmo.detach()
    tools.gizmo.dispose()
    at?.scene.remove(...tools.helpers, ...tools.markers)
    host.current?.removeAttribute('data-model-joints')
    if (controls.current) controls.current.enabled = true
  }
  const pose = async (on: boolean) => {
    setPosing(on)
    setChosen(null)
    if (on) await takeOut()
    else { putAway(); draw() }
  }
  const resetPose = () => {
    const at = stage.current
    if (!at) return
    at.setPose(undefined)
    draw()
    remember()
  }
  // Drawn without what posing shows: for a picture of it.
  const bare = async <T,>(make: () => Promise<T>): Promise<T> => {
    const shown = [...(posingTools.current?.helpers ?? []), ...(posingTools.current?.markers ?? [])]
    shown.forEach(part => { part.visible = false })
    try { return await make() } finally { shown.forEach(part => { part.visible = true }); draw() }
  }

  // ---- Letting go -------------------------------------------------------------------

  // Let go of, once.
  const finished = useRef(false)
  const finish = async () => {
    if (finished.current) return
    finished.current = true
    const at = stage.current, box = host.current
    const moment = now()
    if (!editable || !at || !box || !moment || sameMoment(moment, started.current)) { onDone(null); return }
    const { width, height } = stillSize(box.clientWidth / box.clientHeight)
    try {
      onDone({ png: await bare(() => at.picture(width, height)), view: moment.view, pose: moment.pose })
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
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { void finishRef.current(); return }
      const at = stage.current
      if (!at || !(event.ctrlKey || event.metaKey) || !/^[zy]$/i.test(event.key)) return
      const back = event.key.toLowerCase() === 'z' && !event.shiftKey
      const from = back ? history.current : future.current
      if (back ? from.length < 2 : from.length === 0) return
      // Its own, then: never the atrium's undo as well.
      event.preventDefault()
      event.stopImmediatePropagation()
      if (back) future.current.push(history.current.pop()!)
      else history.current.push(future.current.pop()!)
      const moment = history.current[history.current.length - 1]
      at.setPose(moment.pose)
      at.place(moment.view)
      controls.current?.update()
      drawRef.current()
    }
    window.addEventListener('pointerdown', away, true)
    window.addEventListener('keydown', key, true)
    return () => {
      box.removeEventListener('wheel', keep)
      window.removeEventListener('pointerdown', away, true)
      window.removeEventListener('keydown', key, true)
    }
  }, [])

  const reset = () => {
    const at = stage.current
    if (!at) return
    at.place(at.framed(DEFAULT_VIEW))
    controls.current?.update()
    draw()
    remember()
  }
  const snapshot = async () => {
    const at = stage.current, box = host.current
    if (!at || !box || !onSnapshot) return
    const { width, height } = stillSize(box.clientWidth / box.clientHeight, STILL_SIDE * 2)
    onSnapshot(await bare(() => at.picture(width, height)))
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
          {status === 'loading' ? t('atrium.model.loading') : ready ? t(posing ? 'atrium.model.poseHint' : 'atrium.model.hint') : status.error}
        </span>
        {ready && editable && bones.length > 0 && (
          <button type="button" data-model-pose="" aria-pressed={posing} onClick={() => void pose(!posing)} className={posing ? `${CHIP} bg-nier-strong text-nier-black border-nier-strong` : QUIET}>{t('atrium.model.pose')}</button>
        )}
        {posing && (
          <>
            <select
              data-model-bone=""
              aria-label={t('atrium.model.bone')}
              value={chosen ?? ''}
              onChange={e => choose(e.target.value === '' ? null : Number(e.target.value))}
              className="pointer-events-auto h-7 max-w-[10rem] bg-nier-black/90 text-nier-strong border border-nier-border/50 px-1.5 text-[11px]"
            >
              <option value="">{t('atrium.model.bone')}</option>
              {bones.map((name, i) => <option key={i} value={i}>{name}</option>)}
            </select>
            <button type="button" data-model-reset-pose="" onClick={resetPose} className={QUIET}>{t('atrium.model.resetPose')}</button>
          </>
        )}
        {ready && editable && onSnapshot && !posing && (
          <button type="button" data-model-snapshot="" onClick={() => void snapshot()} className={QUIET}>{t('atrium.model.snapshot')}</button>
        )}
        {ready && !posing && <button type="button" data-model-reset="" onClick={reset} className={QUIET}>{t('atrium.model.reset')}</button>}
        <button type="button" data-model-done="" onClick={() => void finish()} className={`${CHIP} bg-nier-strong text-nier-black border-nier-strong`}>{t('atrium.model.done')}</button>
      </div>,
      document.body)}
    </div>
  )
}
