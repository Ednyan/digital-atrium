import { test } from 'node:test'
import assert from 'node:assert/strict'

import { hexToHsv, hsvToHex } from '../src/lib/colourSpace.ts'

test('primaries, greys and short hex read as hue, saturation and value', () => {
  assert.deepEqual(hexToHsv('#ff0000'), { h: 0, s: 1, v: 1 })
  assert.deepEqual(hexToHsv('#00ff00'), { h: 120, s: 1, v: 1 })
  assert.deepEqual(hexToHsv('#0000ff'), { h: 240, s: 1, v: 1 })
  assert.deepEqual(hexToHsv('#808080'), { h: 0, s: 0, v: 128 / 255 })
  assert.deepEqual(hexToHsv('#fff'), { h: 0, s: 0, v: 1 })
  assert.deepEqual(hexToHsv('not a colour'), { h: 0, s: 0, v: 0 })
})

test('every colour comes back as it went in', () => {
  for (const hex of ['#000000', '#ffffff', '#3b82f6', '#e8c15a', '#a855f7', '#22c55e', '#123456', '#fedcba']) {
    assert.equal(hsvToHex(hexToHsv(hex)), hex)
  }
})
