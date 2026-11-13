// A 3D model trace opened (lib/model3d): the model itself in its box, turned by
// dragging and brought nearer by scrolling, over nothing -- what's behind it
// shows through, as through its still. One at a time: a browser keeps only so
// many live 3D views, and the rest of the atrium needs none.
//
// In its box: turned, panned and zoomed, with Snapshot, Reset view and More
// tools; what dragging does said at the foot of the screen, as a tool's is.
// More tools takes it out of its box onto the whole window to work on, and puts
// it back as it's left -- the same drawing, its canvas moved, never made anew.
//
// There, its tools, down its left: View (dragging turns it), and Multi (move and turn
// at once), Move, Rotate and Scale -- for the whole model, or a part of it
// clicked or chosen from its list. A model with a skeleton can be posed: Pose
// shows its joints, the tools working on the joint clicked or chosen. With IK, a
// joint moved takes the bones above it along; two of them (an arm, a leg) bend
// toward a pole -- a diamond, chosen and moved as a joint is. A person's
// skeleton (lib/modelHumanoid) takes ready-made poses too.
//
// Let go (Done, Escape, a press anywhere else), a view or pose that changed is
// drawn as a new still and handed back (onDone), to be kept as the trace's picture.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Box3, LineBasicMaterial, BufferGeometry, Line, Mesh, MeshBasicMaterial, Object3D, OctahedronGeometry, Raycaster, SkeletonHelper, Sphere, SphereGeometry, Vector2, Vector3 } from 'three'
import type { Trace } from '../types/database'
import { DEFAULT_LOOK, DEFAULT_VIEW, makeStage, parseModel, sameView, stillSize, STILL_SIDE, texturesOn, type ModelPose, type ModelView, type Stage } from '../lib/model3d'
import { fetchMedia } from '../lib/exportImage'
import { useTranslation } from '../lib/i18n'
import { bendOf, chainOf, reach, reachTwo } from '../lib/modelIk'
import { applyFrame, basicPose, BASIC_POSES, bendFor, humanoidOf, restOf, type Aims, type Frame, type Humanoid, type RigRest } from '../lib/modelHumanoid'
import { frameAt, lengthOf, motionOf, playables, posesOf, type Motion, type Playable } from '../lib/motions'
import type { TranslationKey } from '../locales/en'
import { FootHint } from './QuickBar'

// Its drawing's longer side at most, in pixels, however near the atrium is.
const MOST_PIXELS = 2048
const CHIP = 'pointer-events-auto h-7 px-2.5 border text-[11px] tracking-[0.12em] uppercase whitespace-nowrap transition-colors'
const QUIET = `${CHIP} bg-nier-black/85 border-nier-border/50 text-nier-strong hover:border-nier-border`
const ON = `${CHIP} bg-nier-strong text-nier-black border-nier-strong`
const SELECT = 'pointer-events-auto h-7 bg-nier-black/90 text-nier-strong border border-nier-border/50 px-1.5 text-[11px]'

// A moment of it: how it's seen, how it's posed, and its parts moved.
interface Moment { view: ModelView; pose?: ModelPose; parts?: ModelPose }
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
const sameMoment = (a: Moment, b: Moment) => sameView(a.view, b.view) && samePose(a.pose, b.pose) && samePose(a.parts, b.parts)

// The tools, and the gizmos each shows: View none (dragging turns the view), Multi moves and turns at once.
const TOOLS = ['view', 'multi', 'translate', 'rotate', 'scale'] as const
type Tool = typeof TOOLS[number]
type GizmoMode = 'translate' | 'rotate' | 'scale'
const GIZMOS: Record<Tool, GizmoMode[]> = { view: [], multi: ['translate', 'rotate'], translate: ['translate'], rotate: ['rotate'], scale: ['scale'] }
const TOOL_ICON: Record<Tool, string> = {
  view: 'M5 3l14 7.5-6.2 1.6L9.6 18z',
  multi: 'M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5M17 12a5 5 0 1 1-5-5',
  translate: 'M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5',
  rotate: 'M19 12a7 7 0 1 1-2.05-4.95M19 4v4h-4',
  scale: 'M4 20h7v-7H4zM14 4h6v6M20 4l-8 8',
}
const TOOL_WORD: Record<Tool, TranslationKey> = { view: 'atrium.model.toolView', multi: 'atrium.model.toolMulti', translate: 'atrium.model.toolMove', rotate: 'atrium.model.toolRotate', scale: 'atrium.model.toolScale' }
const POLE = 0x4cc9f0
// How the ready-made poses and the animations are grouped, in order.
const POSE_GROUPS = ['standard', 'expressive', 'action'] as const
const ANIMATION_GROUPS = ['everyday', 'dance', 'expressive', 'action'] as const

// What's being worked on: posing (a joint, or its pole) or not (a part: 0, the
// whole model), with which tool, how far IK reaches, and whether its gizmos show
// (hidden, to see it clean: the joints still show, and can still be chosen).
interface Editing { posing: boolean; tool: Tool; joint: number | null; part: number; ik: boolean; ikLength: number; onPole: boolean; gizmos: boolean }
const FIRST: Editing = { posing: false, tool: 'view', joint: null, part: 0, ik: true, ikLength: 2, onPole: false, gizmos: true }

interface Gizmo { mode: GizmoMode; object?: Object3D; attach(o: Object3D): void; detach(): void; dragging: boolean; axis: string | null; enabled: boolean; dispose(): void; setSize(size: number): void; getHelper(): Object3D }
// What's shown over the model to work on it: its skeleton and a dot at each joint
// (posing), the pole and its line, the gizmos. `goal`: where a joint moved by
// reach (IK) is wanted -- the Move gizmo's, with IK on.
interface Kit { shown: Object3D[]; pole: Mesh<OctahedronGeometry, MeshBasicMaterial>; poleLine: Line; gizmos: Gizmo[]; goal: Object3D; placeDots: () => void; pick: (event: PointerEvent) => void; release: (event: PointerEvent) => void }

export default function ModelLive({ trace, scale, editable, style, onReady, onDone, onSnapshot }: {
  trace: Trace
  // Screen pixels to one of its box's: the atrium's zoom times the trace's own size.
  scale: number
  editable: boolean
  // The picture's crop and look, worn the same way in its box.
  style?: CSSProperties
  onReady: () => void
  onDone: (turned: { png: Blob; view: ModelView; pose?: ModelPose; parts?: ModelPose } | null) => void
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
  const started = useRef<Moment>({ view: trace.model?.view ?? DEFAULT_VIEW, pose: trace.model?.pose, parts: trace.model?.parts })
  // Its moments while it's open, each move let go of one: Ctrl+Z steps back
  // through them, Ctrl+Shift+Z (or Ctrl+Y) on again -- the atrium's own undo is Done's.
  const history = useRef<Moment[]>([])
  const future = useRef<Moment[]>([])
  const moment = (): Moment | null => {
    const at = stage.current
    return at ? { view: at.viewNow(), pose: at.poseNow(), parts: at.partsNow() } : null
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
  const [partNames, setPartNames] = useState<string[]>([])
  const [editing, setEditing] = useState<Editing>(FIRST)
  const editingRef = useRef(editing)
  // A person's skeleton, found in it: its poses, and which way its knees and elbows bend.
  const rig = useRef<Humanoid | null>(null)
  const [whole, setWhole] = useState(false)
  const kit = useRef<Kit | null>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const room = useRef<HTMLDivElement>(null)
  const scene = document.querySelector('.lobby-scene') ?? document.body

  // Where it's drawn now: its box, or the full screen's room.
  const holder = () => (whole ? room.current : host.current)
  // Its gizmos as near as the model is -- bigger nearer, smaller further, as it is --
  // never past easy reach; moving and turning at once, the rings inside the arrows.
  const sizeGizmos = () => {
    const at = stage.current, tools = kit.current
    if (!at || !tools) return
    const near = Math.min(1.6, Math.max(0.4, (at.base() * 0.65) / (at.camera.position.distanceTo(at.target) || 1)))
    for (const gizmo of tools.gizmos) gizmo.setSize(near * (editingRef.current.tool === 'multi' && gizmo.mode === 'rotate' ? 0.5 : 0.7))
  }
  // Drawn, and while posing, its joints (and pole) told where they are on the screen.
  const draw = () => {
    const at = stage.current
    if (!at) return
    kit.current?.placeDots()
    sizeGizmos()
    at.render()
    const box = host.current
    if (!box) return
    const r = canvas.getBoundingClientRect()
    const onScreen = (p: Vector3) => {
      p.project(at.camera)
      return [Math.round(r.left + (p.x + 1) / 2 * r.width), Math.round(r.top + (1 - p.y) / 2 * r.height)]
    }
    if (!kit.current?.shown[0]?.visible) box.removeAttribute('data-model-joints')
    else box.dataset.modelJoints = JSON.stringify(at.bones.map(bone => onScreen(bone.getWorldPosition(new Vector3()))))
    if (!kit.current?.pole.visible) box.removeAttribute('data-model-pole')
    else box.dataset.modelPole = JSON.stringify(onScreen(kit.current.pole.position.clone()))
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
        made.setParts(started.current.parts)
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
        setPartNames(made.parts.map((part, i) => (i === 0 ? t('atrium.model.wholeModel') : part.name || `${t('atrium.model.part')} ${i}`)))
        rig.current = humanoidOf(made.bones)
        // A VRM's hair and clothes swing while it's open.
        if (made.moves) wakeRef.current()
        drawRef.current()
        setStatus('ready')
        onReady()
      } catch (error) {
        if (live) setStatus({ error: error instanceof Error ? error.message : String(error) })
      }
    })()
    return () => {
      live = false
      cancelAnimationFrame(frameAsked.current)
      frameAsked.current = 0
      const tools = kit.current
      kit.current = null
      if (tools) {
        canvas.removeEventListener('pointerdown', tools.pick, { capture: true })
        canvas.removeEventListener('pointerup', tools.release)
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

  // ---- Moving by itself: a VRM's physics, an animation playing ------------------------

  // Drawn a frame at a time while anything moves by itself, and not otherwise: a
  // VRM's springs stepped, an animation's frame given to its rig (from rest: its
  // own rest, read as it started). No more than a twentieth of a second at once.
  const frameAsked = useRef(0)
  const lastFrame = useRef(0)
  const playRef = useRef<{ motion: Motion; time: number; paused: boolean; rest: RigRest } | null>(null)
  const [playing, setPlaying] = useState<{ id: string; paused: boolean } | null>(null)
  const [fetching, setFetching] = useState(false)
  // Paused where it is: that frame its pose now, kept (one step of its undo).
  const pausePlaying = () => {
    const play = playRef.current
    if (!play || play.paused) return
    play.paused = true
    setPlaying(now => now && { ...now, paused: true })
    remember()
  }
  const pauseRef = useRef(pausePlaying)
  pauseRef.current = pausePlaying
  const tick = (now: number) => {
    frameAsked.current = 0
    const at = stage.current, play = playRef.current, person = rig.current
    if (!at) return
    const seconds = Math.min(0.05, Math.max(0, (now - lastFrame.current) / 1000))
    lastFrame.current = now
    const running = !!play && !play.paused && !!person
    if (running) {
      play.time += seconds
      at.setPose(undefined)
      applyFrame(person, play.rest, frameAt(play.motion, play.time), play.motion.aims)
      // One that doesn't loop stops at its end, held there.
      if (!play.motion.loop && play.time >= lengthOf(play.motion)) pausePlaying()
    }
    at.step(seconds)
    drawRef.current()
    if (at.moves || running) frameAsked.current = requestAnimationFrame(next => tickRef.current(next))
  }
  const tickRef = useRef(tick)
  tickRef.current = tick
  const wake = () => {
    if (frameAsked.current) return
    lastFrame.current = performance.now()
    frameAsked.current = requestAnimationFrame(next => tickRef.current(next))
  }
  const wakeRef = useRef(wake)
  wakeRef.current = wake
  // Played from its start (from rest, as it's read now).
  const play = async (playable: Playable) => {
    const at = stage.current, person = rig.current
    if (!at || !person) return
    pausePlaying()
    setFetching(true)
    try {
      const motion = await motionOf(playable)
      if (stage.current !== at) return
      at.setPose(undefined)
      playRef.current = { motion, time: 0, paused: false, rest: restOf(person) }
      setPlaying({ id: playable.id, paused: false })
      wake()
    } catch (error) {
      console.error('Animation not fetched:', error)
    } finally {
      setFetching(false)
    }
  }
  // On again from where it was paused (its end: its start).
  const resume = () => {
    const at = stage.current, play = playRef.current, person = rig.current
    if (!at || !play || !person) return
    if (!play.motion.loop && play.time >= lengthOf(play.motion)) play.time = 0
    at.setPose(undefined)
    play.rest = restOf(person)
    play.paused = false
    setPlaying(now => now && { ...now, paused: false })
    wake()
  }
  // The ready-made poses, and what can be played: fetched the first time a person's
  // full screen opens (the frames of an animation only when it's played).
  const [poseList, setPoseList] = useState<Motion[]>([])
  const [playList, setPlayList] = useState<Playable[]>([])

  // ---- Working on it ----------------------------------------------------------------

  // The joint chosen, whether IK moves it, and whether it bends toward a pole (two bones).
  const reachOf = (e: Editing) => {
    const bone = e.posing && e.joint !== null ? stage.current?.bones[e.joint] ?? null : null
    const reaching = !!bone && e.ik && chainOf(bone, e.ikLength).length > 0
    return { bone, reaching, twoBone: reaching && e.ikLength === 2 && chainOf(bone!, 2).length === 2 }
  }
  // A joint's pole, where its bend points now -- or, straight, where a knee (forward)
  // or an elbow (back) would bend; any other joint, toward the eye.
  const placePole = (end: Object3D) => {
    const at = stage.current, tools = kit.current, middle = end.parent, top = middle?.parent
    if (!at || !tools || !middle || !top) return
    const bend = middle.getWorldPosition(new Vector3())
    const length = top.getWorldPosition(new Vector3()).distanceTo(bend)
    let way = bendOf(end) ?? (rig.current && bendFor(rig.current, middle))
    if (!way) {
      const along = end.getWorldPosition(new Vector3()).sub(top.getWorldPosition(new Vector3())).normalize()
      way = at.camera.position.clone().sub(bend)
      way.addScaledVector(along, -way.dot(along)).normalize()
    }
    tools.pole.position.copy(bend).addScaledVector(way, Math.max(length, 1e-3) * 0.75)
  }
  // What's shown, as it's asked: the skeleton and dots while posing, the pole for a
  // joint that bends toward one, and the tool's gizmos on what's chosen.
  const show = (e: Editing) => {
    const tools = kit.current, at = stage.current
    if (!tools || !at) return
    // (A person's hair and clothes' bones, and its rig's helpers, aren't dotted:
    // they hid the body. They're still in its list of bones.)
    tools.shown.forEach(part => { part.visible = e.posing && !part.userData.aside })
    const { bone, reaching, twoBone } = reachOf(e)
    const onPole = twoBone && e.onPole
    tools.pole.visible = tools.poleLine.visible = twoBone
    if (twoBone && !onPole) placePole(bone!)
    tools.pole.material.color.setHex(onPole ? 0xffffff : POLE)
    if (reaching) bone!.getWorldPosition(tools.goal.position)
    const subject = e.posing ? bone : at.parts[e.part] ?? at.parts[0]
    for (const gizmo of tools.gizmos) {
      // The pole is only moved; a joint moved by reach, by its goal.
      const target = onPole ? (gizmo.mode === 'translate' ? tools.pole : null)
        : !subject || !GIZMOS[e.tool].includes(gizmo.mode) ? null
        : gizmo.mode === 'translate' && reaching ? tools.goal : subject
      if (target && e.gizmos) gizmo.attach(target)
      else gizmo.detach()
    }
    draw()
  }
  const showRef = useRef(show)
  showRef.current = show
  const edit = (patch: Partial<Editing>) => {
    const next = { ...editingRef.current, ...patch }
    editingRef.current = next
    setEditing(next)
    if (kit.current) showRef.current(next)
    else if (next.posing || next.tool !== 'view') void makeKit().then(() => showRef.current(editingRef.current))
  }
  const editRef = useRef(edit)
  editRef.current = edit

  // Made once, the first time it's wanted, and kept -- shown or not -- till it's let go.
  const making = useRef<Promise<void> | null>(null)
  const makeKit = () => (making.current ??= (async () => {
    const at = stage.current
    if (!at) return
    const { TransformControls } = await import('three/examples/jsm/controls/TransformControls.js')
    if (kit.current || stage.current !== at) return
    const size = new Box3().setFromObject(at.object).getBoundingSphere(new Sphere()).radius * 0.018 || 0.015
    const skeleton = new SkeletonHelper(at.object)
    const dot = new SphereGeometry(1, 12, 8)
    const paint = new MeshBasicMaterial({ color: 0xff8a3d, depthTest: false, transparent: true, opacity: 0.9 })
    // Always drawn, never left out as off the view: each is made at the scene's
    // middle and only moved to its joint before it's drawn.
    const onTop = <T extends Object3D>(made: T) => { made.renderOrder = 999; made.frustumCulled = false; return made }
    const person = rig.current ? new Set(Object.values(rig.current)) : null
    const markers = at.bones.map((_, i) => {
      const marker = onTop(new Mesh(dot, paint))
      marker.scale.setScalar(size)
      marker.userData.bone = i
      marker.userData.aside = !!person && !person.has(at.bones[i])
      return marker
    })
    const pole = onTop(new Mesh(new OctahedronGeometry(1), new MeshBasicMaterial({ color: POLE, depthTest: false, transparent: true, opacity: 0.95 })))
    pole.scale.setScalar(size * 1.6)
    pole.visible = false
    const poleLine = onTop(new Line(new BufferGeometry().setFromPoints([new Vector3(), new Vector3()]), new LineBasicMaterial({ color: POLE, depthTest: false, transparent: true, opacity: 0.7 })))
    poleLine.visible = false
    // Each at its joint, and the pole's line from its bend, before every drawing.
    const placeDots = () => {
      markers.forEach((marker, i) => { at.bones[i].getWorldPosition(marker.position); marker.updateMatrixWorld() })
      pole.updateMatrixWorld()
      const bone = reachOf(editingRef.current).bone
      if (poleLine.visible && bone?.parent) {
        const from = bone.parent.getWorldPosition(new Vector3())
        const line = poleLine.geometry.getAttribute('position')
        line.setXYZ(0, from.x, from.y, from.z)
        line.setXYZ(1, pole.position.x, pole.position.y, pole.position.z)
        line.needsUpdate = true
      }
    }
    const gizmos = (['translate', 'rotate', 'scale'] as const).map(mode => {
      const gizmo = new TransformControls(at.camera, canvas)
      gizmo.setMode(mode)
      gizmo.setSpace('local')
      return gizmo
    })
    // Where a joint moved by reach is wanted: moved by the Move gizmo, followed by its
    // chain -- two bones bending toward the pole; the pole moved, the bend follows it.
    const goal = new Object3D()
    at.scene.add(goal)
    const solve = (bone: Object3D, to: Vector3) => {
      const { ikLength } = editingRef.current
      if (ikLength === 2 && chainOf(bone, 2).length === 2) reachTwo(bone, to, pole.position)
      else reach(chainOf(bone, ikLength), bone, to)
    }
    const [moving] = gizmos
    moving.addEventListener('objectChange', () => {
      const { bone } = reachOf(editingRef.current)
      if (!bone) return
      if (moving.object === goal) solve(bone, goal.position)
      else if (moving.object === pole) solve(bone, bone.getWorldPosition(new Vector3()))
    })
    // Let go: its goal back where the joint got to (as near as it could).
    moving.addEventListener('mouseUp', () => {
      const { bone } = reachOf(editingRef.current)
      if (moving.object === goal && bone) bone.getWorldPosition(goal.position)
    })
    for (const gizmo of gizmos) {
      gizmo.addEventListener('change', () => drawRef.current())
      gizmo.addEventListener('dragging-changed', event => { if (controls.current) controls.current.enabled = !event.value })
      // One gizmo at a time: a press the arrows took isn't the rings' too.
      gizmo.addEventListener('mouseDown', () => { pauseRef.current(); for (const other of gizmos) if (other !== gizmo) other.enabled = false })
      gizmo.addEventListener('mouseUp', () => { for (const other of gizmos) other.enabled = true; remember() })
      at.scene.add(gizmo.getHelper())
    }
    skeleton.visible = false
    markers.forEach(marker => { marker.visible = false })
    at.scene.add(skeleton, ...markers, pole, poleLine)
    // A joint's dot or the pole pressed: chosen -- before the view takes the press to
    // turn. Not posing, a part clicked (pressed and let go where it was): chosen.
    const ray = new Raycaster(), point = new Vector2()
    const aim = (event: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      point.set((event.clientX - r.left) / r.width * 2 - 1, -((event.clientY - r.top) / r.height * 2 - 1))
      ray.setFromCamera(point, at.camera)
    }
    let press: { x: number; y: number; onGizmo: boolean } | null = null
    const pick = (event: PointerEvent) => {
      const onGizmo = gizmos.some(gizmo => gizmo.dragging || (!!gizmo.object && gizmo.axis !== null))
      press = { x: event.clientX, y: event.clientY, onGizmo }
      const e = editingRef.current
      if (!e.posing) return
      aim(event)
      placeDots()
      // The pole first, even under the gizmo's handles (it sits by the limb, often
      // where the hand's gizmo is drawn) -- unless it's chosen: then its gizmo's press.
      if (pole.visible && !e.onPole && ray.intersectObject(pole, false).length) {
        event.stopImmediatePropagation()
        editRef.current({ onPole: true })
        return
      }
      if (onGizmo) return
      const hit = ray.intersectObjects(markers.filter(marker => marker.visible), false)[0]
      if (!hit) return
      event.stopImmediatePropagation()
      editRef.current({ joint: hit.object.userData.bone as number, onPole: false, tool: e.tool === 'view' ? 'rotate' : e.tool })
    }
    const release = (event: PointerEvent) => {
      const from = press, e = editingRef.current
      press = null
      if (!from || from.onGizmo || e.posing || e.tool === 'view' || Math.hypot(event.clientX - from.x, event.clientY - from.y) > 4) return
      aim(event)
      const hit = ray.intersectObjects(at.parts.slice(1), false)[0]
      editRef.current({ part: hit ? at.parts.indexOf(hit.object) : 0 })
    }
    canvas.addEventListener('pointerdown', pick, { capture: true })
    canvas.addEventListener('pointerup', release)
    kit.current = { shown: [skeleton, ...markers], pole, poleLine, gizmos: gizmos as unknown as Gizmo[], goal, placeDots, pick, release }
  })())

  // Back in its box: what's shown to work on it put away, what was done to it kept.
  const toBox = () => {
    pausePlaying()
    setWhole(false)
    edit({ posing: false, tool: 'view', onPole: false })
  }
  const toBoxRef = useRef(toBox)
  toBoxRef.current = toBox
  const pose = (on: boolean) => {
    const e = editingRef.current
    // The joint chosen before is chosen again; the first time, a person's hips or
    // else its root, so a gizmo shows at once.
    const hips = rig.current?.Hips ? stage.current?.bones.indexOf(rig.current.Hips) ?? -1 : -1
    edit(on ? { posing: true, joint: e.joint ?? Math.max(0, hips), onPole: false, tool: e.tool === 'view' ? 'rotate' : e.tool } : { posing: false, onPole: false, tool: 'view' })
  }
  // One of a person's poses (lib/modelHumanoid, lib/motions): taken from its rest.
  const takePose = (pose: { frame: Frame; aims: Aims }) => {
    const at = stage.current, person = rig.current
    if (!at || !person) return
    pausePlaying()
    at.setPose(undefined)
    applyFrame(person, restOf(person), pose.frame, pose.aims)
    edit({ onPole: false })
    remember()
  }
  // Chosen from the list: a basic one, or a ready-made one.
  const choosePose = (value: string) => {
    const [kind, name] = [value.slice(0, value.indexOf(':')), value.slice(value.indexOf(':') + 1)]
    if (kind === 'basic') takePose(basicPose(name as typeof BASIC_POSES[number]))
    const made = poseList.find(one => one.id === name)
    if (kind === 'pose' && made) takePose({ frame: frameAt(made, 0), aims: made.aims })
  }
  // Its pose, or its parts, as they were made.
  const resetShape = () => {
    const at = stage.current
    if (!at) return
    pausePlaying()
    if (editingRef.current.posing) at.setPose(undefined)
    else at.setParts(undefined)
    edit({ onPole: false })
    remember()
  }
  // Drawn without what's shown to work on it: for a picture of it.
  const bare = async <T,>(make: () => Promise<T>): Promise<T> => {
    const tools = kit.current
    const shown = tools ? [...tools.shown, tools.pole, tools.poleLine, ...tools.gizmos.map(gizmo => gizmo.getHelper())] : []
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
      onDone({ png: await bare(() => at.picture(width, height)), view: now.view, pose: now.pose, parts: now.parts })
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
        if (wholeRef.current) { event.stopImmediatePropagation(); toBoxRef.current(); return }
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
      pauseRef.current()
      if (back) future.current.push(history.current.pop()!)
      else history.current.push(future.current.pop()!)
      const now = history.current[history.current.length - 1]
      at.setParts(now.parts)
      at.setPose(now.pose)
      at.place(now.view)
      controls.current?.update()
      editRef.current({ onPole: false })
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
  const person = ready && !!rig.current
  useEffect(() => {
    if (!whole || !person || poseList.length) return
    let live = true
    Promise.all([posesOf(), playables()])
      .then(([poses, animations]) => { if (live) { setPoseList(poses); setPlayList(animations) } })
      .catch(error => console.error('Poses not fetched:', error))
    return () => { live = false }
  }, [whole, person, poseList.length])
  const { posing, tool, joint, part, ik, ikLength, onPole, gizmos } = editing
  const poleShown = ready && reachOf(editing).twoBone
  const shaping = !posing && tool !== 'view'
  const keep = (event: { stopPropagation(): void }) => event.stopPropagation()
  const layer = whole ? 'var(--layer-dialog)' : 'var(--layer-menu)'
  const hint: TranslationKey = posing ? (onPole && poleShown ? 'atrium.model.poleHint' : poleShown ? 'atrium.model.poleShown' : 'atrium.model.poseHint')
    : shaping ? 'atrium.model.partHint' : 'atrium.model.hint'
  const hintChip = <FootHint data-model-status="">{status === 'loading' || fetching ? t('atrium.model.loading') : ready ? t(hint) : status.error}</FootHint>
  // The foot of the atrium's screen (LobbyScene's), where the tools' hints are.
  const foot = document.querySelector('[data-hud-foot]')
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
              onPointerDown={event => { if (event.target === event.currentTarget) toBox() }}
              onWheel={keep}
            >
              <div ref={room} className="relative w-[94vw] h-[86vh] border border-nier-border/30" style={{ background: 'rgb(var(--c-ground) / 0.6)' }} />
              <div className="absolute bottom-[2vh] left-1/2 -translate-x-1/2 pointer-events-none">{hintChip}</div>
            </div>
          )}
          {ready && editable && whole && (
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
                  onClick={() => edit({ tool: one, onPole: false })}
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
            className="fixed left-0 top-0 flex flex-wrap items-center justify-end gap-1.5"
            style={{ zIndex: layer, pointerEvents: 'none', maxWidth: 'calc(100vw - 16px)' }}
          >
            {/* In its box: a picture of it, its view back, and the rest on the full screen. */}
            {!whole && ready && editable && onSnapshot && (
              <button type="button" data-model-snapshot="" onClick={() => void snapshot()} className={QUIET}>{t('atrium.model.snapshot')}</button>
            )}
            {!whole && ready && <button type="button" data-model-reset="" onClick={reset} className={QUIET}>{t('atrium.model.reset')}</button>}
            {!whole && ready && (
              <button type="button" data-model-whole-switch="" onClick={() => setWhole(true)} className={QUIET}>{t('atrium.model.moreTools')}</button>
            )}
            {whole && ready && editable && bones.length > 0 && (
              <button type="button" data-model-pose="" aria-pressed={posing} onClick={() => pose(!posing)} className={posing ? ON : QUIET}>{t('atrium.model.pose')}</button>
            )}
            {posing && (
              <>
                <select data-model-bone="" aria-label={t('atrium.model.bone')} value={joint ?? ''} onChange={e => edit({ joint: e.target.value === '' ? null : Number(e.target.value), onPole: false })} className={`${SELECT} max-w-[10rem]`}>
                  <option value="">{t('atrium.model.bone')}</option>
                  {bones.map((name, i) => <option key={i} value={i}>{name}</option>)}
                </select>
                <button type="button" data-model-ik="" aria-pressed={ik} title={t('atrium.model.ikHint')} onClick={() => edit({ ik: !ik, onPole: false })} className={ik ? ON : QUIET}>{t('atrium.model.ik')}</button>
                {ik && (
                  <select data-model-ik-length="" aria-label={t('atrium.model.chain')} title={t('atrium.model.chain')} value={ikLength} onChange={e => edit({ ikLength: Number(e.target.value), onPole: false })} className={SELECT}>
                    {[1, 2, 3, 4].map(length => <option key={length} value={length}>{t('atrium.model.chainOf', { n: length })}</option>)}
                  </select>
                )}
                <button type="button" data-model-reset-pose="" onClick={resetShape} className={QUIET}>{t('atrium.model.resetPose')}</button>
              </>
            )}
            {whole && person && editable && (
              <>
                <select data-model-poses="" aria-label={t('atrium.model.poses')} value="" onChange={e => { if (e.target.value) choosePose(e.target.value) }} className={`${SELECT} max-w-[11rem]`}>
                  <option value="">{t('atrium.model.poses')}</option>
                  <optgroup label={t('atrium.model.group.basic')}>
                    {BASIC_POSES.map(name => <option key={name} value={`basic:${name}`}>{t(`atrium.model.pose.${name}` as TranslationKey)}</option>)}
                  </optgroup>
                  {POSE_GROUPS.map(group => (
                    <optgroup key={group} label={t(`atrium.model.group.${group}` as TranslationKey)}>
                      {poseList.filter(one => one.group === group).map(one => <option key={one.id} value={`pose:${one.id}`}>{one.name}</option>)}
                    </optgroup>
                  ))}
                </select>
                <select data-model-animations="" aria-label={t('atrium.model.animations')} value={playing?.id ?? ''} onChange={e => { const chosen = playList.find(one => one.id === e.target.value); if (chosen) void play(chosen) }} className={`${SELECT} max-w-[11rem]`}>
                  <option value="">{t('atrium.model.animations')}</option>
                  {ANIMATION_GROUPS.map(group => (
                    <optgroup key={group} label={t(`atrium.model.group.${group}` as TranslationKey)}>
                      {playList.filter(one => one.group === group).map(one => <option key={one.id} value={one.id}>{one.name}</option>)}
                    </optgroup>
                  ))}
                </select>
                {playing && (
                  <button type="button" data-model-play="" aria-pressed={!playing.paused} onClick={() => (playing.paused ? resume() : pausePlaying())} className={playing.paused ? QUIET : ON}>
                    {t(playing.paused ? 'atrium.model.play' : 'atrium.model.pause')}
                  </button>
                )}
              </>
            )}
            {shaping && (
              <>
                {partNames.length > 1 && (
                  <select data-model-part="" aria-label={t('atrium.model.part')} value={part} onChange={e => edit({ part: Number(e.target.value) })} className={`${SELECT} max-w-[10rem]`}>
                    {partNames.map((name, i) => <option key={i} value={i}>{name}</option>)}
                  </select>
                )}
                <button type="button" data-model-reset-parts="" onClick={resetShape} className={QUIET}>{t('atrium.model.resetParts')}</button>
              </>
            )}
            {whole && ready && editable && onSnapshot && !posing && !shaping && (
              <button type="button" data-model-snapshot="" onClick={() => void snapshot()} className={QUIET}>{t('atrium.model.snapshot')}</button>
            )}
            {whole && ready && !posing && !shaping && <button type="button" data-model-reset="" onClick={reset} className={QUIET}>{t('atrium.model.reset')}</button>}
            {whole && (posing || shaping) && (
              <button type="button" data-model-gizmos="" aria-pressed={!gizmos} onClick={() => edit({ gizmos: !gizmos })} className={gizmos ? QUIET : ON}>{t(gizmos ? 'atrium.model.hideGizmos' : 'atrium.model.showGizmos')}</button>
            )}
            {whole && <button type="button" data-model-back="" onClick={toBox} className={QUIET}>{t('atrium.model.backToTrace')}</button>}
            {whole && <button type="button" data-model-done="" onClick={() => void finish()} className={ON}>{t('atrium.model.done')}</button>}
          </div>
          {/* What dragging does, at the foot of the screen among the tools' hints. */}
          {!whole && !foot && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 pointer-events-none" style={{ zIndex: layer }}>{hintChip}</div>}
        </>,
        // Inside the atrium's screen, where its own cursor is the only one (index.css).
        scene)}
      {!whole && foot && createPortal(hintChip, foot)}
    </div>
  )
}
