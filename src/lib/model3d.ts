// 3D models -- glTF/GLB, FBX, OBJ, STL -- as traces. A model is a picture trace
// like any other: its picture (media_url) is a still of the model with nothing
// behind it, so its box, crop, look, export and everything else that knows
// pictures already know it. The model's own file rides in the trace's
// image_url, which every path that carries a trace's files already carries
// (.atrium export and import, copies, moves to Drive, Upload to Online), and
// Trace.model says which format it is and how it's turned. Opened
// (components/ModelLive), it turns live; let go, its still is made again.
//
// three is fetched only when a model is around: every import below is inside a
// function, destructured where it's awaited, so the bundler keeps only the
// parts used (lib/exr does the same).

import type { Bone, Object3D, PerspectiveCamera, Scene, Vector3 } from 'three'
import type { Trace } from '../types/database'

export const MODEL_FORMATS = ['glb', 'gltf', 'fbx', 'obj', 'stl'] as const
export type ModelFormat = typeof MODEL_FORMATS[number]

/** How it's turned: round the model (yaw), up from level (pitch), both in
 *  radians, how far away, as a share of the distance its whole sphere fits at,
 *  and what it turns about, moved from its middle (pan, in its sphere's radii). */
export interface ModelView { yaw: number; pitch: number; distance: number; pan?: [number, number, number] }
/** How it's lit: a kind of light and how bright; whether its textures show; and,
 *  with them off, a colour for all of it. */
export const MODEL_LIGHTS = ['studio', 'soft', 'sun', 'night'] as const
export type ModelLight = typeof MODEL_LIGHTS[number]
export interface ModelLook { light: ModelLight; exposure: number; textures?: boolean; colour?: string }
export const DEFAULT_LOOK: ModelLook = { light: 'studio', exposure: 1 }
/** How it's posed: each bone moved from its rest, by its place among the model's
 *  bones (as they're met, in the file's order) -- its turn (r, a quaternion
 *  [x, y, z, w]), and where it's moved (t) and how it's scaled (s), in its parent's units. */
export interface BonePose { r: [number, number, number, number]; t?: [number, number, number]; s?: [number, number, number] }
export type ModelPose = Record<string, BonePose>
// `textured`: whether it came with textures (pictures on its surfaces).
export interface ModelRecord { format: ModelFormat; view: ModelView; look?: ModelLook; pose?: ModelPose; textured?: boolean }

/** Whether its textures show: as its look says, else whether it has any to show. A
 *  model kept before that was known: an STL or a plain OBJ never had them. */
export const texturesOn = (record: Pick<ModelRecord, 'look' | 'textured' | 'format'>) =>
  record.look?.textures ?? record.textured ?? !(record.format === 'stl' || record.format === 'obj')

export const MODEL_ACCEPT = MODEL_FORMATS.map(format => `.${format}`).join(',')
export const DEFAULT_VIEW: ModelView = { yaw: Math.PI / 5, pitch: 0.32, distance: 1 }
// Never quite straight down or up: the view would flip over the top.
const PITCH_MOST = Math.PI / 2 - 0.01
const DISTANCE = { least: 0.05, most: 20 }
// A still's longer side, in pixels; a snapshot's is twice that.
export const STILL_SIDE = 1280

export function formatOf(name: string): ModelFormat | null {
  const extension = name.split(/[?#]/)[0].split('.').pop()?.toLowerCase() ?? ''
  return MODEL_FORMATS.find(format => format === extension) ?? null
}
export const isModelFile = (file: { name: string }) => formatOf(file.name) !== null
export const isModelTrace = (trace: Pick<Trace, 'type' | 'model' | 'imageUrl'>) => trace.type === 'image' && !!trace.model && !!trace.imageUrl

/** A record as kept in a row -- the trust boundary: hand-written, or from a file. */
export function asModelRecord(raw: unknown): ModelRecord | undefined {
  const value = typeof raw === 'string' ? (() => { try { return JSON.parse(raw) } catch { return null } })() : raw
  if (!value || typeof value !== 'object') return undefined
  const format = MODEL_FORMATS.find(one => one === (value as { format?: unknown }).format)
  if (!format) return undefined
  const view = (value as { view?: Record<string, unknown> }).view ?? {}
  const number = (x: unknown, least: number, most: number, otherwise: number) =>
    typeof x === 'number' && Number.isFinite(x) ? Math.min(most, Math.max(least, x)) : otherwise
  const pan = Array.isArray(view.pan) && view.pan.length === 3 && view.pan.every(v => typeof v === 'number' && Number.isFinite(v))
    ? view.pan.map(v => Math.min(50, Math.max(-50, v as number))) as [number, number, number]
    : undefined
  const look = (value as { look?: Record<string, unknown> }).look
  const light = MODEL_LIGHTS.find(one => one === look?.light)
  const pose = asPose((value as { pose?: unknown }).pose)
  return {
    format,
    view: {
      yaw: number(view.yaw, -Math.PI * 64, Math.PI * 64, DEFAULT_VIEW.yaw) % (Math.PI * 2),
      pitch: number(view.pitch, -PITCH_MOST, PITCH_MOST, DEFAULT_VIEW.pitch),
      distance: number(view.distance, DISTANCE.least, DISTANCE.most, DEFAULT_VIEW.distance),
      ...(pan && pan.some(Boolean) ? { pan } : {}),
    },
    ...(look && typeof look === 'object' ? {
      look: {
        light: light ?? DEFAULT_LOOK.light,
        exposure: number(look.exposure, 0.1, 8, DEFAULT_LOOK.exposure),
        ...(typeof look.textures === 'boolean' ? { textures: look.textures } : {}),
        ...(typeof look.colour === 'string' && /^#[0-9a-f]{6}$/i.test(look.colour) ? { colour: look.colour } : {}),
      },
    } : {}),
    ...(pose ? { pose } : {}),
    ...(typeof (value as { textured?: unknown }).textured === 'boolean' ? { textured: (value as { textured: boolean }).textured } : {}),
  }
}

// Each bone's, by a place it could have: its quaternion made whole (length 1), its
// move and scale numbers -- or none. A turn alone, as first kept, is read as one.
const numbers = (value: unknown, count: number) => Array.isArray(value) && value.length === count && value.every(v => typeof v === 'number' && Number.isFinite(v))
function asPose(raw: unknown): ModelPose | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const pose: ModelPose = {}
  for (const [key, kept] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d{1,4}$/.test(key)) continue
    const bone = (Array.isArray(kept) ? { r: kept } : kept ?? {}) as { r?: unknown; t?: unknown; s?: unknown }
    if (!numbers(bone.r, 4)) continue
    const length = Math.hypot(...(bone.r as number[]))
    if (length < 1e-6) continue
    pose[key] = {
      r: (bone.r as number[]).map(v => v / length) as BonePose['r'],
      ...(numbers(bone.t, 3) ? { t: bone.t as BonePose['t'] } : {}),
      ...(numbers(bone.s, 3) && (bone.s as number[]).every(v => Math.abs(v) > 1e-4) ? { s: bone.s as BonePose['s'] } : {}),
    }
  }
  return Object.keys(pose).length ? pose : undefined
}

export const sameView = (a: ModelView, b: ModelView) =>
  Math.abs(a.yaw - b.yaw) < 1e-4 && Math.abs(a.pitch - b.pitch) < 1e-4 && Math.abs(a.distance - b.distance) < 1e-4 &&
  [0, 1, 2].every(i => Math.abs((a.pan?.[i] ?? 0) - (b.pan?.[i] ?? 0)) < 1e-4)

/** A still's size in pixels for a box of this shape. */
export function stillSize(aspect: number, side = STILL_SIDE): { width: number; height: number } {
  const shape = Math.min(4, Math.max(0.25, aspect || 1))
  return shape >= 1 ? { width: side, height: Math.round(side / shape) } : { width: Math.round(side * shape), height: side }
}

// ---- Reading ---------------------------------------------------------------------

/** Why a file couldn't be shown, in words for a person. */
export class ModelUnreadable extends Error {}

// A file that points at others beside it (a .gltf's .bin and textures, an OBJ's
// .mtl, an FBX's textures) is given them from `sides` -- the files dropped with
// it, by name -- and every other such address is answered with nothing, quietly,
// rather than asked of this site, which would answer with its own page.
const nameOf = (url: string) => { try { return decodeURIComponent(url.split(/[?#]/)[0].split(/[\\/]/).pop() ?? '').toLowerCase() } catch { return '' } }
async function sideManager(sides: Map<string, Blob>, used: Set<string>) {
  const { LoadingManager } = await import('three')
  const urls = new Map<string, string>()
  // Everything it asked for, there: its pictures load after the model is read.
  let pending = 0
  const settled: Array<() => void> = []
  const done = () => { if (--pending <= 0) settled.splice(0).forEach(go => go()) }
  const manager = new LoadingManager(undefined, undefined, done)
  manager.onStart = () => {}
  manager.itemStart = (start => (url: string) => { pending++; start.call(manager, url) })(manager.itemStart)
  manager.itemEnd = (end => (url: string) => { end.call(manager, url); done() })(manager.itemEnd)
  manager.setURLModifier(url => {
    if (/^(data|blob):/.test(url)) return url
    const name = nameOf(url), side = sides.get(name)
    if (!side) return 'data:,'
    used.add(name)
    if (!urls.has(name)) urls.set(name, URL.createObjectURL(side))
    return urls.get(name)!
  })
  const loaded = () => (pending <= 0 ? Promise.resolve() : Promise.race([new Promise<void>(go => settled.push(go)), new Promise<void>(go => setTimeout(go, 15_000))]))
  const letGo = () => urls.forEach(url => URL.revokeObjectURL(url))
  return { manager, loaded, letGo }
}

/** A model read, its side files from `sides` (lower-case names), each one used named in `used`. */
export async function parseModel(data: ArrayBuffer, format: ModelFormat, sides = new Map<string, Blob>(), used = new Set<string>()): Promise<Object3D> {
  const { manager, loaded, letGo } = await sideManager(sides, used)
  try {
    const object = await parseAny(data, format, manager, sides, used)
    await loaded()
    return await sameLight(object, format)
  } finally {
    // Its pictures are read by now; the addresses they were read from go.
    setTimeout(letGo, 1000)
  }
}

// OBJ's and FBX's materials are an older kind, lit by lamps alone: under the room's
// light glTF's read, they came out flat white. Each is made the kind glTF's are, its
// colour and pictures kept; an OBJ with no materials of its own (plain white) a grey.
async function sameLight(object: Object3D, format: ModelFormat): Promise<Object3D> {
  const { MeshStandardMaterial } = await import('three')
  object.traverse(part => {
    const mesh = part as Object3D & { isMesh?: boolean; material?: unknown }
    if (!mesh.isMesh || !mesh.material) return
    const made = (old: any) => {
      if (!old || !(old.isMeshPhongMaterial || old.isMeshLambertMaterial || old.isMeshBasicMaterial)) return old
      const plain = format === 'obj' && !old.map && old.color?.getHex() === 0xffffff
      const material = new MeshStandardMaterial({
        color: plain ? 0xbdbdbd : old.color, map: old.map ?? null, normalMap: old.normalMap ?? null, alphaMap: old.alphaMap ?? null,
        emissive: old.emissive ?? 0x000000, emissiveMap: old.emissiveMap ?? null, vertexColors: old.vertexColors,
        transparent: old.transparent, opacity: old.opacity, side: old.side, roughness: 0.6, metalness: 0.05,
      })
      old.dispose()
      return material
    }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(made) : made(mesh.material)
  })
  return object
}

async function parseAny(data: ArrayBuffer, format: ModelFormat, manager: import('three').LoadingManager, sides: Map<string, Blob>, used: Set<string>): Promise<Object3D> {
  if (format === 'gltf') {
    let json: { buffers?: { uri?: string }[]; images?: { uri?: string }[] }
    try { json = JSON.parse(new TextDecoder().decode(data)) } catch { throw new ModelUnreadable('not a glTF file') }
    const missing = (json.buffers ?? []).some(part => part.uri && !part.uri.startsWith('data:') && !sides.has(nameOf(part.uri)))
    if (missing) throw new ModelUnreadable('this .gltf needs the files kept beside it -- drop them with it, or export it as .glb, one file')
  }
  if (format === 'glb' || format === 'gltf') {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
    try {
      return (await new GLTFLoader(manager).parseAsync(data, '')).scene
    } catch (error) {
      throw new ModelUnreadable(/draco/i.test(String(error)) ? 'it is Draco-compressed, which can\'t be read here yet' : String((error as Error)?.message ?? error))
    }
  }
  if (format === 'fbx') {
    const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
    return new FBXLoader(manager).parse(data, '')
  }
  if (format === 'obj') {
    const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js')
    const text = new TextDecoder().decode(data)
    const loader = new OBJLoader(manager)
    // Its materials from its .mtl, where that was dropped with it.
    const library = /^mtllib\s+(.+)$/m.exec(text)?.[1].trim()
    const mtlName = (library && sides.has(nameOf(library)) ? nameOf(library) : undefined) ?? [...sides.keys()].find(name => name.endsWith('.mtl'))
    if (mtlName) {
      const { MTLLoader } = await import('three/examples/jsm/loaders/MTLLoader.js')
      const materials = new MTLLoader(manager).parse(await sides.get(mtlName)!.text(), '')
      materials.preload()
      loader.setMaterials(materials)
      used.add(mtlName)
    }
    return loader.parse(text)
  }
  const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js')
  const { Mesh, MeshStandardMaterial } = await import('three')
  const geometry = new STLLoader().parse(data)
  const coloured = !!(geometry as { hasColors?: boolean }).hasColors
  return new Mesh(geometry, new MeshStandardMaterial({ color: coloured ? 0xffffff : 0xbdbdbd, vertexColors: coloured, roughness: 0.55, metalness: 0.05 }))
}

// ---- The stage -------------------------------------------------------------------

// The lights: the room's all round, a sky, and a lamp beside the eye -- placed in
// the camera's own space (x right, y up, z behind it), so it follows the view.
const LIGHTS: Record<ModelLight, { room: number; sky: number; lamp: number; colour: number; at: [number, number, number] }> = {
  studio: { room: 1, sky: 0.35, lamp: 0.9, colour: 0xffffff, at: [0.6, 1.2, 0] },
  soft: { room: 1.35, sky: 0.6, lamp: 0.25, colour: 0xffffff, at: [0, 1, 0.4] },
  sun: { room: 0.35, sky: 0.3, lamp: 2.4, colour: 0xfff0d8, at: [1.6, 2.4, 0.6] },
  // From beyond it, cold: a rim of light, the rest in shadow.
  night: { room: 0.12, sky: 0.08, lamp: 1.6, colour: 0xa9c1ff, at: [-1.2, 1, -2.2] },
}
type Colourful = { color: { getHex(): number; setHex(hex: number): void; set(value: string): void }; map?: unknown; vertexColors?: boolean; needsUpdate?: boolean }

export interface Stage {
  readonly canvas: HTMLCanvasElement
  readonly camera: PerspectiveCamera
  readonly center: Vector3
  /** What it turns about: its middle, moved by the view's pan (OrbitControls takes this one). */
  readonly target: Vector3
  /** Lit as the look says; its textures shown or not -- off, in the look's colour, or their own. */
  setLook(look: ModelLook, textures?: boolean): void
  /** Whether any of it has a texture. */
  readonly textured: boolean
  /** What's drawn: the model and, for posing, what's shown with it. */
  readonly scene: Scene
  readonly object: Object3D
  /** Its bones, as they're met in the file: what a pose's keys count. */
  readonly bones: Bone[]
  /** Posed so (none: at rest). */
  setPose(pose?: ModelPose): void
  /** Its pose now: the bones turned from their rest. */
  poseNow(): ModelPose | undefined
  /** The distance the model's whole sphere fits at: what ModelView.distance is a share of. */
  base(): number
  place(view: ModelView): void
  viewNow(): ModelView
  /** This view, as near as the model fits the frame from there. */
  framed(view: ModelView): ModelView
  /** The model's shape across against up, seen from there: what a still's box is made to. */
  silhouette(view: ModelView): number
  /** Its drawing size, in pixels: the camera's shape follows. */
  setSize(width: number, height: number): void
  render(): void
  /** A still at this size, transparent where the model isn't. */
  picture(width: number, height: number): Promise<Blob>
  dispose(): void
}

export async function makeStage(object: Object3D, canvas: HTMLCanvasElement = document.createElement('canvas')): Promise<Stage> {
  const { WebGLRenderer, Scene, PerspectiveCamera, Box3, Vector3, Sphere, PMREMGenerator, HemisphereLight, DirectionalLight, NeutralToneMapping } = await import('three')
  const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js')

  const box = new Box3().setFromObject(object)
  if (box.isEmpty()) throw new ModelUnreadable('there is nothing in it to show')
  const center = box.getCenter(new Vector3())
  const radius = box.getBoundingSphere(new Sphere()).radius || 1
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(i => new Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z))

  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true })
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = NeutralToneMapping
  const scene = new Scene()
  // A room's light all round (every material reads it: parseModel makes them so),
  // a faint sky, and a lamp beside the eye, for shape.
  const pmrem = new PMREMGenerator(renderer)
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = environment
  const sky = new HemisphereLight(0xffffff, 0x3a3a3a, 0.35)
  scene.add(sky)
  const camera = new PerspectiveCamera(30, 1, radius / 200, radius * 200)
  const lamp = new DirectionalLight(0xffffff, 0.9)
  lamp.position.set(radius * 0.6, radius * 1.2, 0)
  lamp.target.position.copy(center)
  camera.add(lamp)
  scene.add(camera, lamp.target, object)

  const target = center.clone()
  const halfAngle = () => {
    const up = (camera.fov * Math.PI) / 360
    return Math.min(up, Math.atan(Math.tan(up) * camera.aspect))
  }
  const base = () => radius / Math.sin(halfAngle())
  const place = (view: ModelView) => {
    const [px, py, pz] = view.pan ?? [0, 0, 0]
    target.set(center.x + px * radius, center.y + py * radius, center.z + pz * radius)
    const d = base() * view.distance, level = Math.cos(view.pitch)
    camera.position.set(target.x + d * level * Math.sin(view.yaw), target.y + d * Math.sin(view.pitch), target.z + d * level * Math.cos(view.yaw))
    camera.lookAt(target)
    camera.updateMatrixWorld()
  }
  // How far across and up the model reaches on screen (-1..1 is the frame), seen as placed.
  const reach = () => {
    let x = 0, y = 0, behind = false
    for (const corner of corners) {
      const p = corner.clone().project(camera)
      if (p.z <= -1 || p.z >= 1) behind = true
      x = Math.max(x, Math.abs(p.x))
      y = Math.max(y, Math.abs(p.y))
    }
    return { x, y, behind }
  }
  const withView = <T,>(view: ModelView, read: () => T): T => {
    const was = camera.position.clone(), wasTarget = target.clone()
    place(view)
    const answer = read()
    camera.position.copy(was)
    target.copy(wasTarget)
    camera.lookAt(target)
    camera.updateMatrixWorld()
    return answer
  }
  // Each part's own colour and texture, kept the first time it's changed, to go back to.
  const own = new Map<Colourful, { colour: number; map: unknown; vertexColors: boolean }>()
  const materials: Colourful[] = []
  object.traverse(part => {
    for (const material of [(part as { material?: unknown }).material].flat() as (Colourful | undefined)[]) if (material?.color) materials.push(material)
  })
  const textured = materials.some(material => !!material.map)
  // Its bones, and how each is at rest, to pose from and go back to.
  const bones: Bone[] = []
  object.traverse(part => { if ((part as Bone).isBone) bones.push(part as Bone) })
  const rest = bones.map(bone => ({ r: bone.quaternion.clone(), t: bone.position.clone(), s: bone.scale.clone() }))

  const stage: Stage = {
    canvas,
    camera,
    center,
    target,
    scene,
    object,
    bones,
    base,
    place,
    setPose: pose => {
      bones.forEach((bone, i) => {
        const kept = pose?.[i]
        if (kept) bone.quaternion.set(kept.r[0], kept.r[1], kept.r[2], kept.r[3])
        else bone.quaternion.copy(rest[i].r)
        if (kept?.t) bone.position.set(kept.t[0], kept.t[1], kept.t[2])
        else bone.position.copy(rest[i].t)
        if (kept?.s) bone.scale.set(kept.s[0], kept.s[1], kept.s[2])
        else bone.scale.copy(rest[i].s)
      })
      object.updateMatrixWorld(true)
    },
    poseNow: () => {
      const pose: ModelPose = {}
      bones.forEach((bone, i) => {
        const turned = bone.quaternion.angleTo(rest[i].r) > 1e-4
        const moved = bone.position.distanceTo(rest[i].t) > 1e-6 * (radius || 1)
        const scaled = bone.scale.distanceTo(rest[i].s) > 1e-5
        if (!turned && !moved && !scaled) return
        pose[i] = {
          r: [bone.quaternion.x, bone.quaternion.y, bone.quaternion.z, bone.quaternion.w],
          ...(moved ? { t: [bone.position.x, bone.position.y, bone.position.z] as [number, number, number] } : {}),
          ...(scaled ? { s: [bone.scale.x, bone.scale.y, bone.scale.z] as [number, number, number] } : {}),
        }
      })
      return Object.keys(pose).length ? pose : undefined
    },
    viewNow: () => {
      const offset = camera.position.clone().sub(target)
      const d = offset.length() || 1
      const pan = target.clone().sub(center).divideScalar(radius)
      return {
        yaw: Math.atan2(offset.x, offset.z), pitch: Math.asin(Math.max(-1, Math.min(1, offset.y / d))), distance: d / base(),
        ...(pan.lengthSq() > 1e-8 ? { pan: [pan.x, pan.y, pan.z] as [number, number, number] } : {}),
      }
    },
    setLook: (look, textures) => {
      const light = LIGHTS[look.light] ?? LIGHTS.studio
      scene.environmentIntensity = light.room
      sky.intensity = light.sky
      lamp.intensity = light.lamp
      lamp.color.setHex(light.colour)
      lamp.position.set(light.at[0] * radius, light.at[1] * radius, light.at[2] * radius)
      renderer.toneMappingExposure = look.exposure
      const showing = textures ?? look.textures ?? textured
      for (const material of materials) {
        if (!own.has(material)) own.set(material, { colour: material.color.getHex(), map: material.map ?? null, vertexColors: !!material.vertexColors })
        const its = own.get(material)!
        const map = showing ? its.map : null, vertexColors = showing && its.vertexColors
        if (material.map !== map || material.vertexColors !== vertexColors) {
          material.map = map
          material.vertexColors = vertexColors
          material.needsUpdate = true
        }
        // A colour of its own only with its textures off.
        if (!showing && look.colour) material.color.set(look.colour)
        else material.color.setHex(its.colour)
      }
    },
    textured,
    framed: view => {
      // As near as it can be with every corner of its box in the frame, a margin
      // round it: found by halving, the whole sphere's distance being always far enough.
      let near = DISTANCE.least, far = 1.4
      for (let i = 0; i < 24; i++) {
        const middle = (near + far) / 2
        const r = withView({ ...view, distance: middle }, reach)
        if (r.behind || r.x > 0.92 || r.y > 0.92) near = middle
        else far = middle
      }
      return { ...view, distance: far }
    },
    silhouette: view => {
      const aspect = camera.aspect
      camera.aspect = 1
      camera.updateProjectionMatrix()
      const r = withView({ ...view, distance: 1 }, reach)
      camera.aspect = aspect
      camera.updateProjectionMatrix()
      return Math.min(1.8, Math.max(0.6, r.x / (r.y || 1)))
    },
    setSize: (width, height) => {
      renderer.setPixelRatio(1)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    },
    render: () => renderer.render(scene, camera),
    picture: async (width, height) => {
      const was = { width: canvas.width, height: canvas.height }
      stage.setSize(width, height)
      stage.render()
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
      stage.setSize(was.width, was.height)
      stage.render()
      if (!blob) throw new Error('the picture could not be made')
      return blob
    },
    dispose: () => {
      scene.traverse(part => {
        const mesh = part as { geometry?: { dispose(): void }; material?: unknown }
        mesh.geometry?.dispose()
        for (const material of [mesh.material].flat() as ({ dispose(): void } & Record<string, unknown>)[]) {
          if (!material) continue
          for (const value of Object.values(material)) if ((value as { isTexture?: boolean })?.isTexture) (value as { dispose(): void }).dispose()
          material.dispose()
        }
      })
      environment.dispose()
      pmrem.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }
  return stage
}

// ---- Files -----------------------------------------------------------------------

/** A model's still, framed from the usual angle, and the view it's kept with. */
async function firstStill(object: Object3D): Promise<{ png: Blob; view: ModelView; textured: boolean }> {
  const stage = await makeStage(object)
  try {
    stage.setLook(DEFAULT_LOOK, stage.textured)
    const { width, height } = stillSize(stage.silhouette(DEFAULT_VIEW))
    stage.setSize(width, height)
    const view = stage.framed(DEFAULT_VIEW)
    stage.place(view)
    return { png: await stage.picture(width, height), view, textured: stage.textured }
  } finally {
    stage.dispose()
  }
}

/** A model's still again, as its record says -- turned, lit, coloured -- for a box of this shape. */
export async function renderStill(file: Blob, record: ModelRecord, aspect: number): Promise<Blob> {
  const stage = await makeStage(await parseModel(await file.arrayBuffer(), record.format))
  try {
    stage.setLook(record.look ?? DEFAULT_LOOK, texturesOn(record))
    stage.setPose(record.pose)
    const { width, height } = stillSize(aspect)
    stage.setSize(width, height)
    stage.place(record.view)
    return await stage.picture(width, height)
  } finally {
    stage.dispose()
  }
}

// A model read with files from beside it, made one .glb holding them all: what's
// kept needs nothing beside it ever again.
async function asOneFile(object: Object3D): Promise<ArrayBuffer> {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
  return await new GLTFExporter().parseAsync(object, { binary: true }) as ArrayBuffer
}

// Each model as a PNG of the same name, for the picture import -- its file and
// its record remembered with it (modelOrigin), for the trace made of it to keep.
const origins = new WeakMap<File, { source: File; record: ModelRecord }>()
export const modelOrigin = (png: File) => origins.get(png)

/** A batch of files with every model among them made its still. Files dropped with
 *  a model that it reads (its textures, .mtl, .bin) go into it -- one .glb -- and
 *  aren't placed themselves. One that can't be read is left out, and reported. */
export async function withModelsAsPng(files: File[], onUnreadable: (file: File, error: unknown) => void): Promise<File[]> {
  const out: File[] = []
  const sides = new Map(files.filter(file => !formatOf(file.name)).map(file => [file.name.toLowerCase(), file as Blob]))
  const used = new Set<string>()
  for (const file of files) {
    const format = formatOf(file.name)
    if (!format) { out.push(file); continue }
    try {
      const before = used.size
      const object = await parseModel(await file.arrayBuffer(), format, sides, used)
      const bundled = used.size > before && format !== 'glb'
      const source = bundled ? new File([await asOneFile(object)], file.name.replace(/\.[^.]+$/, '.glb'), { type: 'model/gltf-binary' }) : file
      const { png, view, textured } = await firstStill(object)
      const still = new File([png], file.name.replace(/\.[^.]+$/, '.png'), { type: 'image/png' })
      origins.set(still, { source, record: { format: bundled ? 'glb' : format, view, textured } })
      out.push(still)
    } catch (error) {
      onUnreadable(file, error)
    }
  }
  return out.filter(file => !used.has(file.name.toLowerCase()))
}

/** A cube, the model a new 3D trace starts as, before a file of its own is chosen. */
export async function defaultCubeFile(name = 'Cube'): Promise<File> {
  const { BoxGeometry, Group, Mesh, MeshStandardMaterial } = await import('three')
  const cube = new Group()
  cube.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: 0xbdbdbd, roughness: 0.55, metalness: 0.05 })))
  return new File([await asOneFile(cube)], `${name}.glb`, { type: 'model/gltf-binary' })
}
