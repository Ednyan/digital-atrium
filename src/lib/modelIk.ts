// Posing by reach (inverse kinematics): a joint dragged to where it's wanted,
// and the bones above it -- its chain -- turned for it to get there: each in
// turn, nearest first, toward the goal, a little at a time, round and round
// (cyclic coordinate descent). Small, and steady: no turn of more than a
// fraction of a circle at once, so a limb never flips across.

import { Quaternion, Vector3, type Bone, type Object3D } from 'three'

/** The bones that turn for `end` to reach: its parents, nearest first, up to `length`. */
export function chainOf(end: Object3D, length: number): Object3D[] {
  const chain: Object3D[] = []
  for (let at = end.parent; at && chain.length < length && (at as Bone).isBone; at = at.parent) chain.push(at)
  return chain
}

const still = new Quaternion()
const limited = new Quaternion()

/** `chain` turned for `end` to come as near `goal` (in the world) as it can. */
export function reach(chain: Object3D[], end: Object3D, goal: Vector3, rounds = 16, mostTurn = 0.35): number {
  const endAt = new Vector3(), jointAt = new Vector3(), toEnd = new Vector3(), toGoal = new Vector3()
  const turn = new Quaternion(), world = new Quaternion(), parentWorld = new Quaternion()
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
      // Its turn in the world, made its own: parent^-1 * turn * itself.
      joint.getWorldQuaternion(world)
      if (joint.parent) joint.parent.getWorldQuaternion(parentWorld)
      else parentWorld.identity()
      joint.quaternion.copy(parentWorld.invert().multiply(turn.multiply(world)))
      joint.updateMatrixWorld(true)
    }
    if (end.getWorldPosition(endAt).distanceTo(goal) < 1e-5) break
  }
  return end.getWorldPosition(endAt).distanceTo(goal)
}
