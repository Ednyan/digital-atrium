// A 3D model trace opened (lib/model3d): the model itself in its box, turned by
// dragging and brought nearer by scrolling, over nothing -- what's behind it
// shows through, as through its still. One at a time: a browser keeps only so
// many live 3D views, and the rest of the atrium needs none.
//
// Full screen, it's taken out of its box onto the whole window to work on, and
// put back as it's left -- the same drawing, its canvas moved, never made anew.
//
// A model with a skeleton can be posed: Pose shows its joints and a strip of
// tools beside it -- Multi (move and turn at once), Move, Rotate, Scale -- for
// the joint clicked or chosen from its list. Reset pose puts it at rest.
//
// Let go (Done, Escape, a press anywhere else), a view or pose that changed is
// drawn as a new still and handed back (onDone), to be kept as the trace's picture.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { Object3D } from 'three'
import type { Trace } from '../types/database'
import { DEFAULT_LOOK, DEFAULT_VIEW, makeStage, parseModel, sameView, stillSize, STILL_SIDE, texturesOn, type ModelPose, type ModelView, type Stage } from '../lib/model3d'
import { fetchMedia } from '../lib/exportImage'
import { useTranslation } from '../lib/i18n'
import { chainOf, reach } from '../lib/modelIk'
import { FIGURE_MARK, FIGURE_POSES, type FigurePoseName } from '../lib/modelStarters'
import type { TranslationKey } from '../locales/en'

// Its drawing's longer side at most, in pixels, however near the atrium is.
const MOST_PIXELS = 2048
const CHIP = 'pointer-events-auto h-7 px-2.5 border text-[11px] tracking-[0.12em] uppercase whitespace-nowrap transition-colors'
const QUIET = `${CHIP} bg-nier-black/85 border-nier-border/50 text-nier-strong hover:border-nier-border`
const ON = `${CHIP} bg-nier-strong text-nier-black border-nier-strong`

// A moment of it: how it's seen, and how it's posed.
interface Moment { view: ModelView; pose?: ModelPose }
const near = (a: number[] | undefined, b: number[] | undefined, by = 1e-5) => (!a && !b) || (!!a && !!b && a.every((v, i) => Math.abs(v - b[i]) < by))
const samePose = (a?: ModelPose, b?: ModelPose) => {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])
  return [...keys].every(key => {
    const p = a?.[key], q = b?.[key]
    if (!p || !q) return false
    // q and -q are the same turn.
    const turn = Math.abs(Math.abs(p.r[0] * q.r[0] + p.r[1] * q.r[1] + p.r[2] * q.r[2] + p.r[3] * q.r[3]) - 1) < 1e-6
    return turn && near(p.t, q.t) && near(p.s, q.s)
  })
}
const sameMoment = (a: Moment, b: Moment) => sameView(a.view, b.view) && samePose(a.pose, b.pose)

// The tools for a joint, and the gizmos each shows: Multi moves and turns at once.
const TOOLS = ['multi', 'translate', 'rotate', 'scale'] as const
type Tool = typeof TOOLS[number]
type GizmoMode = 'translate' | 'rotate' | 'scale'
const GIZMOS: Record<Tool, GizmoMode[]> = { multi: ['translate', 'rotate'], translate: ['translate'], rotate: ['rotate'], scale: ['scale'] }
const TOOL_ICON: Record<Tool, string> = {
  multi: 'M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5M17 12a5 5 0 1 1-5-5',
  translate: 'M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5',
  rotate: 'M19 12a7 7 0 1 1-2.05-4.95M19 4v4h-4',
  scale: 'M4 20h7v-7H4zM14 4h6v6M20 4l-8 8',
}
const TOOL_WORD: Record<Tool, TranslationKey> = { multi: 'atrium.model.toolMulti', translate: 'atrium.model.toolMove', rotate: 'atrium.model.toolRotate', scale: 'atrium.model.toolScale' }

interface Gizmo { mode: GizmoMode; object?: Object3D; attach(o: Object3D): void; detach(): void; dragging: boolean; axis: string | null; enabled: boolean; dispose(): void; setSize(size: number): void; getHelper(): Object3D }
// What posing shows over the model: its skeleton, a dot at each joint, the gizmos.
// `goal`: where a joint moved by reach (IK) is wanted -- the Move gizmo's, with IK on.
interface Posing { shown: Object3D[]; gizmos: Gizmo[]; pick: (event: PointerEvent) => void; placeDots: () => void; goal: Object3D }

export default function ModelLive({ trace, scale, editable, style, onReady, onDone, onSnapshot }: {
  trace: Trace
  // Screen pixels to one of its box's: the atrium's zoom times the trace's own size.
  scale: number
  editable: boolean
  // The picture's crop and look, worn the same way in its box.
  style?: CSSProperties
  onReady: () => void
  onDone: (turned: { png: Blob; view: ModelView; pose?: ModelPose } | null) => void
  onSnapshot?: (png: Blob) => void
}) {
  const { t } = useTranslation()
  const host = useRef<HTMLDivElement>(null)
  // Its canvas, made once and moved between its box and the full screen.
  const [canvas] = useState(() => {
    const made = document.createElement('canvas')
    made.className = 'absolute inset-0 w-full h-full'
    made.style.opacity = '0'
    return made
  })
  const stage = useRef<Stage | null>(null)
  const controls = useRef<{ update(): void; enabled: boolean } | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | { error: string }>('loading')
  const started = useRef<Moment>({ view: trace.model?.view ?? DEFAULT_VIEW, pose: trace.model?.pose })
  // Its moments while it's open, each move let go of one: Ctrl+Z steps back
  // through them, Ctrl+Shift+Z (or Ctrl+Y) on again -- the atrium's own undo is Done's.
  const history = useRef<Moment[]>([])
  const future = useRef<Moment[]>([])
  const moment = (): Moment | null => {
    const at = stage.current
    return at ? { view: at.viewNow(), pose: at.poseNow() } : null
  }
  const remember = () => {
    const now = moment()
    if (!now || (history.current.length && sameMoment(history.current[history.current.length - 1], now))) return
    history.current.push(now)
    future.current = []
  }
  const look = trace.model?.look ?? DEFAULT_LOOK
  const textures = trace.model ? texturesOn(trace.model) : true
  const lookKey = JSON.stringify([look, textures])
  const [bones, setBones] = useState<string[]>([])
  const [posing, setPosing] = useState(false)
  const [chosen, setChosen] = useState<number | null>(null)
  const [tool, setTool] = useState<Tool>('rotate')
  // Moved by reach (IK): a joint moved, the bones above it -- so many -- turn for it.
  const [ik, setIk] = useState(true)
  const [ikLength, setIkLength] = useState(2)
  const ikRef = useRef({ on: ik, length: ikLength })
  ikRef.current = { on: ik, length: ikLength }
  // One of the Atrium's own figures (lib/modelStarters): its poses fit it.
  const [figure, setFigure] = useState(false)
  const [whole, setWhole] = useState(false)
  const posingTools = useRef<Posing | null>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const room = useRef<HTMLDivElement>(null)
  const scene = document.querySelector('.lobby-scene') ?? document.body

  // Where it's drawn now: its box, or the full screen's room.
  const holder = () => (whole ? room.current : host.current)
  // Drawn, and where posing, its joints told where they are on the screen.
  const draw = () => {
    const at = stage.current
    if (!at) return
    posingTools.current?.placeDots()
    at.render()
    const box = host.current
    if (!box) return
    if (!posingTools.current?.shown[0]?.visible) { box.removeAttribute('data-model-joints'); return }
    const r = canvas.getBoundingClientRect()
    box.dataset.modelJoints = JSON.stringify(at.bones.map(bone => {
      const p = bone.getWorldPosition(at.center.clone()).project(at.camera)
      return [Math.round(r.left + (p.x + 1) / 2 * r.width), Math.round(r.top + (1 - p.y) / 2 * r.height)]
    }))
  }
  const drawRef = useRef(draw)
  drawRef.current = draw

  // Its drawing as big as it's shown, no bigger than it need be.
  const fit = () => {
    const box = holder(), at = stage.current
    if (!box || !at || !box.clientWidth || !box.clientHeight) return
    const density = (whole ? 1 : Math.max(0.01, scale)) * (window.devicePixelRatio || 1)
    const shrink = Math.min(1, MOST_PIXELS / (Math.max(box.clientWidth, box.clientHeight) * density))
    at.setSize(Math.max(1, Math.round(box.clientWidth * density * shrink)), Math.max(1, Math.round(box.clientHeight * density * shrink)))
    draw()
  }
  const fitRef = useRef(fit)
  fitRef.current = fit

  // Its canvas where it's drawn now; in its box, wearing the picture's crop and look.
  useLayoutEffect(() => {
    const box = holder()
    if (!box) return
    if (canvas.parentElement !== box) box.prepend(canvas)
    canvas.style.clipPath = whole ? '' : String(style?.clipPath ?? '')
    canvas.style.filter = whole ? '' : String(style?.filter ?? '')
  })
  useEffect(() => { canvas.style.opacity = status === 'ready' ? '1' : '0' }, [status, canvas])

  useEffect(() => {
    let live = true
    let made: Stage | null = null
    let orbit: { dispose(): void } | null = null
    void (async () => {
      try {
        const file = trace.imageUrl ? await fetchMedia(trace.imageUrl) : null
        if (!file) throw new Error(t('atrium.model.missing'))
        const object = await parseModel(await file.arrayBuffer(), trace.model!.format)
        if (!live) return
        made = await makeStage(object, canvas)
        if (!live) { made.dispose(); return }
        stage.current = made
        fitRef.current()
        made.setLook(look, textures)
        made.setPose(started.current.pose)
        made.place(started.current.view)
        history.current = [started.current]
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js')
        if (!live) return
        const turning = new OrbitControls(made.camera, canvas)
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
        let marked = false
        made.object.traverse(part => { if (part.userData?.[FIGURE_MARK]) marked = true })
        setFigure(marked)
        drawRef.current()
        setStatus('ready')
        onReady()
      } catch (error) {
        if (live) setStatus({ error: error instanceof Error ? error.message : String(error) })
      }
    })()
    return () => {
      live = false
      const tools = posingTools.current
      posingTools.current = null
      if (tools) {
        canvas.removeEventListener('pointerdown', tools.pick, { capture: true })
        tools.gizmos.forEach(gizmo => gizmo.dispose())
      }
      orbit?.dispose()
      made?.dispose()
      stage.current = null
      controls.current = null
      canvas.remove()
    }
    // One model a trace: what it's turned to is its own, from then on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trace.id, trace.imageUrl])

  useEffect(() => { fit() }, [scale, status, whole])
  useEffect(() => {
    stage.current?.setLook(look, textures)
    draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookKey])

  // ---- Posing ---------------------------------------------------------------------

  // What posing shows, as it's asked: the skeleton and dots while posing, and the
  // tool's gizmos on the joint chosen.
  const showPosing = (on: boolean, joint: number | null, using: Tool, reaching = ikRef.current) => {
    const tools = posingTools.current, at = stage.current
    if (!tools || !at) return
    tools.shown.forEach(part => { part.visible = on })
    for (const gizmo of tools.gizmos) {
      const wanted = on && joint !== null && GIZMOS[using].includes(gizmo.mode)
      const bone = joint === null ? null : at.bones[joint]
      // Moved by reach where it has bones above it to turn: the gizmo on its goal, there.
      const byReach = gizmo.mode === 'translate' && !!bone && reaching.on && chainOf(bone, reaching.length).length > 0
      if (byReach) bone!.getWorldPosition(tools.goal.position)
      if (wanted) gizmo.attach(byReach ? tools.goal : bone!)
      else gizmo.detach()
      // Move and turn together: the rings inside the arrows.
      gizmo.setSize(using === 'multi' && gizmo.mode === 'rotate' ? 0.6 : 0.85)
    }
    draw()
  }
  const showRef = useRef(showPosing)
  showRef.current = showPosing
  const chosenRef = useRef(chosen)
  chosenRef.current = chosen
  const choose = (joint: number | null) => {
    setChosen(joint)
    chosenRef.current = joint
    showPosing(posing, joint, tool)
  }
  const reachBy = (on: boolean, length = ikLength) => {
    setIk(on)
    setIkLength(length)
    showPosing(posing, chosen, tool, { on, length })
  }
  // One of a figure's poses (lib/modelStarters): turned from standing.
  const takePose = async (name: FigurePoseName) => {
    const at = stage.current
    if (!at) return
    const { Euler, Quaternion, MathUtils } = await import('three')
    const wanted = FIGURE_POSES[name] as { turns: Record<string, [number, number, number]>; hips?: [number, number, number] }
    at.setPose(undefined)
    for (const bone of at.bones) {
      const turn = wanted.turns[bone.name]
      if (turn) bone.quaternion.multiply(new Quaternion().setFromEuler(new Euler(...turn.map(MathUtils.degToRad) as [number, number, number], 'XYZ')))
      if (bone.name === 'Hips' && wanted.hips) bone.position.set(bone.position.x + wanted.hips[0], bone.position.y + wanted.hips[1], bone.position.z + wanted.hips[2])
    }
    at.object.updateMatrixWorld(true)
    showPosing(posing, chosen, tool)
    remember()
  }
  const chooseRef = useRef(choose)
  chooseRef.current = choose

  // Made once, the first time it's posed, and kept -- shown or not -- till it's let go.
  const makePosing = async () => {
    const at = stage.current
    if (!at || posingTools.current) return
    const { SkeletonHelper, Mesh, SphereGeometry, MeshBasicMaterial, Raycaster, Vector2, Box3, Sphere, Object3D } = await import('three')
    const { TransformControls } = await import('three/examples/jsm/controls/TransformControls.js')
    if (posingTools.current || stage.current !== at) return
    const size = new Box3().setFromObject(at.object).getBoundingSphere(new Sphere()).radius * 0.025 || 0.02
    const skeleton = new SkeletonHelper(at.object)
    const dot = new SphereGeometry(1, 12, 8)
    const paint = new MeshBasicMaterial({ color: 0xff8a3d, depthTest: false, transparent: true, opacity: 0.9 })
    const markers = at.bones.map((_, i) => {
      const marker = new Mesh(dot, paint)
      marker.renderOrder = 999
      marker.scale.setScalar(size)
      marker.userData.bone = i
      // Always drawn: it was left out as off the view while still where it was
      // made -- the scene's middle -- never reaching its joint, on a model away from it.
      marker.frustumCulled = false
      return marker
    })
    // Each at its joint, before every drawing.
    const placeDots = () => markers.forEach((marker, i) => { at.bones[i].getWorldPosition(marker.position); marker.updateMatrixWorld() })
    const gizmos = (['translate', 'rotate', 'scale'] as const).map(mode => {
      const gizmo = new TransformControls(at.camera, canvas)
      gizmo.setMode(mode)
      gizmo.setSpace('local')
      return gizmo
    })
    // Where a joint moved by reach is wanted: moved by the Move gizmo, followed by its chain.
    const goal = new Object3D()
    at.scene.add(goal)
    const [moving] = gizmos
    moving.addEventListener('objectChange', () => {
      const joint = chosenRef.current
      if (moving.object !== goal || joint === null) return
      const bone = at.bones[joint]
      reach(chainOf(bone, ikRef.current.length), bone, goal.position)
    })
    // Let go: its goal back where the joint got to (as near as it could).
    moving.addEventListener('mouseUp', () => {
      const joint = chosenRef.current
      if (moving.object === goal && joint !== null) at.bones[joint].getWorldPosition(goal.position)
    })
    for (const gizmo of gizmos) {
      gizmo.addEventListener('change', () => drawRef.current())
      gizmo.addEventListener('dragging-changed', event => { if (controls.current) controls.current.enabled = !event.value })
      // One gizmo at a time: a press the arrows took isn't the rings' too.
      gizmo.addEventListener('mouseDown', () => { for (const other of gizmos) if (other !== gizmo) other.enabled = false })
      gizmo.addEventListener('mouseUp', () => { for (const other of gizmos) other.enabled = true; remember() })
      at.scene.add(gizmo.getHelper())
    }
    at.scene.add(skeleton, ...markers)
    // A joint's dot pressed: that joint chosen -- before the view takes the press to turn.
    const ray = new Raycaster(), point = new Vector2()
    const pick = (event: PointerEvent) => {
      if (!skeleton.visible || gizmos.some(gizmo => gizmo.dragging || (gizmo.object && gizmo.axis !== null))) return
      const r = canvas.getBoundingClientRect()
      point.set((event.clientX - r.left) / r.width * 2 - 1, -((event.clientY - r.top) / r.height * 2 - 1))
      ray.setFromCamera(point, at.camera)
      placeDots()
      const hit = ray.intersectObjects(markers, false)[0]
      if (!hit) return
      event.stopImmediatePropagation()
      chooseRef.current(hit.object.userData.bone as number)
    }
    canvas.addEventListener('pointerdown', pick, { capture: true })
    posingTools.current = { shown: [skeleton, ...markers], gizmos: gizmos as unknown as Gizmo[], pick, placeDots, goal }
  }
  const pose = async (on: boolean) => {
    setPosing(on)
    if (on) await makePosing()
    // The joint chosen before is chosen again; the first time, its root, so a gizmo shows at once.
    const joint = chosen ?? (on && bones.length ? 0 : null)
    setChosen(joint)
    chosenRef.current = joint
    showRef.current(on, joint, tool)
  }
  const useTool = (next: Tool) => {
    setTool(next)
    showPosing(posing, chosen, next)
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
    const tools = posingTools.current
    const shown = [...(tools?.shown ?? []), ...(tools?.gizmos ?? []).map(gizmo => gizmo.getHelper())]
    const was = shown.map(part => part.visible)
    shown.forEach(part => { part.visible = false })
    try { return await make() } finally { shown.forEach((part, i) => { part.visible = was[i] }); draw() }
  }

  // ---- Letting go -------------------------------------------------------------------

  // Let go of, once.
  const finished = useRef(false)
  const finish = async () => {
    if (finished.current) return
    finished.current = true
    const at = stage.current, box = host.current
    const now = moment()
    if (!editable || !at || !box || !now || sameMoment(now, started.current)) { onDone(null); return }
    // Drawn for its box, whatever it's shown on now.
    const { width, height } = stillSize(box.clientWidth / box.clientHeight)
    try {
      onDone({ png: await bare(() => at.picture(width, height)), view: now.view, pose: now.pose })
    } catch {
      onDone(null)
    }
  }
  const finishRef = useRef(finish)
  finishRef.current = finish
  const wholeRef = useRef(whole)
  wholeRef.current = whole

  // Its buttons ride above what it's drawn on -- outside its box, which clips --
  // the tools down its left, the same size at any zoom, followed every frame.
  const bar = useRef<HTMLDivElement>(null)
  const strip = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let frame = 0
    const follow = () => {
      const box = (wholeRef.current ? room.current : host.current), buttons = bar.current
      if (box && buttons) {
        const r = box.getBoundingClientRect()
        const above = r.top > buttons.offsetHeight + 16
        const right = Math.min(window.innerWidth - 8, Math.max(buttons.offsetWidth + 8, r.right))
        buttons.style.transform = `translate(${right - buttons.offsetWidth}px, ${above ? r.top - buttons.offsetHeight - 8 : Math.min(window.innerHeight - buttons.offsetHeight - 8, r.bottom + 8)}px)`
        if (strip.current) strip.current.style.transform = `translate(${Math.max(8, r.left + 8)}px, ${Math.max(8, r.top + 8)}px)`
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
      const ours = [box, bar.current, strip.current, overlay.current].some(part => part?.contains(on))
      if (!ours) void finishRef.current()
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Out of the full screen first; then let go.
        if (wholeRef.current) { event.stopImmediatePropagation(); setWhole(false); return }
        void finishRef.current()
        return
      }
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
      const now = history.current[history.current.length - 1]
      at.setPose(now.pose)
      at.place(now.view)
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
  const layer = whole ? 'var(--layer-dialog)' : 'var(--layer-menu)'
  return (
    <div
      ref={host}
      data-model-live={trace.id}
      data-whole={whole || undefined}
      className="absolute inset-0"
      style={{ pointerEvents: 'auto', cursor: ready ? 'grab' : 'progress' }}
      onMouseDown={keep}
      onTouchStart={keep}
      onClick={keep}
      onDoubleClick={keep}
      onContextMenu={keep}
    >
      {createPortal(
        <>
          {whole && (
        // The full screen: the model on the whole window, dimmed behind; a press
        // outside it, or Escape, puts it back in its box.
        <div
          ref={overlay}
          data-ui-element=""
          data-model-whole={trace.id}
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 'var(--layer-dialog)', background: 'rgb(0 0 0 / 0.72)' }}
          onPointerDown={event => { if (event.target === event.currentTarget) setWhole(false) }}
          onWheel={keep}
        >
          <div ref={room} className="relative w-[94vw] h-[86vh] border border-nier-border/30" style={{ background: 'rgb(var(--c-ground) / 0.6)' }} />
        </div>
          )}
          {posing && (
            <div
              ref={strip}
              data-ui-element=""
              data-model-tools=""
              className="fixed left-0 top-0 flex flex-col gap-1 p-1 border border-nier-border/50 bg-nier-black/90"
              style={{ zIndex: layer, pointerEvents: 'auto' }}
            >
              {TOOLS.map(one => (
                <button
                  key={one}
                  type="button"
                  data-model-tool={one}
                  aria-pressed={tool === one}
                  title={t(TOOL_WORD[one])}
                  aria-label={t(TOOL_WORD[one])}
                  onClick={() => useTool(one)}
                  className={`w-8 h-8 flex items-center justify-center border ${tool === one ? 'bg-nier-strong text-nier-black border-nier-strong' : 'text-nier-strong border-transparent hover:border-nier-border/60'}`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={TOOL_ICON[one]} /></svg>
                </button>
              ))}
            </div>
          )}
          <div
            ref={bar}
            data-ui-element=""
            data-model-bar={trace.id}
            className="fixed left-0 top-0 flex items-center gap-1.5"
            style={{ zIndex: layer, pointerEvents: 'none' }}
          >
            <span data-model-status="" className="px-2 h-7 flex items-center bg-nier-black/85 border border-nier-border/40 text-[11px] tracking-[0.08em] text-nier-bg/85 whitespace-nowrap">
              {status === 'loading' ? t('atrium.model.loading') : ready ? t(posing ? 'atrium.model.poseHint' : 'atrium.model.hint') : status.error}
            </span>
            {ready && editable && bones.length > 0 && (
              <button type="button" data-model-pose="" aria-pressed={posing} onClick={() => void pose(!posing)} className={posing ? ON : QUIET}>{t('atrium.model.pose')}</button>
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
                <button type="button" data-model-ik="" aria-pressed={ik} title={t('atrium.model.ikHint')} onClick={() => reachBy(!ik)} className={ik ? ON : QUIET}>{t('atrium.model.ik')}</button>
                {ik && (
                  <select data-model-ik-length="" aria-label={t('atrium.model.chain')} title={t('atrium.model.chain')} value={ikLength} onChange={e => reachBy(true, Number(e.target.value))}
                    className="pointer-events-auto h-7 bg-nier-black/90 text-nier-strong border border-nier-border/50 px-1.5 text-[11px]">
                    {[1, 2, 3, 4].map(length => <option key={length} value={length}>{t('atrium.model.chainOf', { n: length })}</option>)}
                  </select>
                )}
                {figure && (
                  <select data-model-poses="" aria-label={t('atrium.model.poses')} value="" onChange={e => { if (e.target.value) void takePose(e.target.value as FigurePoseName) }}
                    className="pointer-events-auto h-7 bg-nier-black/90 text-nier-strong border border-nier-border/50 px-1.5 text-[11px]">
                    <option value="">{t('atrium.model.poses')}</option>
                    {(Object.keys(FIGURE_POSES) as FigurePoseName[]).map(name => <option key={name} value={name}>{t(`atrium.model.pose.${name}` as TranslationKey)}</option>)}
                  </select>
                )}
                <button type="button" data-model-reset-pose="" onClick={resetPose} className={QUIET}>{t('atrium.model.resetPose')}</button>
              </>
            )}
            {ready && editable && onSnapshot && !posing && (
              <button type="button" data-model-snapshot="" onClick={() => void snapshot()} className={QUIET}>{t('atrium.model.snapshot')}</button>
            )}
            {ready && !posing && <button type="button" data-model-reset="" onClick={reset} className={QUIET}>{t('atrium.model.reset')}</button>}
            {ready && (
              <button type="button" data-model-whole-switch="" aria-pressed={whole} onClick={() => setWhole(was => !was)} className={whole ? ON : QUIET}>
                {t(whole ? 'atrium.model.backToTrace' : 'atrium.model.fullScreen')}
              </button>
            )}
            <button type="button" data-model-done="" onClick={() => void finish()} className={ON}>{t('atrium.model.done')}</button>
          </div>
        </>,
        // Inside the atrium's screen, where its own cursor is the only one (index.css).
        scene)}
    </div>
  )
}
