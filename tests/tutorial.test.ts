// Who's sent into the tutorial by themselves: only someone with no history at all.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { beenHereBefore } from '../src/lib/tutorial.ts'

const nothing = { entry: {}, invitations: [], held: [], visits: {} }

test('an account with nothing kept anywhere is new', () => {
  assert.equal(beenHereBefore(nothing), false)
  assert.equal(beenHereBefore({ ...nothing, entry: { drive_key: null, drive_root: null, hosted_root: null } }), false)
})

test('an invitation from someone else does not make them old', () => {
  assert.equal(beenHereBefore({ ...nothing, invitations: [{ auto: 0 }, { auto: null }, {}] }), false)
})

test('any history at all does', () => {
  assert.equal(beenHereBefore({ ...nothing, entry: { hosted_root: 'r' } }), true)
  assert.equal(beenHereBefore({ ...nothing, entry: { drive_root: 'r' } }), true)
  assert.equal(beenHereBefore({ ...nothing, entry: { drive_key: 'k' } }), true)
  assert.equal(beenHereBefore({ ...nothing, invitations: [{ auto: 1 }] }), true)
  assert.equal(beenHereBefore({ ...nothing, held: [{ lobby_id: 'x' }] }), true)
  assert.equal(beenHereBefore({ ...nothing, visits: { x: 1 } }), true)
})
