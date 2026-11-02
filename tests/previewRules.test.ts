// An atrium's picture: when it's made, and when one that came out badly may stand.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { previewDue, previewIsWhole } from '../src/lib/previewRules.ts'

const EVERY = 180_000

test('the first is due', () => {
  assert.equal(previewDue(null, 'a', 1_000, EVERY), true)
})

test('never within the wait, changed or not', () => {
  assert.equal(previewDue({ print: 'a', at: 1_000, whole: true }, 'b', 1_000 + EVERY - 1, EVERY), false)
  assert.equal(previewDue({ print: 'a', at: 1_000, whole: false }, 'a', 1_000 + EVERY - 1, EVERY), false)
})

test('a whole one stands until something changes', () => {
  assert.equal(previewDue({ print: 'a', at: 0, whole: true }, 'a', EVERY, EVERY), false)
  assert.equal(previewDue({ print: 'a', at: 0, whole: true }, 'b', EVERY, EVERY), true)
})

test('one that came out badly is tried again, with nothing changed', () => {
  assert.equal(previewDue({ print: 'a', at: 0, whole: false }, 'a', EVERY, EVERY), true)
})

test('so is one from before anyone asked, so a bad one can be replaced', () => {
  assert.equal(previewDue({ print: 'a', at: 0 }, 'a', EVERY, EVERY), true)
})

const made = (over = {}) => ({ hadRoom: true, roomPictureLost: false, images: { tried: 10, missed: 0 }, ...over })

test('with everything there, it is whole', () => {
  assert.equal(previewIsWhole(made()), true)
})

test('an atrium with no images is no less whole', () => {
  assert.equal(previewIsWhole(made({ images: { tried: 0, missed: 0 } })), true)
})

test('without the room in view, or its picture, it is not', () => {
  assert.equal(previewIsWhole(made({ hadRoom: false })), false)
  assert.equal(previewIsWhole(made({ roomPictureLost: true })), false)
})

test('a few images out of reach are normal; most of them are not', () => {
  assert.equal(previewIsWhole(made({ images: { tried: 10, missed: 2 } })), true)
  assert.equal(previewIsWhole(made({ images: { tried: 10, missed: 5 } })), true)
  assert.equal(previewIsWhole(made({ images: { tried: 10, missed: 6 } })), false)
  assert.equal(previewIsWhole(made({ images: { tried: 3, missed: 3 } })), false)
})
