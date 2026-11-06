// Pins from Pinterest: shown as delivered, their mark always there (docs/PINTEREST.md).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { asDelivered, isPin, pinMarkSize } from '../src/lib/pins.ts'
import { takesLook } from '../src/lib/traceLook.ts'

const pin = { id: 'p', type: 'embed', linkUrl: 'https://www.pinterest.com/pin/123456/' } as any
const embed = { id: 'e', type: 'embed', linkUrl: 'https://example.com/a' } as any

test('a pin is a trace linked to a pin on Pinterest', () => {
  assert.equal(isPin(pin), true)
  assert.equal(isPin(embed), false)
  assert.equal(isPin({ linkUrl: 'https://www.pinterest.com/someone/board/' }), false)
})

test("nothing changes a pin's picture: crop, flip, look and corners as with none", () => {
  const changed = asDelivered({ ...pin, cropX: 0.2, cropWidth: 0.5, flipHorizontal: true, look: { exposure: 1 }, borderRadius: 12, scaleX: 2 })
  assert.deepEqual([changed.cropX, changed.cropY, changed.cropWidth, changed.cropHeight], [0, 0, 1, 1])
  assert.equal(changed.flipHorizontal, false)
  assert.equal(changed.look, undefined)
  assert.equal(changed.borderRadius, 0)
  // Resized, it may be.
  assert.equal(changed.scaleX, 2)
})

test('the same trace where nothing needs changing, pin or not', () => {
  const plain = { ...pin, scaleX: 2 }
  assert.equal(asDelivered(plain), plain)
  const cropped = { ...embed, cropX: 0.2, flipHorizontal: true }
  assert.equal(asDelivered(cropped), cropped)
})

test('no look on a pin', () => {
  assert.equal(takesLook(pin), false)
  assert.equal(takesLook(embed), true)
})

test('its mark: full size on a big pin, smaller on a small one, never gone', () => {
  assert.deepEqual(pinMarkSize(400, 300), { width: 24, height: 24, left: 8, bottom: 8 })
  assert.equal(pinMarkSize(40, 40).width, 14)
  assert.equal(pinMarkSize(4, 4).width, 12)
})

// ---- Kept as its id alone.
import { asPinSource, keptRow, pinIdOf } from '../src/lib/pins.ts'
import { buildTraceInsertRow, traceColumns } from '../src/lib/traceInsert.ts'

const shownPin = { ...pin, userId: 'u', username: 'me', x: 0, y: 0, rotation: 0, createdAt: '', content: '', mediaUrl: 'https://i.pinimg.com/600x/a.jpg', imageUrl: 'https://i.pinimg.com/x.jpg', pinTitle: 'A title', pinSource: { board: '77', by: 'u' } } as any

test("a pin's id is its link's", () => {
  assert.equal(pinIdOf(pin), '123456')
  assert.equal(pinIdOf(embed), null)
})

test('saved, a pin never writes its picture or its title -- only where it came from', () => {
  const inserted = buildTraceInsertRow(shownPin, 'u', 'me', 'L', 0, 0)
  assert.equal(inserted.media_url, undefined)
  assert.equal(inserted.image_url, undefined)
  assert.deepEqual(inserted.pin_source, { board: '77', by: 'u' })
  assert.equal(JSON.stringify(inserted).includes('A title'), false)
  const updated = traceColumns(shownPin)
  assert.equal(updated.media_url, null)
  assert.equal(updated.image_url, null)
  assert.deepEqual(updated.pin_source, { board: '77', by: 'u' })
  // Any other embed keeps its picture.
  assert.equal(buildTraceInsertRow({ ...shownPin, linkUrl: 'https://example.com/' }, 'u', 'me', 'L', 0, 0).media_url, 'https://i.pinimg.com/600x/a.jpg')
})

test('a row copied whole lets go of a pin picture kept the old way', () => {
  const old = { link_url: 'https://www.pinterest.com/pin/9/', media_url: 'https://i.pinimg.com/a.jpg', image_url: null, content: 'x' }
  assert.deepEqual(keptRow(old), { ...old, media_url: null, image_url: null })
  const other = { link_url: 'https://example.com/', media_url: 'https://example.com/a.jpg' }
  assert.equal(keptRow(other), other)
})

test('a stored source read, as JSON or as it is; none where it is not one', () => {
  assert.deepEqual(asPinSource({ board: '1', by: 'u' }), { board: '1', by: 'u' })
  assert.deepEqual(asPinSource('{"board":null,"by":"link:ab"}'), { board: null, by: 'link:ab' })
  assert.equal(asPinSource({ board: '1' }), undefined)
  assert.equal(asPinSource('nonsense'), undefined)
})

test("one's own picture given a pin's link is no pin: its file is never let go of", () => {
  const own = { id: 'i', type: 'image', linkUrl: 'https://www.pinterest.com/pin/5/', mediaUrl: 'local://traces/L/a.png' } as any
  assert.equal(isPin(own), false)
  assert.equal(buildTraceInsertRow(own, 'u', 'me', 'L', 0, 0).media_url, 'local://traces/L/a.png')
  const row = { type: 'image', link_url: 'https://www.pinterest.com/pin/5/', media_url: 'local://traces/L/a.png' }
  assert.equal(keptRow(row), row)
})
