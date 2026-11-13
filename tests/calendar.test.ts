// A calendar (.ics) as a calendar app reads it -- repeats, a moved repeat, a
// cancelled one, whole days, a time zone defined in the file -- and its drawing.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { asCalendarSettings, calendarSvg, daysShown, readCalendar, stepped } from '../src/lib/calendar.ts'

const ICS = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', 'X-WR-CALNAME:Studio',
  'BEGIN:VTIMEZONE', 'TZID:Europe/Lisbon',
  'BEGIN:STANDARD', 'DTSTART:19701025T020000', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'BEGIN:DAYLIGHT', 'DTSTART:19700329T010000', 'TZOFFSETFROM:+0000', 'TZOFFSETTO:+0100', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'END:VTIMEZONE',
  // Every Monday at 10:00 Lisbon, eight times; the third moved to Tuesday, the fourth cancelled.
  'BEGIN:VEVENT', 'UID:weekly@test', 'SUMMARY:Review <b>&</b> plan', 'DTSTART;TZID=Europe/Lisbon:20261102T100000', 'DTEND;TZID=Europe/Lisbon:20261102T110000',
  'RRULE:FREQ=WEEKLY;COUNT=8', 'EXDATE;TZID=Europe/Lisbon:20261123T100000', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:weekly@test', 'RECURRENCE-ID;TZID=Europe/Lisbon:20261116T100000', 'SUMMARY:Review (moved)', 'DTSTART;TZID=Europe/Lisbon:20261117T150000', 'DTEND;TZID=Europe/Lisbon:20261117T160000', 'END:VEVENT',
  // A whole day, and one in UTC.
  'BEGIN:VEVENT', 'UID:holiday@test', 'SUMMARY:Holiday', 'DTSTART;VALUE=DATE:20261201', 'DTEND;VALUE=DATE:20261202', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:call@test', 'SUMMARY:Call', 'DTSTART:20261105T180000Z', 'DTEND:20261105T183000Z', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:gone@test', 'SUMMARY:Gone', 'STATUS:CANCELLED', 'DTSTART:20261106T090000Z', 'DTEND:20261106T100000Z', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n')

test('a calendar file read as a calendar app reads it', async () => {
  const calendar = await readCalendar(ICS)
  assert.equal(calendar.name, 'Studio')
  const november = calendar.between(new Date(Date.UTC(2026, 10, 1)), new Date(Date.UTC(2026, 11, 1)))
  const reviews = november.filter(e => e.title.startsWith('Review'))
  // 2, 9, (16 moved to 17), (23 cancelled), 30
  assert.deepEqual(reviews.map(e => e.start.toISOString()), ['2026-11-02T10:00:00.000Z', '2026-11-09T10:00:00.000Z', '2026-11-17T15:00:00.000Z', '2026-11-30T10:00:00.000Z'])
  assert.equal(reviews[2].title, 'Review (moved)')
  assert.ok(november.some(e => e.title === 'Call' && e.start.toISOString() === '2026-11-05T18:00:00.000Z'))
  assert.ok(!november.some(e => e.title === 'Gone'), 'a cancelled event is left out')
  const december = calendar.between(new Date(Date.UTC(2026, 11, 1)), new Date(Date.UTC(2027, 0, 1)))
  const holiday = december.find(e => e.title === 'Holiday')!
  assert.equal(holiday.allDay, true)
  // In summer time, Lisbon is an hour ahead of UTC.
  const summer = (await readCalendar(ICS.replace(/2026110/g, '2026070').replace('20261116', '20260716').replace('20261117', '20260717').replace('20261123', '20260723'))).between(new Date(Date.UTC(2026, 6, 1)), new Date(Date.UTC(2026, 6, 4)))
  assert.equal(summer.find(e => e.title.startsWith('Review'))?.start.toISOString(), '2026-07-02T09:00:00.000Z')
})

test('not a calendar is said so', async () => {
  await assert.rejects(readCalendar('hello'))
})

test('a month shows its whole weeks, a week its seven days', () => {
  const { from, to, weeks } = daysShown('month', new Date(2026, 10, 12), 1)
  assert.equal(from.getDay(), 1)
  assert.ok(from <= new Date(2026, 10, 1) && to > new Date(2026, 10, 30))
  assert.equal(weeks, 6)
  const week = daysShown('week', new Date(2026, 10, 12), 7)
  assert.equal(week.from.getDay(), 0)
  assert.equal((+week.to - +week.from) / 86_400_000, 7)
  assert.equal(stepped('month', new Date(2026, 0, 31), 1).getMonth(), 1)
  assert.equal(stepped('week', new Date(2026, 10, 12), -1).getDate(), 5)
  // Back to this month: on today, so its Week is this week.
  assert.equal(stepped('month', new Date(2026, 11, 1), -1, new Date(2026, 10, 13)).getDate(), 13)
  assert.equal(stepped('month', new Date(2026, 10, 13), 1, new Date(2026, 10, 13)).getDate(), 1)
})

test('its words are drawn as words, never as markup', async () => {
  const calendar = await readCalendar(ICS)
  const anchor = new Date(2026, 10, 12)
  const look = { ink: '#e6e1d3', surface: '#191919', accent: '#ff8a3d', font: 'monospace' }
  for (const view of ['month', 'week'] as const) {
    const { from, to } = daysShown(view, anchor, 1)
    const svg = calendarSvg(calendar.between(from, to), view, anchor, 720, 540, look, 'en', anchor, 1)
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'))
    assert.ok(!svg.includes('<b>'), 'an event\'s title is escaped')
  }
})

test('settings read only as one', () => {
  assert.deepEqual(asCalendarSettings({ view: 'week' }), { view: 'week' })
  assert.deepEqual(asCalendarSettings('{"view":"nonsense"}'), { view: 'month' })
  assert.equal(asCalendarSettings(null), undefined)
})

test('a calendar address, known as one and read as one', async () => {
  const { asCalendarLink, looksLikeCalendarLink } = await import('../src/lib/calendar.ts')
  assert.equal(asCalendarLink(' webcal://p01-caldav.icloud.com/published/2/abc '), 'https://p01-caldav.icloud.com/published/2/abc')
  assert.equal(asCalendarLink('ftp://x/y.ics'), null)
  assert.equal(asCalendarLink('not a link'), null)
  assert.ok(looksLikeCalendarLink('https://calendar.google.com/calendar/ical/abc%40group.calendar.google.com/private-123/basic.ics'))
  assert.ok(looksLikeCalendarLink('webcal://example.org/team'))
  assert.ok(looksLikeCalendarLink('https://outlook.office365.com/owa/calendar/x/y/calendar.ics'))
  assert.ok(!looksLikeCalendarLink('https://example.org/page'))
  assert.ok(!looksLikeCalendarLink('see https://example.org/a.ics today'))
  assert.deepEqual(asCalendarSettings({ view: 'week', link: 'https://e.org/c.ics' }), { view: 'week', link: 'https://e.org/c.ics' })
  assert.deepEqual(asCalendarSettings({ view: 'month', link: 'javascript:alert(1)' }), { view: 'month' })
})

test('events made, changed and taken away in the atrium, written as a calendar file', async () => {
  const { emptyCalendarFile, withEvent, withoutEvent, dayKey } = await import('../src/lib/calendar.ts')
  const empty = await emptyCalendarFile('Mine').text()
  assert.equal((await readCalendar(empty)).name, 'Mine')
  const made = await withEvent(empty, { title: 'Crit', date: '2026-11-12', allDay: false, from: '14:00', to: '15:30', repeat: 'weekly' })
  const calendar = await readCalendar(made)
  const crits = calendar.between(new Date(2026, 10, 1), new Date(2026, 11, 1))
  assert.deepEqual(crits.map(e => dayKey(e.start)), ['2026-11-12', '2026-11-19', '2026-11-26'])
  assert.equal(crits[0].start.getHours(), 14)
  assert.equal(crits[0].end.getMinutes(), 30)
  assert.equal(crits[0].repeat, 'weekly')
  const uid = crits[0].uid!
  assert.ok(uid)
  const moved = await readCalendar(await withEvent(made, { title: 'Crit (moved)', date: '2026-11-13', allDay: true, from: '', to: '', repeat: 'none' }, uid))
  const now = moved.between(new Date(2026, 10, 1), new Date(2026, 11, 1))
  assert.equal(now.length, 1)
  assert.equal(now[0].title, 'Crit (moved)')
  assert.equal(now[0].allDay, true)
  assert.equal(dayKey(now[0].start), '2026-11-13')
  assert.equal((await readCalendar(await withoutEvent(made, uid))).between(new Date(2026, 0, 1), new Date(2027, 0, 1)).length, 0)
  // An end before its start is an hour after it.
  const backwards = (await readCalendar(await withEvent(empty, { title: 'x', date: '2026-11-12', allDay: false, from: '10:00', to: '09:00', repeat: 'none' }))).between(new Date(2026, 10, 12), new Date(2026, 10, 13))[0]
  assert.equal(backwards.end.getHours(), 11)
})

test('weeks numbered as calendars in Europe number them; colours and looks kept', async () => {
  const { isoWeek, emptyCalendarFile, withEvent, calendarLook } = await import('../src/lib/calendar.ts')
  assert.equal(isoWeek(new Date(2026, 0, 1)), 1)
  assert.equal(isoWeek(new Date(2026, 10, 12)), 46)
  assert.equal(isoWeek(new Date(2027, 0, 1)), 53)
  assert.equal(isoWeek(new Date(2024, 11, 30)), 1)
  const anchor = new Date(2026, 10, 12)
  const look = { ink: '#e6e1d3', surface: '#191919', accent: '#ff8a3d', font: 'monospace' }
  const week = calendarSvg([], 'week', anchor, 720, 540, look, 'en', anchor, 1, 1, 'CW')
  assert.ok(week.includes('(CW46)'))
  const month = calendarSvg([], 'month', anchor, 720, 540, look, 'en', anchor, 1, 1, 'KW')
  assert.ok(month.includes('>KW44<') && month.includes('>KW49<'))
  // A highlight, kept in the file, drawn with words readable on it.
  const text = await withEvent(await emptyCalendarFile('x').text(), { title: 'Yellow', date: '2026-11-12', allDay: true, from: '', to: '', repeat: 'none', colour: '#c7b27c' })
  assert.match(text, /X-ATRIUM-COLOR:#c7b27c/i)
  const [yellow] = (await readCalendar(text)).between(new Date(2026, 10, 12), new Date(2026, 10, 13))
  assert.equal(yellow.colour, '#c7b27c')
  const drawn = calendarSvg([yellow], 'month', anchor, 720, 540, look, 'en', anchor, 1)
  assert.ok(drawn.includes('fill="#1a1a1a">Yellow'), 'dark words on a light highlight')
  // Its paper: light, dark, or the one looking's mode.
  assert.equal(calendarLook({ calendar: { view: 'month', theme: 'dark' } }).surface, '#18181b')
  assert.equal(calendarLook({ calendar: { view: 'month', theme: 'auto' } }, 'light').surface, '#f7f4ee')
  assert.deepEqual(asCalendarSettings({ view: 'week', theme: 'auto' }), { view: 'week', theme: 'auto' })
})
