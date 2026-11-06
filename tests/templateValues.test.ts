// A template's values: read, written, spread to every setting linked to them.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { format, forget, heldBy, holdEverywhere, linkAsNew, parse, scopeOf, spread, unlink, usesOf, valueNow, valueThreads, freshName, type TemplateValue } from '../src/lib/templateValues.ts'

const trace = (id: string, rest: Record<string, unknown> = {}) => ({ id, x: 0, y: 0, rotation: 0, userId: 'u', username: 'me', createdAt: '', type: 'shape', shapeType: 'rectangle', content: '', layerId: 'G', ...rest }) as any
const accent: TemplateValue = { id: 'a', name: 'Accent', kind: 'colour', value: '#e8c15a' }
const font: TemplateValue = { id: 'f', name: 'Heading font', kind: 'font', value: 'mono' }

test('words read as each kind, or not at all', () => {
  assert.equal(parse('colour', '#E8C15A'), '#e8c15a')
  assert.equal(parse('colour', 'e8c15a'), '#e8c15a')
  assert.equal(parse('colour', '#fa0'), '#ffaa00')
  assert.equal(parse('colour', '#e8c15'), null)
  assert.equal(parse('colour', 'yellow'), null)
  assert.equal(parse('number', ' 12px '), 12)
  assert.equal(parse('number', '1,5'), 1.5)
  assert.equal(parse('number', 'twelve'), null)
  assert.equal(parse('toggle', 'Off'), false)
  assert.equal(parse('toggle', 'maybe'), null)
  assert.equal(parse('font', '  '), null)
  assert.equal(parse('text', ' as typed '), ' as typed ')
})

test('and shown as words', () => {
  assert.equal(format('colour', '#e8c15a'), '#E8C15A')
  assert.equal(format('number', 1 / 3), '0.33')
  assert.equal(format('toggle', true), 'On')
})

test("a setting's value: as it shows, defaults and named sizes included", () => {
  assert.equal(heldBy(trace('t', { type: 'text', fontSize: 'large' }), 'fontSize', 'number'), 24)
  assert.equal(heldBy(trace('t', { type: 'text', content: '#00ff00' }), 'content', 'colour'), '#00ff00')
  assert.equal(heldBy(trace('t', { type: 'text', content: 'green' }), 'content', 'colour'), null)
})

test('a colour changed on one trace reaches every setting linked to it, and only those', () => {
  const swatch = trace('s', { shapeColor: '#e8c15a', valueLinks: { shapeColor: 'a' } })
  const hex = trace('h', { type: 'text', content: '#E8C15A', valueLinks: { content: 'a' } })
  const title = trace('t', { type: 'text', textColor: '#e8c15a', fontFamily: 'mono', valueLinks: { textColor: 'a', fontFamily: 'f' } })
  const loose = trace('x', { shapeColor: '#e8c15a' })
  const after = { ...swatch, shapeColor: '#3b82f6' }
  const out = spread([swatch, hex, title, loose], [accent, font], after, ['shapeColor'])
  assert.deepEqual(out.unread, [])
  assert.deepEqual(out.held.map(h => h.held), ['#3b82f6'])
  assert.deepEqual(out.changes, [
    { id: 'h', changes: { content: '#3B82F6' } },
    { id: 't', changes: { textColor: '#3b82f6' } },
  ])
})

test('typed in a text that shows it: set back, when it reads as a colour', () => {
  const swatch = trace('s', { shapeColor: '#e8c15a', valueLinks: { shapeColor: 'a' } })
  const hex = trace('h', { type: 'text', content: '#E8C15A', valueLinks: { content: 'a' } })
  const good = spread([swatch, hex], [accent], { ...hex, content: '#00ff00' }, ['content'])
  assert.deepEqual(good.changes, [{ id: 's', changes: { shapeColor: '#00ff00' } }])
  const half = spread([swatch, hex], [accent], { ...hex, content: '#00ff' }, ['content'])
  assert.deepEqual(half.changes, [])
  assert.deepEqual(half.unread, ['content'])
})

test('a setting not linked, or linked to a value the group no longer has, spreads nothing', () => {
  const a = trace('a', { shapeColor: '#111111' }), b = trace('b', { shapeColor: '#111111', valueLinks: { shapeColor: 'gone' } })
  assert.deepEqual(spread([a, b], [accent], { ...a, shapeColor: '#222222' }, ['shapeColor']).changes, [])
  assert.deepEqual(spread([a, b], [accent], { ...b, shapeColor: '#222222' }, ['shapeColor']).changes, [])
})

test('two texts linked as one font: a new value from the first, both following it', () => {
  const one = trace('1', { type: 'text', fontFamily: 'serif' }), two = trace('2', { type: 'text', fontFamily: 'mono' })
  const made = linkAsNew([one, two], 'fontFamily', 'Font', 'v1')!
  assert.deepEqual(made.value, { id: 'v1', name: 'Font', kind: 'font', value: 'serif' })
  assert.deepEqual(made.changes, [
    { id: '1', changes: { valueLinks: { fontFamily: 'v1' } } },
    { id: '2', changes: { valueLinks: { fontFamily: 'v1' }, fontFamily: 'serif' } },
  ])
})

test('changed from the panel: every linked setting, words as words', () => {
  const swatch = trace('s', { shapeColor: '#e8c15a', valueLinks: { shapeColor: 'a' } })
  const hex = trace('h', { type: 'text', content: '#E8C15A', valueLinks: { content: 'a' } })
  assert.deepEqual(holdEverywhere([swatch, hex], accent, '#000000'), [
    { id: 's', changes: { shapeColor: '#000000' } },
    { id: 'h', changes: { content: '#000000'.toUpperCase() } },
  ])
  assert.equal(valueNow([swatch, hex], accent), '#e8c15a')
  assert.equal(valueNow([], accent), '#e8c15a')
  assert.equal(usesOf([swatch, hex], 'a'), 2)
})

test('unlinked, a setting keeps what it holds; a value gone frees all of its', () => {
  const title = trace('t', { type: 'text', textColor: '#e8c15a', fontFamily: 'mono', valueLinks: { textColor: 'a', fontFamily: 'f' } })
  assert.deepEqual(unlink([title], 'textColor'), [{ id: 't', changes: { valueLinks: { fontFamily: 'f' } } }])
  assert.deepEqual(forget([title, trace('x')], 'f'), [{ id: 't', changes: { valueLinks: { textColor: 'a' } } }])
  assert.deepEqual(unlink([{ ...title, valueLinks: { textColor: 'a' } }], 'textColor'), [{ id: 't', changes: { valueLinks: null } }])
})

test("a trace's values are its nearest group's that has them, shared with groups inside it", () => {
  const layers = [
    { id: 'G', name: 'Card', isGroup: true, parentId: null, userId: 'u', createdAt: '', template: { values: [accent] } },
    { id: 'H', name: 'Inner', isGroup: true, parentId: 'G', userId: 'u', createdAt: '' },
    { id: 'O', name: 'Other', isGroup: true, parentId: null, userId: 'u', createdAt: '' },
  ] as any
  const inner = trace('i', { layerId: 'H' }), top = trace('t', { layerId: 'G' }), out = trace('o', { layerId: 'O' })
  const scope = scopeOf(inner, [inner, top, out], layers)!
  assert.equal(scope.group.id, 'G')
  assert.deepEqual(scope.members.map(t => t.id), ['i', 't'])
  assert.equal(scopeOf(out, [inner, top, out], layers), null)
})

test('new names never repeat one taken', () => {
  assert.equal(freshName([accent], 'Colour'), 'Colour')
  assert.equal(freshName([{ ...accent, name: 'Colour' }, { ...accent, name: 'colour 2' }], 'Colour'), 'Colour 3')
})

test('shown as threads: each value joins its traces left to right, in its colour', () => {
  const a = trace('a1', { x: 300, shapeColor: '#112233', valueLinks: { shapeColor: 'a' } })
  const b = trace('b1', { x: 0, shapeColor: '#112233', valueLinks: { shapeColor: 'a', fontFamily: 'f' } })
  const c = trace('c1', { x: 100, valueLinks: { fontFamily: 'f' } })
  const lone = trace('d1', { x: 50 })
  const threads = valueThreads([a, b, c, lone], [accent, font])
  assert.deepEqual(threads.map(t => [t.valueId, t.from, t.to]), [['a', 'b1', 'a1'], ['f', 'b1', 'c1']])
  assert.equal(threads[0].colour, '#112233')
  assert.notEqual(threads[1].colour, threads[0].colour)
})

// ---- Rules: a value following another.
import { applyRule, canFollow, followers, removeValue, setRule, setValue } from '../src/lib/templateValues.ts'

const base: TemplateValue = { id: 'b', name: 'Base', kind: 'colour', value: '#336699' }
const light: TemplateValue = { id: 'l', name: 'Light', kind: 'colour', value: '#000000', rule: { from: 'b', op: 'lighter', amount: 50 } }
const label: TemplateValue = { id: 'r', name: 'Label', kind: 'colour', value: '#000000', rule: { from: 'l', op: 'readable' } }

test('each rule, from what it follows', () => {
  assert.equal(applyRule({ from: 'b', op: 'lighter', amount: 50 }, '#336699'), '#99b3cc')
  assert.equal(applyRule({ from: 'b', op: 'darker', amount: 50 }, '#336699'), '#1a334d')
  assert.equal(applyRule({ from: 'b', op: 'readable' }, '#f2e2b3'), '#1a1a1a')
  assert.equal(applyRule({ from: 'b', op: 'readable' }, '#2a2a26'), '#ffffff')
  // Mid blues and reds take white, as people read them.
  assert.equal(applyRule({ from: 'b', op: 'readable' }, '#3b82f6'), '#ffffff')
  assert.equal(applyRule({ from: 'b', op: 'readable' }, '#ff0000'), '#ffffff')
  assert.equal(applyRule({ from: 'b', op: 'readable' }, '#ffff00'), '#1a1a1a')
  assert.equal(applyRule({ from: 'b', op: 'times', amount: 1.5 }, 16), 24)
  assert.equal(applyRule({ from: 'b', op: 'plus' }, 16), 24)
  assert.equal(applyRule({ from: 'b', op: 'capitals' }, 'Chapter one'), 'CHAPTER ONE')
  assert.equal(applyRule({ from: 'b', op: 'opposite' }, true), false)
})

test('a ruled value holds what its rule makes, however far back it follows', () => {
  const swatch = trace('S', { shapeColor: '#336699', valueLinks: { shapeColor: 'b' } })
  assert.equal(valueNow([swatch], light, [base, light, label]), '#99b3cc')
  assert.equal(valueNow([swatch], label, [base, light, label]), '#1a1a1a')
  // What it followed gone: its own again.
  assert.equal(valueNow([swatch], light, [light]), '#000000')
})

test('a value changed: those following it, and following them, follow', () => {
  const out = followers([base, light, label], new Map([['b', '#000000']]))
  assert.deepEqual([...out], [['l', '#808080'], ['r', '#1a1a1a']])
})

test("a linked setting changed: settings linked to its followers change in the same step, and a ruled one's can't be set by hand", () => {
  const swatch = trace('S', { shapeColor: '#336699', valueLinks: { shapeColor: 'b' } })
  const tint = trace('T', { shapeColor: '#99b3cc', valueLinks: { shapeColor: 'l' } })
  const words = trace('W', { type: 'text', textColor: '#1a1a1a', valueLinks: { textColor: 'r' } })
  const values = [base, light, label]
  const out = spread([swatch, tint, words], values, { ...swatch, shapeColor: '#000000' }, ['shapeColor'])
  assert.deepEqual(out.changes, [{ id: 'T', changes: { shapeColor: '#808080' } }])
  const onBase = [base, light, { ...label, rule: { from: 'b', op: 'readable' as const } }]
  const dark = spread([swatch, tint, words], onBase, { ...swatch, shapeColor: '#202020' }, ['shapeColor'])
  assert.deepEqual(dark.changes.find(c => c.id === 'W'), { id: 'W', changes: { textColor: '#ffffff' } })
  // The tint set by hand: put back to what its rule makes.
  const byHand = spread([swatch, tint, words], values, { ...tint, shapeColor: '#ff0000' }, ['shapeColor'])
  assert.deepEqual(byHand.changes, [{ id: 'T', changes: { shapeColor: '#99b3cc' } }])
})

test('set from the panel: what follows it too; linked to nothing, it keeps it itself', () => {
  const tint = trace('T', { shapeColor: '#99b3cc', valueLinks: { shapeColor: 'l' } })
  const out = setValue([tint], [base, light], base, '#000000')
  assert.deepEqual(out.changes, [{ id: 'T', changes: { shapeColor: '#808080' } }])
  assert.equal(out.values?.find(v => v.id === 'b')?.value, '#000000')
})

test('a rule given, its settings follow at once; taken away, they keep what they hold', () => {
  const tint = trace('T', { shapeColor: '#ff0000', valueLinks: { shapeColor: 'l' } })
  const free = { ...light, rule: null }
  const given = setRule([tint], [base, free], 'l', { from: 'b', op: 'darker', amount: 50 })
  assert.deepEqual(given.changes, [{ id: 'T', changes: { shapeColor: '#1a334d' } }])
  assert.equal(given.values[1].rule?.op, 'darker')
  const taken = setRule([{ ...tint, shapeColor: '#1a334d' }], given.values, 'l', null)
  assert.deepEqual(taken.changes, [])
  assert.equal(taken.values[1].rule, null)
  assert.equal(taken.values[1].value, '#1a334d')
})

test('never in a circle, and only of its own kind', () => {
  const values = [base, light, label, accent, font]
  assert.equal(canFollow(values, 'b', 'r'), false)
  assert.equal(canFollow(values, 'b', 'b'), false)
  assert.equal(canFollow(values, 'b', 'f'), false)
  assert.equal(canFollow(values, 'r', 'a'), true)
})

test('a followed value deleted: its followers keep what they hold, following nothing', () => {
  const out = removeValue([], [base, light, label], 'b')
  assert.deepEqual(out.values.map(v => [v.id, v.rule?.op ?? null, v.value]), [['l', null, '#99b3cc'], ['r', 'readable', '#000000']])
})
