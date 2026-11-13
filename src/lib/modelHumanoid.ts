// Poses and animations for anyone: a model whose skeleton is a person's --
// whatever its rig calls its bones (Hips or pelvis, LeftArm or upperarm_l or
// upper_arm.L), fingers too -- found by their names (or, in a VRM, by what the
// file says), and moved as another person's skeleton is moved.
//
// What's moved between them is a frame (Frame): each part's turn beyond the
// part above it, in the body's own frame (its left, up and forward), and where the
// hips have gone, a share of their height: sunk (over the lower foot), and shifted
// (from between the feet -- weight on one leg, a lunge; never a walk's travel).
// Read from any skeleton posed
// (readFrame) -- a mocap recording's, an animation's, the reference figure's --
// and given to any other at rest (applyFrame), so a rig that faces another way,
// or is sized another way, takes the same pose. The torso, legs, hands and
// fingers turn as the source's do, keeping the rig's own posture; the arms and
// legs are placed where the source's are -- the hand or foot where its is, the
// elbow or knee bending its way -- by the rig's own hinges (lib/modelIk
// reachTwo), since rigs rest them differently (a T, an A, at the sides; a leg
// rolled in or out), and a turn copied would carry that roll into a knee.

import { Bone, Euler, MathUtils, Matrix4, Quaternion, Vector3, type Object3D } from 'three'
import { reachTwo } from './modelIk.ts'

type V3 = [number, number, number]
const LIMBS = ['Shoulder', 'Arm', 'ForeArm', 'Hand'] as const
const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'] as const
const LEGS = ['UpLeg', 'Leg', 'Foot'] as const
const sided = <T extends string>(side: 'Left' | 'Right', parts: readonly T[]) => parts.map(part => `${side}${part}` as const)
const fingersOf = (side: 'Left' | 'Right') => FINGERS.flatMap(finger => [1, 2, 3].map(n => `${side}${finger}${n}` as const))
// Each after the one it hangs from.
export const BODY = ['Hips', 'Spine', 'Spine2', 'Chest', 'Neck', 'Head',
  ...(['Left', 'Right'] as const).flatMap(side => [...sided(side, LIMBS), ...fingersOf(side), ...sided(side, LEGS)])] as const
export type BodyPart = typeof BODY[number]
export type Humanoid = Partial<Record<BodyPart, Bone>>

export const PARENT = Object.fromEntries(BODY.map(part => {
  const side = part.startsWith('Left') ? 'Left' : part.startsWith('Right') ? 'Right' : ''
  const own = part.slice(side.length)
  const finger = /^(Thumb|Index|Middle|Ring|Little)(\d)$/.exec(own)
  if (finger) return [part, finger[2] === '1' ? `${side}Hand` : `${side}${finger[1]}${Number(finger[2]) - 1}`]
  const above: Record<string, string | null> = { Hips: null, Spine: 'Hips', Spine2: 'Spine', Chest: 'Spine2', Neck: 'Chest', Head: 'Neck', Shoulder: 'Chest', Arm: `${side}Shoulder`, ForeArm: `${side}Arm`, Hand: `${side}ForeArm`, UpLeg: 'Hips', Leg: `${side}UpLeg`, Foot: `${side}Leg` }
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
const FINGER_WORDS: [RegExp, typeof FINGERS[number]][] = [[/\bthumb/, 'Thumb'], [/\bindex/, 'Index'], [/\bmiddle/, 'Middle'], [/\bring/, 'Ring'], [/\b(pinky|little)/, 'Little']]
const NOT_FINGER = /\b(end|nub|tip|leaf|meta|metacarpal|palm|helper|ik|ctrl|control|mch)/

const wordsOf = (name: string) => {
  // Its words: camelCase and separators apart, a rig's own prefix (mixamorig:) left off.
  const words = name.replace(/^.*[:|]/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const side = words.some(w => w === 'left' || w === 'l') ? 'Left' : words.some(w => w === 'right' || w === 'r') ? 'Right' : ''
  return { side, rest: words.filter(w => !['left', 'l', 'right', 'r'].includes(w)).join(' ') }
}

/** What a bone's name says it is: a part of a body, 'spine' (one of several), or nothing. */
export function partOf(name: string): BodyPart | 'spine' | null {
  const { side, rest } = wordsOf(name)
  if (NOT_BODY.test(rest)) return null
  const found = PART_WORDS.find(([words]) => words.test(rest))?.[1]
  if (!found) return null
  const isSided = !['Hips', 'Neck', 'Head', 'spine'].includes(found)
  if (isSided !== !!side) return null
  return (isSided ? `${side}${found}` : found) as BodyPart | 'spine'
}

/** Which finger a bone's name says it is part of, or none. */
export function fingerOf(name: string): typeof FINGERS[number] | null {
  const { rest } = wordsOf(name)
  if (NOT_FINGER.test(rest)) return null
  return FINGER_WORDS.find(([words]) => words.test(rest))?.[1] ?? null
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
    return [
      [`${s}Shoulder`, `${side}Shoulder`], [`${s}UpperArm`, `${side}Arm`], [`${s}LowerArm`, `${side}ForeArm`], [`${s}Hand`, `${side}Hand`],
      [`${s}UpperLeg`, `${side}UpLeg`], [`${s}LowerLeg`, `${side}Leg`], [`${s}Foot`, `${side}Foot`],
      [`${s}ThumbMetacarpal`, `${side}Thumb1`], [`${s}ThumbProximal`, `${side}Thumb2`], [`${s}ThumbDistal`, `${side}Thumb3`],
      ...(['Index', 'Middle', 'Ring', 'Little'] as const).flatMap(f => [[`${s}${f}Proximal`, `${side}${f}1`], [`${s}${f}Intermediate`, `${side}${f}2`], [`${s}${f}Distal`, `${side}${f}3`]]),
    ]
  })),
}

/** A person's skeleton found among these bones (as they're met, parents first), or none.
 *  A VRM says which is which; any other rig is read by its bones' names -- its
 *  fingers, the bones under each hand named as one, joint by joint outward. */
export function humanoidOf(bones: Bone[]): Humanoid | null {
  const rig: Humanoid = {}
  const spine: Bone[] = []
  const said = bones.some(bone => bone.userData?.humanBone)
  for (const bone of bones) {
    // (A VRM's upper chest is met after its chest, and taken over it.)
    if (said) {
      const part = VRM_PARTS[bone.userData?.humanBone]
      // An upper chest over a chest: the chest the middle of the back.
      if (part === 'Chest' && rig.Chest) rig.Spine2 = rig.Chest
      if (part) rig[part] = bone
      continue
    }
    const part = partOf(bone.name)
    if (part === 'spine') spine.push(bone)
    else if (part && !rig[part]) rig[part] = bone
  }
  // The lowest of the spine's bones, the highest, and one between: Spine, Chest, Spine2.
  const back = spine.filter(bone => !rig.Hips || isAbove(rig.Hips, bone))
  if (back.length) rig.Spine = back[0]
  if (back.length > 1) rig.Chest = back[back.length - 1]
  if (back.length > 2) rig.Spine2 = back[Math.floor(back.length / 2)]
  if (!said) {
    for (const side of ['Left', 'Right'] as const) {
      const hand = rig[`${side}Hand`]
      if (!hand) continue
      for (const finger of FINGERS) {
        // Its joints in a row from the hand out: each the last one's child.
        const chain: Bone[] = []
        for (const bone of bones) {
          if (chain.length === 3 || !isAbove(chain[chain.length - 1] ?? hand, bone) || fingerOf(bone.name) !== finger) continue
          chain.push(bone)
        }
        chain.forEach((bone, i) => { rig[`${side}${finger}${i + 1}` as BodyPart] = bone })
      }
    }
  }
  const needed: BodyPart[] = ['Hips', 'Head', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg']
  if (needed.some(part => !rig[part])) return null
  // Each where it should hang -- or the names said something else.
  for (const part of BODY) {
    const bone = rig[part]
    let above = PARENT[part]
    while (above && !rig[above]) above = PARENT[above]
    if (bone && above && !isAbove(rig[above]!, bone)) delete rig[part]
  }
  return needed.every(part => rig[part]) ? rig : null
}

// ---- A body at rest, and a frame of it moving ------------------------------------

// Pointed where the source's point, not turned as they turn.
// Placed where the source's are, not turned as they turn: each limb's root, middle
// and end, and which way its middle bends of itself (a knee forward, an elbow back).
const LIMB_CHAINS = (['Left', 'Right'] as const).flatMap(side => [
  { root: `${side}Arm`, middle: `${side}ForeArm`, end: `${side}Hand`, bends: -1 },
  { root: `${side}UpLeg`, middle: `${side}Leg`, end: `${side}Foot`, bends: 1 },
] as { root: BodyPart; middle: BodyPart; end: BodyPart; bends: number }[])
const FORWARD = new Vector3(0, 0, 1)
const UP = new Vector3(0, 1, 0)
const worldTurn = (part: Object3D) => part.getWorldQuaternion(new Quaternion())
const worldAt = (part: Object3D) => part.getWorldPosition(new Vector3())

/** Which way the body faces, as a turn from the reference axes: its left (x), up (y) and forward (z). */
function frameOf(at: (part: BodyPart) => Vector3): Quaternion {
  const left = at('LeftUpLeg').sub(at('RightUpLeg')).normalize()
  const up = at('Head').sub(at('Hips'))
  up.addScaledVector(left, -up.dot(left)).normalize()
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(left, up, new Vector3().crossVectors(left, up)))
}

/** A rig as it stands at rest: each part's turn (and what it hangs from's), its frame,
 *  how high its hips stand over its lower foot and where from between its feet, and
 *  each limb's two bones (root to middle, middle to end), in its frame, in its heights. */
export interface RigRest {
  parts: BodyPart[]
  turn: Map<BodyPart, Quaternion>
  above: Map<BodyPart, Quaternion>
  frame: Quaternion
  hips: Vector3
  height: number
  fromFeet: Vector3
  aims: Partial<Record<BodyPart, Vector3>>
}

const feetOf = (rig: Humanoid) => (['LeftFoot', 'RightFoot', 'LeftLeg', 'RightLeg'] as const).filter(part => rig[part]).slice(0, 2).map(part => worldAt(rig[part]!))
// How high the hips are over the lower of the feet, along `up`.
const hipsHeight = (rig: Humanoid, up: Vector3) => worldAt(rig.Hips!).dot(up) - Math.min(...feetOf(rig).map(foot => foot.dot(up)))
// Where the hips are from between the feet.
const hipsFromFeet = (rig: Humanoid) => {
  const feet = feetOf(rig)
  return worldAt(rig.Hips!).sub(feet.reduce((sum, foot) => sum.add(foot), new Vector3()).divideScalar(feet.length))
}

export function restOf(rig: Humanoid): RigRest {
  const parts = BODY.filter(part => rig[part])
  const frame = frameOf(part => worldAt(rig[part]!))
  const back = frame.clone().invert()
  const height = hipsHeight(rig, UP.clone().applyQuaternion(frame)) || 1
  const aims: RigRest['aims'] = {}
  for (const { root, middle, end } of LIMB_CHAINS) {
    if (!rig[root] || !rig[middle] || !rig[end]) continue
    aims[root] = worldAt(rig[middle]!).sub(worldAt(rig[root]!)).applyQuaternion(back).divideScalar(height)
    aims[middle] = worldAt(rig[end]!).sub(worldAt(rig[middle]!)).applyQuaternion(back).divideScalar(height)
  }
  return {
    parts,
    turn: new Map(parts.map(part => [part, worldTurn(rig[part]!)])),
    above: new Map(parts.map(part => [part, rig[part]!.parent ? worldTurn(rig[part]!.parent!) : new Quaternion()])),
    frame,
    hips: worldAt(rig.Hips!),
    height,
    fromFeet: hipsFromFeet(rig),
    aims,
  }
}

/** A body's pose: each part's turn beyond the part above it, in the body's frame;
 *  and where its hips have gone, in its frame, a share of their height at rest --
 *  up (y) over the lower foot, across (x, z) from between the feet. With it, how
 *  the arms of the body it was read from point at rest (Aims), to point them so. */
export interface Frame { own: Partial<Record<BodyPart, Quaternion>>; hips: Vector3 }
export type Aims = Partial<Record<BodyPart, Vector3>>

/** The rig's pose now, read against its rest. A part it hasn't turns with the one above. */
export function readFrame(rig: Humanoid, rest: RigRest): Frame {
  const back = rest.frame.clone().invert()
  const turned = new Map<BodyPart, Quaternion>()
  const own: Frame['own'] = {}
  for (const part of BODY) {
    const bone = rig[part], above = PARENT[part]
    // Its turn from rest, in the world, seen in the body's frame.
    const turn = bone
      ? back.clone().multiply(worldTurn(bone).multiply(rest.turn.get(part)!.clone().invert())).multiply(rest.frame)
      : (above ? turned.get(above)!.clone() : new Quaternion())
    turned.set(part, turn)
    own[part] = above ? turned.get(above)!.clone().invert().multiply(turn) : turn
  }
  const up = UP.clone().applyQuaternion(rest.frame)
  const shift = hipsFromFeet(rig).sub(rest.fromFeet).applyQuaternion(back).divideScalar(rest.height)
  return { own, hips: new Vector3(shift.x, (hipsHeight(rig, up) - rest.height) / rest.height, shift.z) }
}

/** The rig -- at rest -- posed as `frame` says, its arms pointed as `aims` (its source's). */
export function applyFrame(rig: Humanoid, rest: RigRest, frame: Frame, aims: Aims) {
  const F = rest.frame, back = F.clone().invert()
  const inWorld = (turn: Quaternion) => F.clone().multiply(turn).multiply(back)
  // Each part's turn from rest, in the body's frame: what's above it, then its own.
  const turned = new Map<BodyPart, Quaternion>()
  for (const part of BODY) {
    const above = PARENT[part], own = frame.own[part] ?? new Quaternion()
    turned.set(part, above ? turned.get(above)!.clone().multiply(own) : own.clone())
  }
  // Sunk and shifted as far, for its own height.
  const hips = rig.Hips!
  const to = rest.hips.clone().add(frame.hips.clone().multiplyScalar(rest.height).applyQuaternion(F))
  hips.position.copy(hips.parent ? hips.parent.worldToLocal(to) : to)
  hips.updateMatrixWorld(true)

  const placed = new Set<BodyPart>(), ends = new Set<BodyPart>()
  for (const part of rest.parts) {
    const bone = rig[part]!
    if (placed.has(part)) continue
    const limb = LIMB_CHAINS.find(one => one.root === part)
    if (limb && rig[limb.middle] && rig[limb.end] && aims[limb.root] && aims[limb.middle] && rest.aims[limb.root] && rest.aims[limb.middle]) {
      // The source's limb as it's posed: its two bones, in its frame, in its heights.
      const upper = aims[limb.root]!.clone().applyQuaternion(turned.get(limb.root)!)
      const lower = aims[limb.middle]!.clone().applyQuaternion(turned.get(limb.middle)!)
      const reach = upper.clone().add(lower)
      // Its end as far out, for how far this limb reaches at rest; its middle bending its way.
      const scale = rest.aims[limb.root]!.clone().add(rest.aims[limb.middle]!).length() / Math.max(1e-9, aims[limb.root]!.clone().add(aims[limb.middle]!).length())
      const start = worldAt(bone)
      const goal = start.clone().add(reach.clone().multiplyScalar(scale * rest.height).applyQuaternion(F))
      const out = upper.clone().addScaledVector(reach, -upper.dot(reach) / Math.max(1e-9, reach.lengthSq()))
      const own = FORWARD.clone().multiplyScalar(limb.bends).applyQuaternion(F)
      const bend = out.lengthSq() > 1e-8 ? out.normalize().applyQuaternion(F) : own
      reachTwo(rig[limb.end]!, goal, start.clone().add(bend.multiplyScalar(rest.height)), own)
      placed.add(limb.middle)
      ends.add(limb.end)
      continue
    }
    // A hand or foot of a limb placed so: turned in the world as the source's is
    // (a fist facing its way, a foot flat), whatever its forearm's roll.
    if (ends.has(part)) {
      const want = inWorld(turned.get(part)!).multiply(rest.turn.get(part)!)
      bone.quaternion.copy((bone.parent ? worldTurn(bone.parent) : new Quaternion()).invert().multiply(want))
      bone.updateMatrixWorld(true)
      continue
    }
    // Turned as the source's is beyond what it hangs from here -- in the body's
    // frame -- after what it hangs from has turned.
    let above = PARENT[part]
    while (above && !rig[above]) above = PARENT[above]
    const own = above ? turned.get(above)!.clone().invert().multiply(turned.get(part)!) : turned.get(part)!.clone()
    const parentTurned = bone.parent ? worldTurn(bone.parent).multiply(rest.above.get(part)!.clone().invert()) : new Quaternion()
    const want = parentTurned.multiply(inWorld(own)).multiply(rest.turn.get(part)!)
    bone.quaternion.copy((bone.parent ? worldTurn(bone.parent) : new Quaternion()).invert().multiply(want))
    bone.updateMatrixWorld(true)
  }
}

// ---- The reference figure, and its basic poses -----------------------------------

// Where its joints are standing, arms down, facing +z, its left at +x (metres).
const REFERENCE: Partial<Record<BodyPart, V3>> = (() => {
  const joints: Partial<Record<BodyPart, V3>> = { Hips: [0, 0.95, 0], Spine: [0, 1.05, 0], Chest: [0, 1.22, 0], Neck: [0, 1.43, 0], Head: [0, 1.53, 0] }
  for (const [side, x] of [['Left', 1], ['Right', -1]] as const) {
    Object.assign(joints, {
      [`${side}Shoulder`]: [x * 0.05, 1.4, 0], [`${side}Arm`]: [x * 0.195, 1.4, 0], [`${side}ForeArm`]: [x * 0.195, 1.12, 0], [`${side}Hand`]: [x * 0.195, 0.87, 0],
      [`${side}UpLeg`]: [x * 0.095, 0.92, 0], [`${side}Leg`]: [x * 0.095, 0.5, 0], [`${side}Foot`]: [x * 0.095, 0.08, 0],
    })
  }
  return joints
})()

// Turns from standing, in degrees about x, y, z of the reference.
const BASIC = {
  stand: {},
  tpose: { LeftArm: [0, 0, 90], RightArm: [0, 0, -90] },
  apose: { LeftArm: [0, 0, 45], RightArm: [0, 0, -45] },
} satisfies Record<string, Partial<Record<BodyPart, V3>>>
export type BasicPose = keyof typeof BASIC
export const BASIC_POSES = Object.keys(BASIC) as BasicPose[]

/** One of the basic poses, as a frame, with the reference's arms to point by. */
export function basicPose(name: BasicPose): { frame: Frame; aims: Aims } {
  const ref: Humanoid = {}
  for (const part of BODY) {
    const joint = REFERENCE[part]
    if (!joint) continue
    const bone = new Bone()
    // (It has no middle of the back: its chest hangs from its spine.)
    let above = PARENT[part]
    while (above && !REFERENCE[above]) above = PARENT[above]
    const from = above ? REFERENCE[above]! : [0, 0, 0]
    bone.position.set(joint[0] - from[0], joint[1] - from[1], joint[2] - from[2])
    if (above) ref[above]!.add(bone)
    ref[part] = bone
  }
  ref.Hips!.updateMatrixWorld(true)
  const rest = restOf(ref)
  for (const [part, turn] of Object.entries(BASIC[name]) as [BodyPart, V3][]) ref[part]!.quaternion.setFromEuler(new Euler(...turn.map(MathUtils.degToRad) as V3, 'XYZ'))
  ref.Hips!.updateMatrixWorld(true)
  return { frame: readFrame(ref, rest), aims: rest.aims }
}

/** The rig -- at rest -- in one of the basic poses. */
export function poseHumanoid(rig: Humanoid, name: BasicPose) {
  const { frame, aims } = basicPose(name)
  applyFrame(rig, restOf(rig), frame, aims)
}

// ---- Which way it faces, and bends ---------------------------------------------------

/** Which way the body faces now, in the world. */
export const facingOf = (rig: Humanoid) => FORWARD.clone().applyQuaternion(frameOf(part => worldAt(rig[part]!)))

/** Which way a knee (forward) or an elbow (back) bends, for the body as it is now; none, another joint. */
export function bendFor(rig: Humanoid, middle: Object3D): Vector3 | null {
  const knee = middle === rig.LeftLeg || middle === rig.RightLeg
  if (!knee && middle !== rig.LeftForeArm && middle !== rig.RightForeArm) return null
  return knee ? facingOf(rig) : facingOf(rig).negate()
}
