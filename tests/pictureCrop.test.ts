// A profile picture's crop: always covered by the picture, and the right pixels taken.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { cropOf, keptInFrame, mostZoom, zoomedAt } from '../src/lib/pictureCrop.ts'

test('a wide picture fills the frame by its height, and takes its middle', () => {
  const crop = cropOf({ zoom: 1, x: 0, y: 0 }, 4000, 2000, 300)
  assert.deepEqual(crop, { x: 1000, y: 0, side: 2000 })
})

test('it can be moved along its long side only as far as its edge', () => {
  assert.deepEqual(keptInFrame({ zoom: 1, x: 9999, y: 50 }, 4000, 2000, 300), { zoom: 1, x: 150, y: 0 })
  assert.deepEqual(cropOf({ zoom: 1, x: 150, y: 0 }, 4000, 2000, 300), { x: 0, y: 0, side: 2000 })
  assert.deepEqual(cropOf({ zoom: 1, x: -150, y: 0 }, 4000, 2000, 300), { x: 2000, y: 0, side: 2000 })
})

test('a crop never leaves the picture, however it is dragged and zoomed', () => {
  for (const [width, height] of [[4000, 2000], [900, 3000], [512, 512], [40, 30]]) {
    for (const zoom of [0.2, 1, 2.5, 99]) for (const x of [-1e5, -40, 0, 70, 1e5]) for (const y of [-1e5, 33, 1e5]) {
      const crop = cropOf(keptInFrame({ zoom, x, y }, width, height, 280), width, height, 280)
      assert.ok(crop.x >= -1e-6 && crop.y >= -1e-6 && crop.x + crop.side <= width + 1e-6 && crop.y + crop.side <= height + 1e-6, `${width}x${height} ${zoom} ${x} ${y}`)
    }
  }
})

test('zooming keeps the point under the pointer where it is', () => {
  const before = keptInFrame({ zoom: 1, x: 0, y: 0 }, 1000, 1000, 200)
  const after = zoomedAt(before, 2, { x: 50, y: -30 }, 1000, 1000, 200)
  assert.deepEqual(after, { zoom: 2, x: -50, y: 30 })
})

test('zoom stops where too few of the picture\'s pixels would be left', () => {
  assert.equal(mostZoom(6000, 4000), 6)
  assert.equal(mostZoom(128, 300), 2)
  assert.equal(mostZoom(40, 30), 1)
  assert.equal(keptInFrame({ zoom: 50, x: 0, y: 0 }, 128, 300, 200).zoom, 2)
})
