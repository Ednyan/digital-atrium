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

import type { Object3D, PerspectiveCamera, Vector3 } from 'three'
import type { Trace } from '../types/database'

export const MODEL_FORMATS = ['glb', 'gltf', 'fbx', 'obj', 'stl'] as const
export type ModelFormat = typeof MODEL_FORMATS[number]

/** How it's turned: round the model (yaw), up from level (pitch), both in
 *  radians, and how far away, as a share of the distance its whole sphere fits at. */
export interface ModelView { yaw: number; pitch: number; distance: number }
export interface ModelRecord { format: ModelFormat; view: ModelView }

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
  return {
    format,
    view: {
      yaw: number(view.yaw, -Math.PI * 64, Math.PI * 64, DEFAULT_VIEW.yaw) % (Math.PI * 2),
      pitch: number(view.pitch, -PITCH_MOST, PITCH_MOST, DEFAULT_VIEW.pitch),
      distance: number(view.distance, DISTANCE.least, DISTANCE.most, DEFAULT_VIEW.distance),
    },
  }
}

export const sameView = (a: ModelView, b: ModelView) =>
  Math.abs(a.yaw - b.yaw) < 1e-4 && Math.abs(a.pitch - b.pitch) < 1e-4 && Math.abs(a.distance - b.distance) < 1e-4

/** A still's size in pixels for a box of this shape. */
export function stillSize(aspect: number, side = STILL_SIDE): { width: number; height: number } {
  const shape = Math.min(4, Math.max(0.25, aspect || 1))
  return shape >= 1 ? { width: side, height: Math.round(side / shape) } : { width: Math.round(side * shape), height: side }
}

// ---- Reading ---------------------------------------------------------------------

/** Why a file couldn't be shown, in words for a person. */
export class ModelUnreadable extends Error {}

// A file that points at others beside it (a .gltf's .bin and textures, an FBX's
// textures) has none of them here: each such address is answered with nothing,
// quietly, rather than asked of this site, which would answer with its own page.
async function quietManager() {
  const { LoadingManager } = await import('three')
  const manager = new LoadingManager()
  manager.setURLModifier(url => (/^(data|blob):/.test(url) ? url : 'data:,'))
  return manager
}

export async function parseModel(data: ArrayBuffer, format: ModelFormat): Promise<Object3D> {
  return sameLight(await parseAny(data, format), format)
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

async function parseAny(data: ArrayBuffer, format: ModelFormat): Promise<Object3D> {
  const manager = await quietManager()
  if (format === 'gltf') {
    let json: { buffers?: { uri?: string }[]; images?: { uri?: string }[] }
    try { json = JSON.parse(new TextDecoder().decode(data)) } catch { throw new ModelUnreadable('not a glTF file') }
    const outside = [...(json.buffers ?? []), ...(json.images ?? [])].some(part => part.uri && !part.uri.startsWith('data:'))
    if (outside) throw new ModelUnreadable('this .gltf needs files kept beside it -- export it as .glb, one file')
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
    return new OBJLoader(manager).parse(new TextDecoder().decode(data))
  }
  const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js')
  const { Mesh, MeshStandardMaterial } = await import('three')
  const geometry = new STLLoader(manager).parse(data)
  const coloured = !!(geometry as { hasColors?: boolean }).hasColors
  return new Mesh(geometry, new MeshStandardMaterial({ color: coloured ? 0xffffff : 0xbdbdbd, vertexColors: coloured, roughness: 0.55, metalness: 0.05 }))
}

// ---- The stage -------------------------------------------------------------------

export interface Stage {
  readonly canvas: HTMLCanvasElement
  readonly camera: PerspectiveCamera
  readonly center: Vector3
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
  scene.add(new HemisphereLight(0xffffff, 0x3a3a3a, 0.35))
  const camera = new PerspectiveCamera(30, 1, radius / 200, radius * 200)
  const lamp = new DirectionalLight(0xffffff, 0.9)
  lamp.position.set(radius * 0.6, radius * 1.2, 0)
  lamp.target.position.copy(center)
  camera.add(lamp)
  scene.add(camera, lamp.target, object)

  const halfAngle = () => {
    const up = (camera.fov * Math.PI) / 360
    return Math.min(up, Math.atan(Math.tan(up) * camera.aspect))
  }
  const base = () => radius / Math.sin(halfAngle())
  const place = (view: ModelView) => {
    const d = base() * view.distance, level = Math.cos(view.pitch)
    camera.position.set(center.x + d * level * Math.sin(view.yaw), center.y + d * Math.sin(view.pitch), center.z + d * level * Math.cos(view.yaw))
    camera.lookAt(center)
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
    const was = camera.position.clone()
    place(view)
    const answer = read()
    camera.position.copy(was)
    camera.lookAt(center)
    camera.updateMatrixWorld()
    return answer
  }

  const stage: Stage = {
    canvas,
    camera,
    center,
    base,
    place,
    viewNow: () => {
      const offset = camera.position.clone().sub(center)
      const d = offset.length() || 1
      return { yaw: Math.atan2(offset.x, offset.z), pitch: Math.asin(Math.max(-1, Math.min(1, offset.y / d))), distance: d / base() }
    },
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

/** A model's still, framed from the usual angle, and the record it's kept with. */
export async function modelStill(data: ArrayBuffer, format: ModelFormat): Promise<{ png: Blob; record: ModelRecord }> {
  const stage = await makeStage(await parseModel(data, format))
  try {
    const { width, height } = stillSize(stage.silhouette(DEFAULT_VIEW))
    stage.setSize(width, height)
    const view = stage.framed(DEFAULT_VIEW)
    stage.place(view)
    return { png: await stage.picture(width, height), record: { format, view } }
  } finally {
    stage.dispose()
  }
}

// Each model as a PNG of the same name, for the picture import -- its file and
// its record remembered with it (modelOrigin), for the trace made of it to keep.
const origins = new WeakMap<File, { source: File; record: ModelRecord }>()
export const modelOrigin = (png: File) => origins.get(png)

/** A batch of files with every model among them made its still. One that can't
 *  be read is left out, and reported. */
export async function withModelsAsPng(files: File[], onUnreadable: (file: File, error: unknown) => void): Promise<File[]> {
  const out: File[] = []
  for (const file of files) {
    const format = formatOf(file.name)
    if (!format) { out.push(file); continue }
    try {
      const { png, record } = await modelStill(await file.arrayBuffer(), format)
      const still = new File([png], file.name.replace(/\.[^.]+$/, '.png'), { type: 'image/png' })
      origins.set(still, { source: file, record })
      out.push(still)
    } catch (error) {
      onUnreadable(file, error)
    }
  }
  return out
}
