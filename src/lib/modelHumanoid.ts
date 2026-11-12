// Poses for anyone: a model whose skeleton is a person's -- whatever its rig
// calls its bones (Hips or pelvis, LeftArm or upperarm_l or upper_arm.L) --
// found by their names, and posed as a reference figure is, in the body's own
// frame (its up, left and forward), so a rig that faces another way takes the
// same pose.
//
// How: the reference's turns are taken as turns from rest -- the torso, legs,
// hands and feet turn as the reference's do, keeping the rig's own posture --
// but the arms are pointed where the reference's point, since rigs rest them
// differently (a T, an A, at the sides).

import { Bone, Euler, MathUtils, Matrix4, Quaternion, Vector3, type Object3D } from 'three'
import { frameTurn, turnBy } from './modelIk.ts'

type V3 = [number, number, number]
const SIDED = ['Shoulder', 'Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot'] as const
// Each after the one it hangs from.
export const BODY = ['Hips', 'Spine', 'Chest', 'Neck', 'Head', ...(['Left', 'Right'] as const).flatMap(side => SIDED.map(part => `${side}${part}` as const))] as const
export type BodyPart = typeof BODY[number]
export type Humanoid = Partial<Record<BodyPart, Bone>>

const PARENT = Object.fromEntries(BODY.map(part => {
  const side = part.startsWith('Left') ? 'Left' : part.startsWith('Right') ? 'Right' : ''
  const own = part.slice(side.length)
  const above: Record<string, string | null> = { Hips: null, Spine: 'Hips', Chest: 'Spine', Neck: 'Chest', Head: 'Neck', Shoulder: 'Chest', Arm: `${side}Shoulder`, ForeArm: `${side}Arm`, Hand: `${side}ForeArm`, UpLeg: 'Hips', Leg: `${side}UpLeg`, Foot: `${side}Leg` }
  return [part, above[own]]
})) as Record<BodyPart, BodyPart | null>

// ---- Finding them -----------------------------------------------------------------

const NOT_BODY = /\b(twist|roll|aim|sec|adj|end|nub|top|tip|leaf|helper|ik|pole|target|ctrl|control|mch|thumb|index|middle|ring|pinky|little|finger|toe|ball|eye|jaw|tongue|teeth|breast|ear|hair)/
const PART_WORDS: [RegExp, string][] = [
  [/\b(hips?|pelvis)\b/, 'Hips'],
  [/\bneck/, 'Neck'],
  [/\bhead\b/, 'Head'],
  [/\b(spine|chest|torso|abdomen|waist)/, 'spine'],
  [/\b(shoulder|clavicle|collar)/, 'Shoulder'],
  [/\b(fore ?arm|low(er)? ?arm|elbow)\b/, 'ForeArm'],
  [/\b(up(per)? ?arm|arm)\b/, 'Arm'],
  [/\b(hand|wrist)\b/, 'Hand'],
  [/\b(up(per)? ?leg|thigh)\b/, 'UpLeg'],
  [/\b(low(er)? ?leg|leg|calf|shin|knee)\b/, 'Leg'],
  [/\b(foot|ankle)\b/, 'Foot'],
]

/** What a bone's name says it is: a part of a body, 'spine' (one of several), or nothing. */
export function partOf(name: string): BodyPart | 'spine' | null {
  // Its words: camelCase and separators apart, a rig's own prefix (mixamorig:) left off.
  const words = name.replace(/^.*[:|]/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const side = words.some(w => w === 'left' || w === 'l') ? 'Left' : words.some(w => w === 'right' || w === 'r') ? 'Right' : ''
  const rest = words.filter(w => !['left', 'l', 'right', 'r'].includes(w)).join(' ')
  if (NOT_BODY.test(rest)) return null
  const found = PART_WORDS.find(([words]) => words.test(rest))?.[1]
  if (!found) return null
  const sided = (SIDED as readonly string[]).includes(found)
  if (sided !== !!side) return null
  return (sided ? `${side}${found}` : found) as BodyPart | 'spine'
}

const isAbove = (upper: Object3D, lower: Object3D) => {
  for (let at = lower.parent; at; at = at.parent) if (at === upper) return true
  return false
}

// A VRM's own names for its bones (userData.humanBone, set as it's read): ours.
const VRM_PARTS: Record<string, BodyPart> = {
  hips: 'Hips', spine: 'Spine', chest: 'Chest', upperChest: 'Chest', neck: 'Neck', head: 'Head',
  ...Object.fromEntries((['Left', 'Right'] as const).flatMap(side => {
    const s = side.toLowerCase()
    return [[`${s}Shoulder`, `${side}Shoulder`], [`${s}UpperArm`, `${side}Arm`], [`${s}LowerArm`, `${side}ForeArm`], [`${s}Hand`, `${side}Hand`], [`${s}UpperLeg`, `${side}UpLeg`], [`${s}LowerLeg`, `${side}Leg`], [`${s}Foot`, `${side}Foot`]]
  })),
}

/** A person's skeleton found among these bones (as they're met, parents first), or none.
 *  A VRM says which is which; any other rig is read by its bones' names. */
export function humanoidOf(bones: Bone[]): Humanoid | null {
  const rig: Humanoid = {}
  const spine: Bone[] = []
  const said = bones.some(bone => bone.userData?.humanBone)
  for (const bone of bones) {
    // (A VRM's upper chest is met after its chest, and taken over it.)
    if (said) {
      const part = VRM_PARTS[bone.userData?.humanBone]
      if (part) rig[part] = bone
      continue
    }
    const part = partOf(bone.name)
    if (part === 'spine') spine.push(bone)
    else if (part && !rig[part]) rig[part] = bone
  }
  // The lowest of the spine's bones and the highest: Spine and Chest.
  const back = spine.filter(bone => !rig.Hips || isAbove(rig.Hips, bone))
  if (back.length) rig.Spine = back[0]
  if (back.length > 1) rig.Chest = back[back.length - 1]
  const needed: BodyPart[] = ['Hips', 'Head', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg']
  if (needed.some(part => !rig[part])) return null
  // Each where it should hang -- or the names said something else.
  for (const part of BODY) {
    const bone = rig[part]
    let above = PARENT[part]
    while (above && !rig[above]) above = PARENT[above]
    if (bone && above && !isAbove(rig[above]!, bone)) return null
  }
  return rig
}

// ---- Posing them ------------------------------------------------------------------

// The reference: where its joints are standing, arms down, facing +z, its left at
// +x (metres) -- what the poses are made on.
const REFERENCE: Record<BodyPart, V3> = (() => {
  const joints: Partial<Record<BodyPart, V3>> = { Hips: [0, 0.95, 0], Spine: [0, 1.05, 0], Chest: [0, 1.22, 0], Neck: [0, 1.43, 0], Head: [0, 1.53, 0] }
  for (const [side, x] of [['Left', 1], ['Right', -1]] as const) {
    Object.assign(joints, {
      [`${side}Shoulder`]: [x * 0.05, 1.4, 0], [`${side}Arm`]: [x * 0.195, 1.4, 0], [`${side}ForeArm`]: [x * 0.195, 1.12, 0], [`${side}Hand`]: [x * 0.195, 0.87, 0],
      [`${side}UpLeg`]: [x * 0.095, 0.92, 0], [`${side}Leg`]: [x * 0.095, 0.5, 0], [`${side}Foot`]: [x * 0.095, 0.08, 0],
    })
  }
  return joints as Record<BodyPart, V3>
})()

// Turns from standing, in degrees about x, y, z of the reference; the hips moved
// too where a pose lowers them (metres, for the reference's length of leg).
export interface Pose { turns: Partial<Record<BodyPart, V3>>; hips?: V3 }
export const POSES = {
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
} satisfies Record<string, Pose>
export type PoseName = keyof typeof POSES

// Pointed where the reference's point, not turned as they turn.
const AIMED: Partial<Record<BodyPart, BodyPart>> = { LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', RightArm: 'RightForeArm', RightForeArm: 'RightHand' }
const FORWARD = new Vector3(0, 0, 1)

/** Which way the body faces, as a turn from the reference's: its left, up and forward. */
function frameOf(at: (part: BodyPart) => Vector3): Quaternion {
  const left = at('LeftUpLeg').sub(at('RightUpLeg')).normalize()
  const up = at('Head').sub(at('Hips'))
  up.addScaledVector(left, -up.dot(left)).normalize()
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(left, up, new Vector3().crossVectors(left, up)))
}

const worldTurn = (part: Object3D) => part.getWorldQuaternion(new Quaternion())
const worldAt = (part: Object3D) => part.getWorldPosition(new Vector3())

/** The rig -- at rest -- posed so. */
export function poseHumanoid(rig: Humanoid, name: PoseName) {
  const pose: Pose = POSES[name]
  // The reference, posed (at rest, every turn of it is none).
  const ref = new Map<BodyPart, Bone>()
  for (const part of BODY) {
    const bone = new Bone()
    const joint = REFERENCE[part], above = PARENT[part]
    const from = above ? REFERENCE[above] : [0, 0, 0]
    bone.position.set(joint[0] - from[0], joint[1] - from[1], joint[2] - from[2])
    const turn = pose.turns[part]
    if (turn) bone.quaternion.setFromEuler(new Euler(...turn.map(MathUtils.degToRad) as V3, 'XYZ'))
    if (above) ref.get(above)!.add(bone)
    ref.set(part, bone)
  }
  if (pose.hips) ref.get('Hips')!.position.add(new Vector3(...pose.hips))
  ref.get('Hips')!.updateMatrixWorld(true)

  // The rig at rest: how each part and what it hangs from are turned, and the body's frame.
  const parts = BODY.filter(part => rig[part])
  const rest = new Map(parts.map(part => [part, worldTurn(rig[part]!)]))
  const restAbove = new Map(parts.map(part => [part, rig[part]!.parent ? worldTurn(rig[part]!.parent!) : new Quaternion()]))
  const frame = frameOf(part => worldAt(rig[part]!))
  const inFrame = (turn: Quaternion) => frame.clone().multiply(turn).multiply(frame.clone().invert())

  // Lowered as far, for its own length of leg.
  if (pose.hips) {
    const hips = rig.Hips!, low: BodyPart = rig.LeftFoot ? 'LeftFoot' : 'LeftLeg'
    const up = new Vector3(0, 1, 0).applyQuaternion(frame)
    const scale = worldAt(hips).sub(worldAt(rig[low]!)).dot(up) / (REFERENCE.Hips[1] - REFERENCE[low][1])
    const to = worldAt(hips).add(new Vector3(...pose.hips).applyQuaternion(frame).multiplyScalar(scale))
    hips.position.copy(hips.parent ? hips.parent.worldToLocal(to) : to)
    hips.updateMatrixWorld(true)
  }

  for (const part of parts) {
    const bone = rig[part]!
    const toward = AIMED[part]
    if (toward && rig[toward]) {
      // Pointed as the reference's, rolled as it is (its forward, turned with it).
      const turned = worldTurn(bone).multiply(rest.get(part)!.clone().invert())
      const wanted = worldAt(ref.get(toward)!).sub(worldAt(ref.get(part)!)).applyQuaternion(frame)
      const wantedRoll = FORWARD.clone().applyQuaternion(worldTurn(ref.get(part)!)).applyQuaternion(frame)
      turnBy(bone, frameTurn(worldAt(rig[toward]!).sub(worldAt(bone)), FORWARD.clone().applyQuaternion(frame).applyQuaternion(turned), wanted, wantedRoll))
      continue
    }
    // Turned as the reference's is beyond what it hangs from -- in the body's frame --
    // after what it hangs from has turned.
    let above = PARENT[part]
    while (above && !rig[above]) above = PARENT[above]
    const own = above ? worldTurn(ref.get(above)!).invert().multiply(worldTurn(ref.get(part)!)) : worldTurn(ref.get(part)!)
    const parentTurned = bone.parent ? worldTurn(bone.parent).multiply(restAbove.get(part)!.clone().invert()) : new Quaternion()
    const want = parentTurned.multiply(inFrame(own)).multiply(rest.get(part)!)
    bone.quaternion.copy((bone.parent ? worldTurn(bone.parent) : new Quaternion()).invert().multiply(want))
    bone.updateMatrixWorld(true)
  }
}

/** Which way the body faces now, in the world. */
export const facingOf = (rig: Humanoid) => FORWARD.clone().applyQuaternion(frameOf(part => worldAt(rig[part]!)))

/** Which way a knee (forward) or an elbow (back) bends, for the body as it is now; none, another joint. */
export function bendFor(rig: Humanoid, middle: Object3D): Vector3 | null {
  const knee = middle === rig.LeftLeg || middle === rig.RightLeg
  if (!knee && middle !== rig.LeftForeArm && middle !== rig.RightForeArm) return null
  return knee ? facingOf(rig) : facingOf(rig).negate()
}
