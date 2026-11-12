// Models to start from, made here: four shapes, and two figures -- an artist's
// wooden mannequin, with a man's proportions and a woman's -- rigged, named as
// rigs usually are (Hips, Spine, LeftArm...), so they pose as any rigged model
// does, and with poses to start from. Each is made as a .glb (lib/model3d) and
// placed as any model is. Nobody else's model, so nobody else's licence.
//
// A figure's parts are each moved by one bone, wholly (a mannequin's wooden
// pieces), all one skinned mesh so a .glb keeps its skeleton. At rest it
// stands, arms down; every bone's rest turn is none, so a pose's turns are
// turns from standing.

import type { Bone, BufferGeometry, Object3D } from 'three'

export const STARTERS = ['cube', 'sphere', 'cylinder', 'cone', 'man', 'woman'] as const
export type Starter = typeof STARTERS[number]
export const FIGURE_MARK = 'atriumFigure'

/** A model to start from, as a .glb file. */
export async function starterFile(kind: Starter, name: string): Promise<File> {
  const { asOneFile } = await import('./model3d')
  const object = kind === 'man' || kind === 'woman' ? await figure(kind) : await shape(kind)
  return new File([await asOneFile(object)], `${name}.glb`, { type: 'model/gltf-binary' })
}

async function shape(kind: Exclude<Starter, 'man' | 'woman'>): Promise<Object3D> {
  const { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry } = await import('three')
  const geometry = kind === 'sphere' ? new SphereGeometry(0.5, 48, 32)
    : kind === 'cylinder' ? new CylinderGeometry(0.5, 0.5, 1, 48)
    : kind === 'cone' ? new ConeGeometry(0.5, 1, 48)
    : new BoxGeometry(1, 1, 1)
  const group = new Group()
  group.add(new Mesh(geometry, new MeshStandardMaterial({ color: 0xbdbdbd, roughness: 0.55, metalness: 0.05 })))
  return group
}

// ---- The figures -----------------------------------------------------------------

type V3 = [number, number, number]
interface Build {
  // Where each joint is, standing, in metres: feet on the ground, facing +z.
  joints: Record<string, { at: V3; parent: string | null }>
  parts: { bone: string; kind: 'ball' | 'limb'; at: V3; to?: V3; size: V3 | number }[]
  colour: number
}

function build(kind: 'man' | 'woman'): Build {
  const woman = kind === 'woman'
  const k = woman ? 0.93 : 1
  const sh = woman ? 0.165 : 0.195, hip = woman ? 0.1 : 0.095
  const y = (v: number) => v * k
  const joints: Build['joints'] = {
    Hips: { at: [0, y(0.95), 0], parent: null },
    Spine: { at: [0, y(1.05), 0], parent: 'Hips' },
    Chest: { at: [0, y(1.22), 0], parent: 'Spine' },
    Neck: { at: [0, y(1.43), 0], parent: 'Chest' },
    Head: { at: [0, y(1.53), 0], parent: 'Neck' },
  }
  const parts: Build['parts'] = [
    { bone: 'Hips', kind: 'ball', at: [0, y(0.95), 0], size: woman ? [0.175, 0.105, 0.105] : [0.155, 0.1, 0.1] },
    { bone: 'Spine', kind: 'ball', at: [0, y(1.11), 0], size: woman ? [0.115, 0.1, 0.085] : [0.13, 0.1, 0.09] },
    { bone: 'Chest', kind: 'ball', at: [0, y(1.3), 0], size: woman ? [0.145, 0.15, 0.1] : [0.175, 0.16, 0.11] },
    { bone: 'Neck', kind: 'limb', at: [0, y(1.41), 0], to: [0, y(1.55), 0], size: 0.042 },
    { bone: 'Head', kind: 'ball', at: [0, y(1.64), 0.005], size: [0.088, 0.115, 0.1] },
  ]
  if (woman) for (const side of [-1, 1]) parts.push({ bone: 'Chest', kind: 'ball', at: [side * 0.06, y(1.3), 0.075], size: 0.05 })
  for (const [side, name] of [[1, 'Left'], [-1, 'Right']] as const) {
    const x = side * sh, lx = side * hip
    joints[`${name}Shoulder`] = { at: [side * 0.05, y(1.4), 0], parent: 'Chest' }
    joints[`${name}Arm`] = { at: [x, y(1.4), 0], parent: `${name}Shoulder` }
    joints[`${name}ForeArm`] = { at: [x, y(1.12), 0], parent: `${name}Arm` }
    joints[`${name}Hand`] = { at: [x, y(0.87), 0], parent: `${name}ForeArm` }
    joints[`${name}UpLeg`] = { at: [lx, y(0.92), 0], parent: 'Hips' }
    joints[`${name}Leg`] = { at: [lx, y(0.5), 0], parent: `${name}UpLeg` }
    joints[`${name}Foot`] = { at: [lx, y(0.08), 0], parent: `${name}Leg` }
    parts.push(
      { bone: `${name}Arm`, kind: 'ball', at: [x, y(1.4), 0], size: 0.05 },
      { bone: `${name}Arm`, kind: 'limb', at: [x, y(1.4), 0], to: [x, y(1.12), 0], size: woman ? 0.038 : 0.045 },
      { bone: `${name}ForeArm`, kind: 'ball', at: [x, y(1.12), 0], size: 0.04 },
      { bone: `${name}ForeArm`, kind: 'limb', at: [x, y(1.12), 0], to: [x, y(0.87), 0], size: woman ? 0.032 : 0.038 },
      { bone: `${name}Hand`, kind: 'ball', at: [x, y(0.87), 0], size: 0.03 },
      { bone: `${name}Hand`, kind: 'ball', at: [x, y(0.79), 0], size: [0.03, 0.08, 0.045] },
      { bone: `${name}UpLeg`, kind: 'ball', at: [lx, y(0.92), 0], size: 0.072 },
      { bone: `${name}UpLeg`, kind: 'limb', at: [lx, y(0.92), 0], to: [lx, y(0.5), 0], size: woman ? 0.07 : 0.068 },
      { bone: `${name}Leg`, kind: 'ball', at: [lx, y(0.5), 0], size: 0.056 },
      { bone: `${name}Leg`, kind: 'limb', at: [lx, y(0.5), 0], to: [lx, y(0.08), 0], size: woman ? 0.048 : 0.052 },
      { bone: `${name}Foot`, kind: 'ball', at: [lx, y(0.08), 0], size: 0.04 },
      { bone: `${name}Foot`, kind: 'ball', at: [lx, 0.035, 0.065], size: [0.045, 0.035, 0.11] },
    )
  }
  return { joints, parts, colour: woman ? 0xe2cdb1 : 0xd5bf9f }
}

async function figure(kind: 'man' | 'woman'): Promise<Object3D> {
  const T = await import('three')
  const { mergeGeometries } = await import('three/examples/jsm/utils/BufferGeometryUtils.js')
  const { joints, parts, colour } = build(kind)
  const names = Object.keys(joints)
  const bones = new Map<string, Bone>()
  for (const name of names) {
    const bone = new T.Bone()
    bone.name = name
    bones.set(name, bone)
  }
  // Each placed in its parent's space: the joints are given in the world's.
  for (const name of names) {
    const { at, parent } = joints[name]
    const from = parent ? joints[parent].at : [0, 0, 0]
    bones.get(name)!.position.set(at[0] - from[0], at[1] - from[1], at[2] - from[2])
    if (parent) bones.get(parent)!.add(bones.get(name)!)
  }
  const pieces: BufferGeometry[] = parts.map(part => {
    const index = names.indexOf(part.bone)
    let geometry: BufferGeometry
    if (part.kind === 'ball') {
      const [rx, ry, rz] = typeof part.size === 'number' ? [part.size, part.size, part.size] : part.size
      geometry = new T.SphereGeometry(1, 24, 16)
      geometry.scale(rx, ry, rz)
      geometry.translate(part.at[0], part.at[1], part.at[2])
    } else {
      const a = new T.Vector3(...part.at), b = new T.Vector3(...part.to!)
      const length = a.distanceTo(b)
      geometry = new T.CapsuleGeometry(part.size as number, Math.max(0.001, length - 2 * (part.size as number)), 6, 16)
      geometry.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize()))
      geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
    }
    // Wholly its bone's.
    const count = geometry.getAttribute('position').count
    geometry.setAttribute('skinIndex', new T.Uint16BufferAttribute(new Uint16Array(count * 4).map((_, i) => (i % 4 === 0 ? index : 0)), 4))
    geometry.setAttribute('skinWeight', new T.Float32BufferAttribute(new Float32Array(count * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4))
    return geometry
  })
  const body = mergeGeometries(pieces)
  if (!body) throw new Error('the figure could not be made')
  const mesh = new T.SkinnedMesh(body, new T.MeshStandardMaterial({ color: colour, roughness: 0.62, metalness: 0.02 }))
  mesh.name = kind === 'man' ? 'Mannequin (man)' : 'Mannequin (woman)'
  mesh.add(bones.get('Hips')!)
  mesh.updateMatrixWorld(true)
  mesh.bind(new T.Skeleton(names.map(name => bones.get(name)!)))
  // Known again when it's read back: its poses fit it (FIGURE_POSES).
  mesh.userData[FIGURE_MARK] = kind
  const group = new T.Group()
  group.add(mesh)
  return group
}

// ---- Poses -----------------------------------------------------------------------

// Turns from standing, in degrees about x, y, z (the figure faces +z, its left at
// +x); the hips moved too where a pose lowers them (metres).
export interface FigurePose { turns: Record<string, V3>; hips?: V3 }
export const FIGURE_POSES = {
  stand: { turns: {} },
  relaxed: { turns: { Hips: [0, 0, 4], Spine: [0, 0, -3], Chest: [0, 0, -3], Head: [0, 0, 3], LeftArm: [0, 0, 6], RightArm: [0, 0, -4], RightUpLeg: [-6, 0, -3], RightLeg: [10, 0, 0] } },
  tpose: { turns: { LeftArm: [0, 0, 90], RightArm: [0, 0, -90] } },
  apose: { turns: { LeftArm: [0, 0, 45], RightArm: [0, 0, -45] } },
  walk: { turns: { LeftUpLeg: [-25, 0, 0], LeftLeg: [12, 0, 0], RightUpLeg: [18, 0, 0], RightLeg: [28, 0, 0], RightFoot: [-10, 0, 0], LeftArm: [20, 0, 4], LeftForeArm: [-15, 0, 0], RightArm: [-22, 0, -4], RightForeArm: [-20, 0, 0], Spine: [3, 0, 0] } },
  run: { turns: { Spine: [12, 0, 0], LeftUpLeg: [-60, 0, 0], LeftLeg: [70, 0, 0], RightUpLeg: [25, 0, 0], RightLeg: [85, 0, 0], RightArm: [-50, 0, -5], RightForeArm: [-85, 0, 0], LeftArm: [45, 0, 5], LeftForeArm: [-80, 0, 0] } },
  sit: { hips: [0, -0.45, 0], turns: { LeftUpLeg: [-90, 0, 4], RightUpLeg: [-90, 0, -4], LeftLeg: [90, 0, 0], RightLeg: [90, 0, 0], LeftArm: [-25, 0, 4], RightArm: [-25, 0, -4], LeftForeArm: [-45, 0, 0], RightForeArm: [-45, 0, 0] } },
  kneel: { hips: [0, -0.42, 0], turns: { LeftUpLeg: [-90, 0, 0], LeftLeg: [90, 0, 0], RightUpLeg: [0, 0, 0], RightLeg: [90, 0, 0], RightFoot: [-40, 0, 0] } },
  think: { turns: { Spine: [6, 0, 0], Head: [10, -10, 0], RightArm: [-55, 0, -12], RightForeArm: [-125, 25, 0], LeftArm: [-30, 0, 18], LeftForeArm: [-95, -60, 0] } },
  wave: { turns: { RightArm: [0, 0, -150], RightForeArm: [0, 0, -25], Head: [0, -10, 0], LeftArm: [0, 0, 6] } },
  reach: { turns: { Spine: [-6, 0, 0], LeftArm: [0, 0, 170], RightArm: [0, 0, -170], Head: [-15, 0, 0] } },
} satisfies Record<string, FigurePose>
export type FigurePoseName = keyof typeof FIGURE_POSES
