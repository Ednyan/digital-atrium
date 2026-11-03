// Achievements: small awards for using the Atrium (lib/stats counts, ProfileAchievements shows).
// What's counted is one small object, on the device and on the account: never a
// row per event. Nothing depends on them, and they're counted by the app itself,
// so they're for pleasure, not proof: no leaderboards on these numbers.

export type Counter = 'tutorial' | 'placed' | 'deleted' | 'streak' | 'threads' | 'colours' | 'drawings' | 'templates'

export interface Stats {
  tutorial: number
  placed: number
  deleted: number
  threads: number
  colours: number
  drawings: number
  templates: number
  // Days in a row, the most ever, days in all, and the last (YYYY-MM-DD, local).
  streak: number
  bestStreak: number
  daysHere: number
  lastDay: string
  firstDay: string
  // The achievements chosen to show beside one's name, and when they were chosen:
  // the latest choice is the one, on whichever device it was made.
  pinned: string[]
  pinnedAt: number
}

export const NO_STATS: Stats = { tutorial: 0, placed: 0, deleted: 0, threads: 0, colours: 0, drawings: 0, templates: 0, streak: 0, bestStreak: 0, daysHere: 0, lastDay: '', firstDay: '', pinned: [], pinnedAt: 0 }
export const MOST_PINNED = 3

export interface Achievement {
  id: string
  counter: Counter
  goal: number
  // How it's said (lib/i18n: achievements.what.<what>), with {n} the goal.
  what: string
  family: 'start' | 'placed' | 'deleted' | 'days' | 'other'
}
// Each family's colour: its mark, wherever it's shown.
export const FAMILY_COLOUR: Record<Achievement['family'], string> = {
  start: '#FF8A3D',
  placed: '#E8C15A',
  deleted: '#C77DFF',
  days: '#9AD4C4',
  other: '#A8B6D9',
}
const award = (id: string, counter: Counter, goal: number, what: string, family: Achievement['family']): Achievement => ({ id, counter, goal, what, family })

export const ACHIEVEMENTS: Achievement[] = [
  award('firstSteps', 'tutorial', 1, 'tutorial', 'start'),
  award('firstTrace', 'placed', 1, 'placedFirst', 'placed'),
  award('hundred', 'placed', 100, 'placed', 'placed'),
  award('thousand', 'placed', 1_000, 'placed', 'placed'),
  award('tenThousand', 'placed', 10_000, 'placed', 'placed'),
  award('hundredThousand', 'placed', 100_000, 'placed', 'placed'),
  award('million', 'placed', 1_000_000, 'placed', 'placed'),
  award('secondThoughts', 'deleted', 1, 'deletedFirst', 'deleted'),
  award('tidyingUp', 'deleted', 100, 'deleted', 'deleted'),
  award('springCleaning', 'deleted', 1_000, 'deleted', 'deleted'),
  award('scorchedEarth', 'deleted', 10_000, 'deleted', 'deleted'),
  award('cameBack', 'streak', 2, 'days', 'days'),
  award('oneWeek', 'streak', 7, 'days', 'days'),
  award('oneMonth', 'streak', 30, 'days', 'days'),
  award('oneYear', 'streak', 365, 'days', 'days'),
  award('weaver', 'threads', 1, 'threadFirst', 'other'),
  award('spider', 'threads', 100, 'threads', 'other'),
  award('colourist', 'colours', 100, 'colours', 'other'),
  award('scribbler', 'drawings', 100, 'drawings', 'other'),
  award('offTheShelf', 'templates', 10, 'templates', 'other'),
]

// A streak's achievement stays once earned, however the streak ends after.
const reached = (stats: Stats, counter: Counter) => (counter === 'streak' ? Math.max(stats.streak, stats.bestStreak) : stats[counter])
export const isEarned = (one: Achievement, stats: Stats) => reached(stats, one.counter) >= one.goal
export const earnedAchievements = (stats: Stats) => ACHIEVEMENTS.filter(one => isEarned(one, stats))
export const progressOf = (one: Achievement, stats: Stats) => Math.min(1, reached(stats, one.counter) / one.goal)

// The nearest one still to earn: what's closest to done, or the first with none begun.
export function nextAchievement(stats: Stats): Achievement | null {
  const left = ACHIEVEMENTS.filter(one => !isEarned(one, stats))
  return left.reduce<Achievement | null>((best, one) => (!best || progressOf(one, stats) > progressOf(best, stats) ? one : best), null)
}

const dayNumber = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

// A day arrived on: once a day, the streak on by one if it follows the last.
export function onDay(stats: Stats, today: string): Stats {
  if (stats.lastDay === today) return stats
  const follows = !!stats.lastDay && dayNumber(today) - dayNumber(stats.lastDay) === 1
  const streak = follows ? stats.streak + 1 : 1
  return { ...stats, streak, bestStreak: Math.max(stats.bestStreak, streak), daysHere: stats.daysHere + 1, lastDay: today, firstDay: stats.firstDay || today }
}

// This device's and the account's, as one: the higher of each count, as each is
// only ever added to (work on two devices between looks is counted as the more of
// the two, not both). The streak is that of whichever was here last.
export function mergeStats(here: Stats, there: Partial<Stats> | null | undefined): Stats {
  if (!there) return here
  const other = { ...NO_STATS, ...there }
  const count = (key: Counter | 'bestStreak' | 'daysHere') => Math.max(here[key], Number(other[key]) || 0)
  const latest = other.lastDay > here.lastDay ? other : here
  const pinnedAt = Number(other.pinnedAt) || 0
  // Chosen there later -- or never chosen either side, and none here yet.
  const theirPins = Array.isArray(other.pinned) && (pinnedAt > here.pinnedAt || (pinnedAt === here.pinnedAt && here.pinned.length === 0))
  return {
    ...here,
    tutorial: count('tutorial'), placed: count('placed'), deleted: count('deleted'), threads: count('threads'),
    colours: count('colours'), drawings: count('drawings'), templates: count('templates'),
    streak: latest.lastDay === here.lastDay && latest.lastDay === other.lastDay ? count('streak') : latest.streak,
    bestStreak: count('bestStreak'), daysHere: count('daysHere'),
    lastDay: latest.lastDay,
    firstDay: [here.firstDay, other.firstDay].filter(Boolean).sort()[0] ?? '',
    pinned: theirPins ? other.pinned.filter(id => typeof id === 'string').slice(0, MOST_PINNED) : here.pinned,
    pinnedAt: Math.max(here.pinnedAt, pinnedAt),
  }
}
