// The top bar's order: as chosen, and what fits.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { barOrder, defaultOrder, isSeparator, layOut, newSeparator } from '../src/lib/barOrder.ts'

const items = [{ id: 'a' }, { id: 'b' }, { id: 'c', apart: true }, { id: 'd' }, { id: 'e', apart: true }]

test('as it comes: a separator wherever a tool is set apart', () => {
  assert.deepEqual(defaultOrder(items), ['a', 'b', 'sep-1', 'c', 'd', 'sep-2', 'e'])
})

test('as chosen, a new tool at the end, what is not here left out, nothing twice', () => {
  assert.deepEqual(barOrder(null, items), defaultOrder(items))
  assert.deepEqual(barOrder(['e', 'sep-1', 'a', 'gone', 'a'], items), ['e', 'sep-1', 'a', 'b', 'c', 'd'])
})

test('a new separator takes a free name', () => {
  assert.equal(newSeparator(['a', 'sep-1', 'sep-3']), 'sep-2')
  assert.ok(isSeparator(newSeparator([])))
})

test('with room for all: all of them, set apart where chosen', () => {
  const order = defaultOrder(items)
  assert.deepEqual(layOut(order, 6), {
    shown: [{ id: 'a', apart: false }, { id: 'b', apart: false }, { id: 'c', apart: true }, { id: 'd', apart: false }, { id: 'e', apart: true }],
    hidden: [],
  })
})

test('short of room: More takes the last place, the rest go under it', () => {
  const { shown, hidden } = layOut(defaultOrder(items), 4)
  assert.deepEqual(shown.map(tool => tool.id), ['a', 'b', 'c'])
  assert.deepEqual(hidden, ['d', 'e'])
})

test('a separator with nothing on one side is not drawn', () => {
  assert.equal(layOut(['sep-1', 'a', 'b'], 9).shown[0].apart, false)
  assert.deepEqual(layOut(['a', 'sep-1', 'sep-2', 'b', 'sep-3'], 9).shown, [{ id: 'a', apart: false }, { id: 'b', apart: true }])
})

test('no room at all still leaves More', () => {
  assert.deepEqual(layOut(['a', 'b'], 1), { shown: [], hidden: ['a', 'b'] })
})
