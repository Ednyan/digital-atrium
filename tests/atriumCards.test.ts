// What the welcome screen shows of one's atriums, and how it says when.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { agoOf, recentCards, type AtriumCard } from '../src/lib/atriumCards.ts'
import { nextAchievement, NO_STATS } from '../src/lib/achievements.ts'

const card = (id: string, name = id): AtriumCard => ({ id, name, preview: null, traces: null })
const cards = { a: card('a'), b: card('b'), c: card('c'), d: card('d', ''), never: card('never') }
const visited: Record<string, number> = { a: 100, b: 300, c: 200, d: 400 }
const at = (id: string) => visited[id] ?? 0

test('last opened first', () => {
  assert.deepEqual(recentCards(cards, at).map(one => one.id), ['b', 'c', 'a'])
})

test('never opened, or nameless, is not shown', () => {
  const ids = recentCards(cards, at).map(one => one.id)
  assert.ok(!ids.includes('never'))
  assert.ok(!ids.includes('d'))
})

test('a tutorial still running is not shown', () => {
  assert.deepEqual(recentCards(cards, at, 'b').map(one => one.id), ['c', 'a'])
})

test('how long ago, in the unit that reads best', () => {
  const now = 1_000_000_000_000
  const minutes = (n: number) => now - n * 60_000
  assert.deepEqual(agoOf(minutes(5), now), [-5, 'minute'])
  assert.deepEqual(agoOf(minutes(120), now), [-2, 'hour'])
  assert.deepEqual(agoOf(minutes(60 * 24), now), [-1, 'day'])
  assert.deepEqual(agoOf(minutes(60 * 24 * 10), now), [-1, 'week'])
  assert.deepEqual(agoOf(minutes(60 * 24 * 90), now), [-3, 'month'])
})

test('a clock set wrong never says the future', () => {
  assert.deepEqual(agoOf(2000, 1000), [-0, 'minute'])
})

test('the next achievement is the nearest, not just the next in the list', () => {
  assert.equal(nextAchievement({ ...NO_STATS, tutorial: 1, placed: 412, deleted: 1 })?.id, 'thousand')
  assert.equal(nextAchievement({ ...NO_STATS, tutorial: 1, placed: 412, deleted: 95 })?.id, 'tidyingUp')
})

test('with nothing begun, the first; with everything earned, none', () => {
  assert.equal(nextAchievement(NO_STATS)?.id, 'firstSteps')
  const all = { ...NO_STATS, tutorial: 1, placed: 1e6, deleted: 1e4, streak: 365, bestStreak: 365, threads: 100, colours: 100, drawings: 100, templates: 10, templatesMade: 1 }
  assert.equal(nextAchievement(all), null)
})
