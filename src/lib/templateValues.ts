// A template's values (docs/IDEAS.md, "Making your own"): a named colour, font,
// number, text or on/off that traces' settings are linked to. Linked, they're one
// setting: changed on any trace, or in the panel, every trace linked to it follows.
//
// The values are kept on a group (Layer.template), each trace's links on the trace
// (Trace.valueLinks: setting -> value id). A value's own `value` is what it holds
// with nothing linked to it; once something is, the linked traces hold it, all
// alike, and it's read from them (valueNow).
//
// A text's words can show any value -- a colour as its hex code, a number as
// digits -- and typing in them sets it back, when what's typed reads as one.

import type { Layer, Trace } from '../types/database'
import { shownValue } from './traceStyle.ts'

export type ValueKind = 'colour' | 'font' | 'number' | 'text' | 'toggle'
export type Held = string | number | boolean
export interface TemplateValue { id: string; name: string; kind: ValueKind; value: Held }
export interface TemplateValues { values: TemplateValue[] }

// What each linkable setting holds. A text's words take any kind, shown as words.
export const LINKABLE = {
  fillColor: 'colour', borderColor: 'colour', textColor: 'colour', shapeColor: 'colour', shapeOutlineColor: 'colour', lightColor: 'colour',
  fontFamily: 'font',
  fontSize: 'number', borderWidth: 'number', borderRadius: 'number', cornerRadius: 'number', shapeOutlineWidth: 'number',
  shapeOpacity: 'number', fillOpacity: 'number', borderOpacity: 'number',
  showBorder: 'toggle', showBackground: 'toggle', textBold: 'toggle', textItalic: 'toggle',
  content: 'any',
} as const satisfies Record<string, ValueKind | 'any'>
export type LinkableKey = keyof typeof LINKABLE
export type ValueLinks = Partial<Record<LinkableKey, string>>

export const isLinkable = (key: string): key is LinkableKey => key in LINKABLE
export const fits = (key: LinkableKey, kind: ValueKind) => LINKABLE[key] === 'any' || LINKABLE[key] === kind
// The kind a new value made from this setting is.
export const kindFor = (key: LinkableKey): ValueKind => LINKABLE[key] === 'any' ? 'text' : LINKABLE[key] as ValueKind

const NAMED_SIZES: Record<string, number> = { small: 14, medium: 16, large: 24 }

/** A value as words: what a text linked to it shows. */
export function format(kind: ValueKind, value: Held): string {
  if (kind === 'colour') return String(value).toUpperCase()
  if (kind === 'number') return String(Math.round(Number(value) * 100) / 100)
  if (kind === 'toggle') return value ? 'On' : 'Off'
  return String(value)
}

/** Words read as a value of `kind`, or null where they don't read as one. */
export function parse(kind: ValueKind, words: string): Held | null {
  const text = words.trim()
  if (kind === 'colour') {
    const m = text.match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i)
    if (!m) return null
    const hex = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1]
    return '#' + hex.toLowerCase()
  }
  if (kind === 'number') {
    const m = text.match(/^(-?\d+(?:[.,]\d+)?)\s*(px|%)?$/i)
    return m ? Number(m[1].replace(',', '.')) : null
  }
  if (kind === 'toggle') {
    const word = text.toLowerCase()
    if (['on', 'yes', 'true', '1'].includes(word)) return true
    if (['off', 'no', 'false', '0'].includes(word)) return false
    return null
  }
  if (kind === 'font') return text || null
  return words
}

const same = (a: Held | null, b: Held | null) => typeof a === 'string' && typeof b === 'string' ? a.toLowerCase() === b.toLowerCase() : a === b

/** What a trace's setting holds, as a value of `kind`: null where it can't be one
 *  (its words don't read as one, or it has no such setting). */
export function heldBy(trace: Partial<Trace>, key: LinkableKey, kind: ValueKind): Held | null {
  if (key === 'content') return parse(kind, trace.content ?? '')
  const shown = shownValue(trace, key)
  if (shown === null || shown === undefined) return null
  if (kind === 'number') return typeof shown === 'string' ? NAMED_SIZES[shown] ?? (Number(shown) || null) : Number(shown)
  if (kind === 'toggle') return !!shown
  return shown as Held
}

// The setting as it's written, holding `value`.
const written = (key: LinkableKey, kind: ValueKind, value: Held) => key === 'content' ? format(kind, value) : value

// The groups a trace is in, its own first.
function groupsAround(trace: Trace, layers: Layer[]): Layer[] {
  const byId = new Map(layers.map(layer => [layer.id, layer]))
  const out: Layer[] = []
  for (let group = trace.layerId ? byId.get(trace.layerId) : undefined; group && out.length < 64; group = group.parentId ? byId.get(group.parentId) : undefined) out.push(group)
  return out
}

/** Where a trace's values are kept: its nearest group with values, or else, for a
 *  first one, the outermost group it's in. None outside any group. */
export function valuesHome(trace: Trace, layers: Layer[]): Layer | null {
  const around = groupsAround(trace, layers)
  return around.find(group => group.template) ?? around[around.length - 1] ?? null
}

/** Every trace in `group`, or in a group inside it. */
export function membersOf(group: Layer, traces: Trace[], layers: Layer[]): Trace[] {
  const inside = new Set([group.id])
  for (let grew = true; grew;) {
    grew = false
    for (const layer of layers) if (layer.parentId && inside.has(layer.parentId) && !inside.has(layer.id)) { inside.add(layer.id); grew = true }
  }
  return traces.filter(t => t.layerId && inside.has(t.layerId))
}

/** Whether a text's words, linked to a value, don't read as it: shown outlined,
 *  and nothing linked to them follows until they do. */
export function wordsUnread(trace: Trace, layers: Layer[], values?: TemplateValue[]): boolean {
  const id = trace.valueLinks?.content
  const value = id ? (values ?? groupsAround(trace, layers).find(group => group.template)?.template?.values)?.find(v => v.id === id) : undefined
  return !!value && parse(value.kind, trace.content ?? '') === null
}

/** The traces a trace's values are shared among, and the group keeping them. */
export function scopeOf(trace: Trace, traces: Trace[], layers: Layer[]): { group: Layer; members: Trace[] } | null {
  const group = groupsAround(trace, layers).find(layer => layer.template)
  return group ? { group, members: membersOf(group, traces, layers) } : null
}

const entries = (links: ValueLinks | null | undefined) => Object.entries(links ?? {}) as [LinkableKey, string][]

/** How many settings, among `members`, are linked to a value. */
export const usesOf = (members: Trace[], valueId: string) =>
  members.reduce((n, t) => n + entries(t.valueLinks).filter(([, id]) => id === valueId).length, 0)

/** What a value holds now: its linked traces', or its own where none is linked. */
export function valueNow(members: Trace[], value: TemplateValue): Held {
  for (const trace of members) {
    for (const [key, id] of entries(trace.valueLinks)) {
      if (id !== value.id) continue
      const held = heldBy(trace, key, value.kind)
      if (held !== null) return held
    }
  }
  return value.value
}

export interface Change { id: string; changes: Partial<Trace> }

/** Every linked setting among `members` made to hold `value` -- but `except`'s
 *  `exceptKey`, which is where it came from. Only what differs. */
export function holdEverywhere(members: Trace[], value: TemplateValue, held: Held, except?: { id: string; key: LinkableKey }): Change[] {
  const out: Change[] = []
  for (const trace of members) {
    const changes: Partial<Trace> = {}
    for (const [key, id] of entries(trace.valueLinks)) {
      if (id !== value.id || (except && trace.id === except.id && key === except.key)) continue
      if (same(heldBy(trace, key, value.kind), held) && (key !== 'content' || trace.content === format(value.kind, held))) continue
      ;(changes as Record<string, unknown>)[key] = written(key, value.kind, held)
    }
    if (Object.keys(changes).length) out.push({ id: trace.id, changes })
  }
  return out
}

/** A trace's settings changed (`after`, with `keys` changed): what its linked
 *  values now hold, and the other settings linked to them, made to hold it. A
 *  text whose words don't read as its value's kind changes nothing (`unread`). */
export function spread(members: Trace[], values: TemplateValue[], after: Trace, keys: string[]): { changes: Change[]; held: { value: TemplateValue; held: Held }[]; unread: LinkableKey[] } {
  const changes = new Map<string, Partial<Trace>>()
  const held: { value: TemplateValue; held: Held }[] = []
  const unread: LinkableKey[] = []
  const now = members.map(t => t.id === after.id ? after : t)
  for (const key of keys) {
    if (!isLinkable(key)) continue
    const valueId = after.valueLinks?.[key]
    const value = valueId ? values.find(v => v.id === valueId) : undefined
    if (!value || held.some(h => h.value.id === value.id)) continue
    const v = heldBy(after, key, value.kind)
    if (v === null) { unread.push(key); continue }
    held.push({ value, held: v })
    for (const { id, changes: c } of holdEverywhere(now, value, v, { id: after.id, key })) changes.set(id, { ...changes.get(id), ...c })
  }
  return { changes: [...changes].map(([id, c]) => ({ id, changes: c })), held, unread }
}

/** `traces`' `key` linked to a new value made from the first one's setting, named
 *  `name`: the value, and each trace's change (its links, and the value where it
 *  differs). Null when the first holds nothing that can be a value. */
export function linkAsNew(traces: Trace[], key: LinkableKey, name: string, id: string): { value: TemplateValue; changes: Change[] } | null {
  const first = traces[0]
  if (!first) return null
  const kind = kindFor(key)
  const held = heldBy(first, key, kind)
  if (held === null) return null
  const value: TemplateValue = { id, name, kind, value: held }
  return { value, changes: linkTo(traces, key, value, held) }
}

/** `traces`' `key` linked to `value`, each made to hold `held` (its value now). */
export function linkTo(traces: Trace[], key: LinkableKey, value: TemplateValue, held: Held): Change[] {
  return traces.map(trace => {
    const changes: Partial<Trace> = { valueLinks: { ...trace.valueLinks, [key]: value.id } }
    if (!same(heldBy(trace, key, value.kind), held) || (key === 'content' && trace.content !== format(value.kind, held))) {
      (changes as Record<string, unknown>)[key] = written(key, value.kind, held)
    }
    return { id: trace.id, changes }
  })
}

// Each trace's links but those `drop` says: its settings keep what they hold.
function without(traces: Trace[], drop: (key: LinkableKey, id: string) => boolean): Change[] {
  return traces.flatMap(trace => {
    const all = entries(trace.valueLinks), kept = all.filter(([key, id]) => !drop(key, id))
    if (kept.length === all.length) return []
    return [{ id: trace.id, changes: { valueLinks: kept.length ? Object.fromEntries(kept) : null } }]
  })
}

/** `traces`' `key` made their own again: it keeps what it holds. */
export const unlink = (traces: Trace[], key: LinkableKey) => without(traces, k => k === key)

/** A value gone: every setting linked to it made its trace's own. */
export const forget = (members: Trace[], valueId: string) => without(members, (_, id) => id === valueId)

/** A name for a new value of `kind` not yet among `values`: "Colour 2". */
export function freshName(values: TemplateValue[], base: string): string {
  const taken = new Set(values.map(v => v.name.toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`
}

// A value's thread colour where it isn't a colour itself: one each, in order.
const THREAD_COLOURS = ['#e8c15a', '#6fb7ff', '#ff7a8a', '#7fd6a2', '#c79bff', '#ffa65c']

/** What "Show links" draws: each value's linked traces among `members`, joined
 *  left to right, one thread between each two, in the value's colour -- a
 *  colour value's own, any other's one of its own. */
export function valueThreads(members: Trace[], values: TemplateValue[]): { valueId: string; from: string; to: string; colour: string }[] {
  return values.flatMap((value, i) => {
    const colour = value.kind === 'colour' ? String(valueNow(members, value)) : THREAD_COLOURS[i % THREAD_COLOURS.length]
    const linked = members.filter(t => entries(t.valueLinks).some(([, id]) => id === value.id)).sort((a, b) => a.x - b.x || a.y - b.y)
    return linked.slice(1).map((t, j) => ({ valueId: value.id, from: linked[j].id, to: t.id, colour }))
  })
}
