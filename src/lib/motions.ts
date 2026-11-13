// Poses and animations to give a person's skeleton (lib/modelHumanoid): each a
// run of frames, read from a recording or an animation and kept small -- each
// part's own turn a frame, as whole numbers; a part that never moves, once; one
// that never turns at all, not at all. Made by scripts/build-motions.mjs from
// the Quaternius animation libraries (CC0) and CMU's motion capture database,
// kept in src/assets/motions (with their licences), fetched the first time
// they're asked for.

import { Quaternion, Vector3 } from 'three'
import { BODY, type Aims, type BodyPart, type Frame } from './modelHumanoid.ts'

export type MotionKind = 'pose' | 'animation'
export interface Motion {
  id: string
  name: string
  group: string
  fps: number
  frames: number
  loop: boolean
  aims: Aims
  // Where the hips have gone, 3 numbers a frame.
  hips: Float32Array
  // Each part's own turn, 4 numbers a frame -- or 4 in all, if it never changes.
  own: Partial<Record<BodyPart, Float32Array>>
}

// As kept: whole numbers (Int16, little-endian) in base64.
export interface StoredMotion {
  id: string
  name: string
  group: string
  fps: number
  frames: number
  loop: boolean
  aims: Partial<Record<BodyPart, [number, number, number]>>
  hips: string
  own: Partial<Record<BodyPart, string>>
}

const TURN = 32767, DEPTH = 10000
const toBase64 = (values: Int16Array) => {
  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength)
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}
const fromBase64 = (text: string) => {
  const raw = atob(text)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return new Int16Array(bytes.buffer)
}

/** Frames read one after another (the same aims), kept as a motion. */
export function storeMotion(head: Omit<StoredMotion, 'aims' | 'hips' | 'own' | 'frames'>, aims: Aims, frames: Frame[]): StoredMotion {
  const own: StoredMotion['own'] = {}
  for (const part of BODY) {
    const turns = frames.map(frame => frame.own[part] ?? new Quaternion())
    // Each the same side of the sphere as the one before, to blend between.
    for (let i = 1; i < turns.length; i++) if (turns[i].dot(turns[i - 1]) < 0) turns[i] = new Quaternion(-turns[i].x, -turns[i].y, -turns[i].z, -turns[i].w)
    const first = turns[0]
    const still = turns.every(turn => Math.abs(turn.dot(first)) > 1 - 1e-6)
    if (still && Math.abs(first.w) > 1 - 1e-6) continue
    const kept = still ? [first] : turns
    own[part] = toBase64(Int16Array.from(kept.flatMap(turn => [turn.x, turn.y, turn.z, turn.w].map(v => Math.round(v * TURN)))))
  }
  return {
    ...head,
    frames: frames.length,
    aims: Object.fromEntries(Object.entries(aims).map(([part, aim]) => [part, [aim!.x, aim!.y, aim!.z].map(v => Math.round(v * 1e4) / 1e4)])) as StoredMotion['aims'],
    hips: toBase64(Int16Array.from(frames.flatMap(frame => frame.hips.toArray().map(v => Math.round(Math.max(-3, Math.min(3, v)) * DEPTH))))),
    own,
  }
}

/** A motion as kept, ready to play. */
export function readMotion(stored: StoredMotion): Motion {
  const own: Motion['own'] = {}
  for (const [part, text] of Object.entries(stored.own) as [BodyPart, string][]) own[part] = Float32Array.from(fromBase64(text), v => v / TURN)
  return {
    ...stored,
    aims: Object.fromEntries(Object.entries(stored.aims).map(([part, aim]) => [part, new Vector3(...aim!)])),
    hips: Float32Array.from(fromBase64(stored.hips), v => v / DEPTH),
    own,
  }
}

export const lengthOf = (motion: Motion) => motion.frames / motion.fps

// ---- The library, fetched as it's asked for --------------------------------------

export type MotionFile = 'poses' | 'quaternius' | 'cmu'
export interface Playable { id: string; name: string; group: string; file: MotionFile; seconds: number; loop: boolean }
const URLS: Record<MotionFile | 'index', () => Promise<{ default: string }>> = {
  index: () => import('../assets/motions/index.json?url'),
  poses: () => import('../assets/motions/poses.json?url'),
  quaternius: () => import('../assets/motions/quaternius.json?url'),
  cmu: () => import('../assets/motions/cmu.json?url'),
}
const fetched = new Map<string, Promise<unknown>>()
const fetchOnce = <T,>(name: MotionFile | 'index'): Promise<T> => {
  if (!fetched.has(name)) {
    const asked = URLS[name]().then(({ default: url }) => fetch(url)).then(answer => {
      if (!answer.ok) throw new Error(`the motions could not be fetched (${answer.status})`)
      return answer.json()
    })
    // Asked again after a failure: fetched again.
    asked.catch(() => fetched.delete(name))
    fetched.set(name, asked)
  }
  return fetched.get(name) as Promise<T>
}
const library = new Map<MotionFile, Promise<Map<string, Motion>>>()
const motionsOf = (file: MotionFile) => {
  if (!library.has(file)) library.set(file, fetchOnce<{ clips: StoredMotion[] }>(file).then(({ clips }) => new Map(clips.map(clip => [clip.id, readMotion(clip)]))))
  return library.get(file)!
}

/** The ready-made poses: each one frame. */
export const posesOf = async (): Promise<Motion[]> => [...(await motionsOf('poses')).values()]
/** What can be played: names and lengths, the frames themselves fetched when one is. */
export const playables = () => fetchOnce<Playable[]>('index')
/** One animation, its file fetched if it wasn't. */
export async function motionOf(playable: Pick<Playable, 'id' | 'file'>): Promise<Motion> {
  const motion = (await motionsOf(playable.file)).get(playable.id)
  if (!motion) throw new Error(`no motion ${playable.id}`)
  return motion
}

const a = new Quaternion(), b = new Quaternion()
/** Its pose `seconds` in -- between two frames, blended -- round again if it loops. */
export function frameAt(motion: Motion, seconds: number): Frame {
  const last = motion.frames - 1
  let at = seconds * motion.fps
  at = motion.loop && motion.frames > 1 ? ((at % motion.frames) + motion.frames) % motion.frames : Math.min(last, Math.max(0, at))
  const i = Math.min(last, Math.floor(at)), j = motion.loop ? (i + 1) % motion.frames : Math.min(last, i + 1), k = at - i
  const own: Frame['own'] = {}
  for (const [part, turns] of Object.entries(motion.own) as [BodyPart, Float32Array][]) {
    if (turns.length === 4) { own[part] = new Quaternion(turns[0], turns[1], turns[2], turns[3]).normalize(); continue }
    a.fromArray(turns, i * 4)
    b.fromArray(turns, j * 4)
    own[part] = new Quaternion().slerpQuaternions(a, b, k).normalize()
  }
  const hips = new Vector3().fromArray(motion.hips, i * 3).lerp(new Vector3().fromArray(motion.hips, j * 3), k)
  return { own, hips }
}
