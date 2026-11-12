// A 3D model trace's record, as kept in a row, and the still made for a box.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { asModelRecord, DEFAULT_VIEW, formatOf, isModelTrace, sameView, stillSize } from '../src/lib/model3d.ts'

test('formats by extension, any case, never another file', () => {
  assert.equal(formatOf('Chair.GLB'), 'glb')
  assert.equal(formatOf('local://traces/L/u_1_ab.fbx'), 'fbx')
  assert.equal(formatOf('https://x.org/a.obj?v=2#top'), 'obj')
  assert.equal(formatOf('photo.png'), null)
  assert.equal(formatOf('model.blend'), null)
})

test('a record is read only as one, its view kept within bounds', () => {
  assert.equal(asModelRecord(null), undefined)
  assert.equal(asModelRecord({ format: 'blend' }), undefined)
  assert.equal(asModelRecord('not json'), undefined)
  assert.deepEqual(asModelRecord({ format: 'stl' }), { format: 'stl', view: DEFAULT_VIEW })
  const wild = asModelRecord(JSON.stringify({ format: 'glb', view: { yaw: 'left', pitch: 9, distance: -4 } }))!
  assert.equal(wild.view.yaw, DEFAULT_VIEW.yaw)
  assert.ok(wild.view.pitch < Math.PI / 2 && wild.view.pitch > 1.5)
  assert.equal(wild.view.distance, 0.05)
  assert.ok(Math.abs(asModelRecord({ format: 'obj', view: { yaw: Math.PI * 5, pitch: 0, distance: 1 } })!.view.yaw - Math.PI) < 1e-9)
})

test('a model trace is a picture with its model and its file', () => {
  const record = { format: 'glb' as const, view: DEFAULT_VIEW }
  assert.equal(isModelTrace({ type: 'image', model: record, imageUrl: 'local://a.glb' }), true)
  assert.equal(isModelTrace({ type: 'image', model: record }), false)
  assert.equal(isModelTrace({ type: 'image', imageUrl: 'x' }), false)
  assert.equal(isModelTrace({ type: 'video', model: record, imageUrl: 'x' }), false)
})

test('a still is the box\'s shape, its longer side the one given', () => {
  assert.deepEqual(stillSize(2), { width: 1280, height: 640 })
  assert.deepEqual(stillSize(0.5), { width: 640, height: 1280 })
  assert.deepEqual(stillSize(1, 100), { width: 100, height: 100 })
  assert.deepEqual(stillSize(100), { width: 1280, height: 320 })
  assert.deepEqual(stillSize(NaN), { width: 1280, height: 1280 })
  assert.ok(sameView(DEFAULT_VIEW, { ...DEFAULT_VIEW, yaw: DEFAULT_VIEW.yaw + 1e-6 }))
  assert.ok(!sameView(DEFAULT_VIEW, { ...DEFAULT_VIEW, distance: 2 }))
})

test('its pan and look are read only as they can be', () => {
  const read = asModelRecord({ format: 'glb', view: { yaw: 0, pitch: 0, distance: 1, pan: [0.5, -0.2, 0] }, look: { light: 'sun', exposure: 1.4, colour: '#ff8a3d' } })!
  assert.deepEqual(read.view.pan, [0.5, -0.2, 0])
  assert.deepEqual(read.look, { light: 'sun', exposure: 1.4, colour: '#ff8a3d' })
  const wild = asModelRecord({ format: 'glb', view: { pan: [1, 'x', 2] }, look: { light: 'disco', exposure: 99, colour: 'red' } })!
  assert.equal(wild.view.pan, undefined)
  assert.deepEqual(wild.look, { light: 'studio', exposure: 8 })
  assert.equal(asModelRecord({ format: 'glb', view: { pan: [0, 0, 0] } })!.view.pan, undefined, 'no pan is none')
  assert.ok(!sameView({ ...DEFAULT_VIEW, pan: [0.3, 0, 0] }, DEFAULT_VIEW))
})

test('a pose is read only as bones moved: whole quaternions, moves and scales, by place', () => {
  const read = asModelRecord({ format: 'glb', view: DEFAULT_VIEW, pose: { 0: [0, 0, 0, 2], 3: { r: [0, 0.7071, 0, 0.7071], t: [0, 1, 0], s: [2, 2, 2] }, 6: { r: [0, 0, 0, 1], t: [1, 'x', 0], s: [0, 1, 1] }, bad: [0, 0, 0, 1], 4: [0, 0, 0], 5: [0, 0, 0, 0] } })!
  assert.deepEqual(Object.keys(read.pose!), ['0', '3', '6'])
  assert.deepEqual(read.pose!['0'], { r: [0, 0, 0, 1] }, 'a turn alone, as first kept')
  assert.deepEqual(read.pose!['3'].t, [0, 1, 0])
  assert.deepEqual(read.pose!['3'].s, [2, 2, 2])
  assert.deepEqual(read.pose!['6'], { r: [0, 0, 0, 1] }, 'a broken move and a zero scale are left out')
  assert.equal(asModelRecord({ format: 'glb', pose: { x: 1 } })!.pose, undefined)
})
