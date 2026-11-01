// Achievements: what earns them, how days add up, and two devices' counts as one.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { earnedAchievements, isEarned, mergeStats, NO_STATS, onDay, ACHIEVEMENTS, progressOf } from '../src/lib/achievements.ts'

const pinNamed = (id: string) => ACHIEVEMENTS.find(one => one.id === id)!

test('every achievement has an id of its own, and there are about twenty', () => {
  assert.equal(new Set(ACHIEVEMENTS.map(one => one.id)).size, ACHIEVEMENTS.length)
  assert.equal(ACHIEVEMENTS.length, 20)
})

test('an achievement is earned at its goal, not before', () => {
  assert.equal(isEarned(pinNamed('hundred'), { ...NO_STATS, placed: 99 }), false)
  assert.equal(isEarned(pinNamed('hundred'), { ...NO_STATS, placed: 100 }), true)
  assert.deepEqual(earnedAchievements({ ...NO_STATS, placed: 100 }).map(one => one.id), ['firstTrace', 'hundred'])
})

test('progress stops at the goal', () => {
  assert.equal(progressOf(pinNamed('thousand'), { ...NO_STATS, placed: 250 }), 0.25)
  assert.equal(progressOf(pinNamed('firstTrace'), { ...NO_STATS, placed: 5000 }), 1)
})

test('a first day starts everything', () => {
  const stats = onDay(NO_STATS, '2026-11-01')
  assert.deepEqual([stats.streak, stats.bestStreak, stats.daysHere, stats.firstDay], [1, 1, 1, '2026-11-01'])
})

test('the same day counts once', () => {
  const stats = onDay(NO_STATS, '2026-11-01')
  assert.equal(onDay(stats, '2026-11-01'), stats)
})

test('the next day adds to the streak, across a month and a year', () => {
  let stats = onDay(NO_STATS, '2026-12-31')
  stats = onDay(stats, '2027-01-01')
  assert.deepEqual([stats.streak, stats.daysHere], [2, 2])
})

test('a gap starts the streak again, and its achievement stays', () => {
  let stats = onDay({ ...NO_STATS, streak: 7, bestStreak: 7, lastDay: '2026-11-01', daysHere: 7 }, '2026-11-05')
  assert.deepEqual([stats.streak, stats.bestStreak, stats.daysHere], [1, 7, 8])
  assert.equal(isEarned(pinNamed('oneWeek'), stats), true)
  stats = onDay(stats, '2026-11-06')
  assert.equal(stats.streak, 2)
})

test('a daylight-saving change does not break a streak', () => {
  assert.equal(onDay({ ...NO_STATS, streak: 3, lastDay: '2026-10-24' }, '2026-10-25').streak, 4)
  assert.equal(onDay({ ...NO_STATS, streak: 3, lastDay: '2026-10-25' }, '2026-10-26').streak, 4)
})

test('two devices: the higher of each count', () => {
  const merged = mergeStats({ ...NO_STATS, placed: 10, deleted: 5 }, { placed: 3, deleted: 9 })
  assert.deepEqual([merged.placed, merged.deleted], [10, 9])
})

test('two devices: the streak of whichever was here last', () => {
  assert.equal(mergeStats({ ...NO_STATS, streak: 2, lastDay: '2026-11-01' }, { streak: 9, lastDay: '2026-11-03' }).streak, 9)
  assert.equal(mergeStats({ ...NO_STATS, streak: 2, lastDay: '2026-11-03' }, { streak: 9, lastDay: '2026-11-01' }).streak, 2)
  assert.equal(mergeStats({ ...NO_STATS, streak: 2, lastDay: '2026-11-03' }, { streak: 9, lastDay: '2026-11-03' }).streak, 9)
})

test('two devices: the first day is the earliest, and an empty one does not count', () => {
  assert.equal(mergeStats({ ...NO_STATS, firstDay: '2026-11-01' }, { firstDay: '2026-03-14' }).firstDay, '2026-03-14')
  assert.equal(mergeStats({ ...NO_STATS, firstDay: '2026-11-01' }, { firstDay: '' }).firstDay, '2026-11-01')
})

test('those chosen here stand; none here, the account\'s', () => {
  assert.deepEqual(mergeStats({ ...NO_STATS, pinned: ['a'] }, { pinned: ['b'] }).pinned, ['a'])
  assert.deepEqual(mergeStats(NO_STATS, { pinned: ['b', 'c', 'd', 'e'] }).pinned, ['b', 'c', 'd'])
})

test('nothing on the account changes nothing; rubbish on it counts for nothing', () => {
  const here = { ...NO_STATS, placed: 4 }
  assert.equal(mergeStats(here, null), here)
  assert.equal(mergeStats(here, { placed: 'lots' as never }).placed, 4)
})
