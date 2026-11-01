// The Digital Atrium templates: each a file the import can place whole.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { fileOrderKeys } from '../src/lib/atriumFormat.ts'
import { carriedFrameId } from '../src/lib/frames.ts'
import { allTemplates, DIGITAL_ATRIUM_FOLDER, guideFile, guideMiddle } from '../src/lib/templates.ts'

const words = (key: string, vars?: Record<string, string | number>) => key + (vars ? JSON.stringify(vars) : '')
const context = { userId: 'u', username: 'me', colours: { border: '#111111', fill: '#eeeeee', text: '#222222' }, ink: '#000000', t: words }

test('every template has an id of its own', () => {
  const ids = allTemplates(DIGITAL_ATRIUM_FOLDER).map(template => template.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.length >= 8)
})

for (const template of allTemplates(DIGITAL_ATRIUM_FOLDER)) {
  test(`${template.id}: a sound file`, () => {
    const file = template.build(context) as any
    assert.ok(file.traces.length > 0)
    const ids = new Set(file.traces.map((row: any) => row.id))
    assert.equal(ids.size, file.traces.length, 'its ids repeat')
    for (const row of file.traces) {
      assert.ok(row.width > 0 && row.height > 0, `${row.type} has no size`)
      assert.equal(row.user_id, 'u')
      // What a frame holds comes along with it (the import repoints these).
      if (row.frame_id) assert.ok(ids.has(row.frame_id), 'it points at a frame not there')
    }
    for (const link of file.links) assert.ok(ids.has(link.from_trace) && ids.has(link.to_trace), 'a thread is loose')
    // Frames go under what they hold.
    const keys = fileOrderKeys(file).traceKeyOf
    for (const row of file.traces) {
      if (!row.frame_id) continue
      const frame = file.traces.find((t: any) => t.id === row.frame_id)
      assert.ok(keys.get(frame)! < keys.get(row)!, 'a frame lies over what it holds')
    }
    const fresh = new Map(file.traces.map((row: any) => [row.id, `new-${row.id}`] as [string, string]))
    for (const row of file.traces) if (row.frame_id) assert.equal(carriedFrameId(row.frame_id, fresh), `new-${row.frame_id}`)
  })
}

test('the guide: its second card peeks in at the edge of the view, however wide', () => {
  for (const viewWidth of [390, 1440, 2560]) {
    const file = guideFile({ ...context, viewWidth }) as any
    const [first, second] = file.traces
    assert.equal(first.position_x, 0)
    const secondLeft = second.position_x - second.width / 2
    assert.ok(secondLeft < viewWidth / 2, `at ${viewWidth} it starts off the view, at ${secondLeft}`)
    assert.ok(secondLeft > first.width / 2, `at ${viewWidth} it overlaps the first`)
  }
})

test('the guide leaves the last lesson undone: the two boxes are not joined', () => {
  const file = guideFile(context) as any
  const id = (key: string) => file.traces.find((row: any) => row.content === key).id
  const from = id('templates.guide.from'), to = id('templates.guide.to')
  assert.ok(!file.links.some((l: any) => (l.from_trace === from && l.to_trace === to) || (l.from_trace === to && l.to_trace === from)))
})

test('guideMiddle is how far the middle of it all is from its first card', () => {
  const file = guideFile({ ...context, viewWidth: 1440 }) as any
  const middle = guideMiddle(file)
  const right = Math.max(...file.traces.map((r: any) => r.position_x + r.width / 2))
  assert.equal(middle.x, (right - file.traces[0].width / 2) / 2)
})

test('a template takes the atrium\'s colours and its words', () => {
  const note = allTemplates(DIGITAL_ATRIUM_FOLDER).find(template => template.id === 'note')!.build(context) as any
  assert.equal(note.traces[0].border_color, '#111111')
  assert.equal(note.traces[0].content, 'templates.text.note')
})
