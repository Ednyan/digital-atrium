// Posing by reach (inverse kinematics): a joint dragged to where it's wanted,
// and the bones above it -- its chain -- turned for it to get there.
//
// Two bones (an arm, a leg): worked out exactly, the middle joint -- elbow, knee --
// bending toward a pole, a point the bend faces. Any other chain: each joint in
// turn, nearest first, toward the goal, a little at a time, round and round
// (cyclic coordinate descent), so a limb never flips across.

import { Matrix4, Quaternion, Vector3, type Bone, type Object3D } from 'three'

/** The bones that turn for `end` to reach: its parents, nearest first, up to `length`. */
export function chainOf(end: Object3D, length: number): Object3D[] {
  const chain: Object3D[] = []
  for (let at = end.parent; at && chain.length < length && (at as Bone).isBone; at = at.parent) chain.push(at)
  return chain
}

const world = new Quaternion()
const parentWorld = new Quaternion()
const turned = new Quaternion()
/** `joint` turned so, in the world: parent^-1 * turn * itself, its own. */
export function turnBy(joint: Object3D, turn: Quaternion) {
  joint.getWorldQuaternion(world)
  if (joint.parent) joint.parent.getWorldQuaternion(parentWorld)
  else parentWorld.identity()
  joint.quaternion.copy(parentWorld.invert().multiply(turned.copy(turn).multiply(world)))
  joint.updateMatrixWorld(true)
}
const between = new Quaternion()
/** `joint` turned the least way that points `from` (a direction in the world) along `to`. */
export function aimBy(joint: Object3D, from: Vector3, to: Vector3) {
  if (from.lengthSq() < 1e-18 || to.lengthSq() < 1e-18) return
  turnBy(joint, between.setFromUnitVectors(from.clone().normalize(), to.clone().normalize()))
}

/** Some direction square to `x` (a unit one). */
export const squareTo = (x: Vector3, into = new Vector3()) =>
  (Math.abs(x.x) < 0.9 ? into.set(1, 0, 0) : into.set(0, 1, 0)).addScaledVector(x, -(Math.abs(x.x) < 0.9 ? x.x : x.y)).normalize()
const basisOf = (primary: Vector3, secondary: Vector3) => {
  const x = primary.clone().normalize()
  const y = secondary.clone().addScaledVector(x, -secondary.dot(x))
  if (y.lengthSq() < 1e-12) squareTo(x, y)
  else y.normalize()
  return new Matrix4().makeBasis(x, y, new Vector3().crossVectors(x, y))
}
/** The turn that takes one frame -- a direction, and a second that sets how it's
 *  rolled -- onto another. The second need only not lie along the first. */
export function frameTurn(fromPrimary: Vector3, fromSecondary: Vector3, toPrimary: Vector3, toSecondary: Vector3): Quaternion {
  const from = basisOf(fromPrimary, fromSecondary)
  return new Quaternion().setFromRotationMatrix(basisOf(toPrimary, toSecondary).multiply(from.transpose()))
}

const still = new Quaternion()
const limited = new Quaternion()

/** `chain` turned for `end` to come as near `goal` (in the world) as it can. */
export function reach(chain: Object3D[], end: Object3D, goal: Vector3, rounds = 16, mostTurn = 0.35): number {
  const endAt = new Vector3(), jointAt = new Vector3(), toEnd = new Vector3(), toGoal = new Vector3()
  const turn = new Quaternion()
  for (let round = 0; round < rounds; round++) {
    for (const joint of chain) {
      end.getWorldPosition(endAt)
      joint.getWorldPosition(jointAt)
      toEnd.subVectors(endAt, jointAt)
      toGoal.subVectors(goal, jointAt)
      if (toEnd.lengthSq() < 1e-12 || toGoal.lengthSq() < 1e-12) continue
      turn.setFromUnitVectors(toEnd.normalize(), toGoal.normalize())
      const angle = 2 * Math.acos(Math.min(1, Math.abs(turn.w)))
      // (Into another first: slerpQuaternions into one of its own two loses it.)
      if (angle > mostTurn) turn.copy(limited.slerpQuaternions(still, turn, mostTurn / angle))
      turnBy(joint, turn)
    }
    if (end.getWorldPosition(endAt).distanceTo(goal) < 1e-5) break
  }
  return end.getWorldPosition(endAt).distanceTo(goal)
}

/** Which way a two-bone chain's middle bends now -- out from the line root to end --
 *  or nothing, while it's straight. */
export function bendOf(end: Object3D): Vector3 | null {
  const mid = end.parent, root = mid?.parent
  if (!mid || !root) return null
  const a = root.getWorldPosition(new Vector3()), b = mid.getWorldPosition(new Vector3()), c = end.getWorldPosition(new Vector3())
  const out = b.clone().sub(a), along = c.sub(a).normalize()
  out.addScaledVector(along, -out.dot(along))
  return out.length() > 1e-3 * a.distanceTo(b) ? out.normalize() : null
}

/** Two bones -- `end`'s parent and its parent -- turned for `end` to reach `goal`
 *  (as near as they're long), the middle bending toward `pole`. The bend keeps
 *  its own hinge: the limb is first turned whole, its bend onto the pole's side,
 *  then opened or closed in that plane. */
export function reachTwo(end: Object3D, goal: Vector3, pole: Vector3) {
  const mid = end.parent, root = mid?.parent
  if (!mid || !root) return
  const a = root.getWorldPosition(new Vector3()), b = mid.getWorldPosition(new Vector3()), c = end.getWorldPosition(new Vector3())
  const upper = a.distanceTo(b), lower = b.distanceTo(c)
  const toGoal = goal.clone().sub(a)
  if (toGoal.lengthSq() < 1e-18 || upper < 1e-9 || lower < 1e-9) return
  const along = toGoal.clone().normalize()
  const span = Math.min(upper + lower - 1e-6 * upper, Math.max(Math.abs(upper - lower) + 1e-6 * upper, toGoal.length()))
  // The bend: toward the pole, square to the line; the pole on that line, the bend it has.
  const bend = pole.clone().sub(a)
  bend.addScaledVector(along, -bend.dot(along))
  if (bend.lengthSq() < 1e-12) {
    bend.copy(b).sub(a)
    bend.addScaledVector(along, -bend.dot(along))
  }
  if (bend.lengthSq() < 1e-12) squareTo(along, bend)
  else bend.normalize()
  // Turned whole: the line root to end along the goal's, its bend toward the pole's.
  const line = c.clone().sub(a)
  turnBy(root, frameTurn(line, bendOf(end) ?? bend, along, bend))
  // Then, in that plane, the middle where the two lengths meet.
  const x = (upper * upper - lower * lower + span * span) / (2 * span)
  const elbow = a.clone().addScaledVector(along, x).addScaledVector(bend, Math.sqrt(Math.max(0, upper * upper - x * x)))
  aimBy(root, mid.getWorldPosition(new Vector3()).sub(a), elbow.clone().sub(a))
  const wrist = a.clone().addScaledVector(along, span)
  const midAt = mid.getWorldPosition(new Vector3())
  aimBy(mid, end.getWorldPosition(new Vector3()).sub(midAt), wrist.sub(midAt))
}
