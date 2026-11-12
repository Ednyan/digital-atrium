// Posing by reach: a hand dragged, its arm turned for it to get there.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Bone, Vector3 } from 'three'

import { chainOf, reach } from '../src/lib/modelIk.ts'

// A shoulder, an elbow and a hand: an arm 0.6 long, hanging down.
const arm = () => {
  const root = new Bone(), shoulder = new Bone(), elbow = new Bone(), hand = new Bone()
  root.add(shoulder); shoulder.add(elbow); elbow.add(hand)
  shoulder.position.set(0.2, 1.4, 0)
  elbow.position.set(0, -0.3, 0)
  hand.position.set(0, -0.3, 0)
  root.updateMatrixWorld(true)
  return { root, shoulder, elbow, hand }
}

test('its chain is the bones above it, nearest first, so many', () => {
  const { root, shoulder, elbow, hand } = arm()
  assert.deepEqual(chainOf(hand, 2), [elbow, shoulder])
  assert.deepEqual(chainOf(hand, 9), [elbow, shoulder, root])
  assert.deepEqual(chainOf(root, 2), [])
})

test('a hand reaches a point its arm can reach, its bones kept their lengths', () => {
  const { shoulder, elbow, hand } = arm()
  const goal = new Vector3(0.55, 1.55, 0.2)
  const off = reach(chainOf(hand, 2), hand, goal)
  assert.ok(off < 0.005, `off by ${off}`)
  const at = (b: Bone) => b.getWorldPosition(new Vector3())
  assert.ok(Math.abs(at(elbow).distanceTo(at(shoulder)) - 0.3) < 1e-9)
  assert.ok(Math.abs(at(hand).distanceTo(at(elbow)) - 0.3) < 1e-9)
})

test('out of reach, it points the arm at it, as far as it goes', () => {
  const { shoulder, hand } = arm()
  const goal = new Vector3(2, 1.4, 0)
  const off = reach(chainOf(hand, 2), hand, goal)
  const at = (b: Bone) => b.getWorldPosition(new Vector3())
  assert.ok(Math.abs(off - (goal.distanceTo(at(shoulder)) - 0.6)) < 0.01, `off ${off}`)
})
