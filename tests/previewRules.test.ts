// An atrium's picture: when it's made, and when one that came out badly may stand.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { isChosenPicture, previewDue, previewIsWhole } from '../src/lib/previewRules.ts'

test('the first is due', () => {
  assert.equal(previewDue(null, 'a'), true)
})

test('no wait: changed a moment after the last, it is due (made on a save or a leave alone)', () => {
  assert.equal(previewDue({ print: 'a', at: Date.now(), whole: true }, 'b'), true)
})

test('a whole one stands until something changes', () => {
  assert.equal(previewDue({ print: 'a', at: 0, whole: true }, 'a'), false)
  assert.equal(previewDue({ print: 'a', at: 0, whole: true }, 'b'), true)
})

test('one that came out badly is tried again, with nothing changed', () => {
  assert.equal(previewDue({ print: 'a', at: 0, whole: false }, 'a'), true)
})

test('so is one from before anyone asked, so a bad one can be replaced', () => {
  assert.equal(previewDue({ print: 'a', at: 0 }, 'a'), true)
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

test('one its owner chose is never made over', () => {
  assert.equal(previewDue({ print: '', at: 0, whole: true, chosen: true }, 'changed'), false)
  assert.equal(isChosenPicture('https://x/storage/v1/object/public/traces/L/chosen-1793742411349.webp'), true)
  assert.equal(isChosenPicture('https://x/storage/v1/object/public/traces/L/preview-1793742411349.webp'), false)
  assert.equal(isChosenPicture('local://traces/L/preview.webp'), false)
})

test('one made smaller than pictures are made now is made again, unchanged or not', () => {
  assert.equal(previewDue({ print: 'p', at: 0, whole: true }, 'p', 1600), true)
  assert.equal(previewDue({ print: 'p', at: 0, whole: true, side: 960 }, 'p', 1600), true)
  assert.equal(previewDue({ print: 'p', at: 0, whole: true, side: 1600 }, 'p', 1600), false)
})
