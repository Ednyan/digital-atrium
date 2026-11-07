// Templates (docs/IDEAS.md): traces ready to be dragged onto the canvas, kept in
// folders. A template is what an .atrium file holds, placed by the same import
// (lib/atriumFile importIntoAtrium): one undo step, new ids, at the drop.
//
// The Digital Atrium folder is made here rather than kept in files: its words
// come in the person's language, its colours from the atrium's, and it costs
// nothing to fetch. People's own are made in the template editor (lib/workshop).

import type { AtriumFile } from './atriumFormat.ts'
import { isSlot, type SlotFit } from './frames.ts'
import { readableOn } from './shapeStyle.ts'
import { traceRow } from './traceInsert.ts'
import type { Trace } from '../types/database'
import { applyRule, format, type Held, type LinkableKey, type Rule, type TemplateValue, type ValueKind } from './templateValues.ts'

export interface TemplateContext {
  userId: string
  username: string
  // The atrium's own, so a template looks at home wherever it's dropped.
  colours: { border: string; fill: string; text: string }
  // Text straight on the atrium's background.
  ink: string
  t: (key: any, vars?: Record<string, string | number>) => string
  // The person's language, for what the browser can name in it (the days).
  language?: string
}

export interface TemplateItem { kind: 'template'; id: string; name: string; build: (c: TemplateContext) => AtriumFile }
export interface TemplateFolder { kind: 'folder'; id: string; name: string; items: TemplateNode[] }
export type TemplateNode = TemplateItem | TemplateFolder

// Traces and threads, in the order they stack: the first at the bottom. One with
// values or slots is a group holding them, as a template made in the editor is
// placed; one without stays loose, its traces each picked up alone (a task board's cards).
function board(c: TemplateContext, name: string, make: (b: ReturnType<typeof builder>) => void): AtriumFile {
  const b = builder(c)
  make(b)
  const group = b.values.length > 0 || b.traces.some(isSlot) ? 'template' : null
  return {
    version: 3,
    layerOrder: 'flat',
    exportedAt: new Date().toISOString(),
    app: 'Digital Atrium',
    lobby: { name, theme_settings: null, is_public: false, max_players: 0 },
    layers: group ? [{ name, z_index: 0, is_group: true, parent_id: null, template: { values: b.values }, _local_id: group }] : [],
    locations: [],
    traces: b.traces.map((trace, i) => ({ ...traceRow(trace), z_index: i, ...(group ? { _local_layer_id: group } : {}) })),
    links: b.links.map(([from, to, arrow]) => ({ from_trace: from, to_trace: to, arrow })),
  } as unknown as AtriumFile
}

// Each maker takes the trace's middle and size, and `rest` for anything it sets otherwise.
function builder(c: TemplateContext) {
  const traces: Trace[] = []
  const links: [string, string, 'none' | 'forward'][] = []
  const values: TemplateValue[] = []
  const add = (x: number, y: number, width: number, height: number, rest: Partial<Trace>) => {
    const trace = {
      id: crypto.randomUUID(), userId: c.userId, username: c.username, createdAt: '', x, y, width, height,
      scaleX: 1, scaleY: 1, rotation: 0, showFilename: false, showShadow: false, showDescription: false,
      borderColor: c.colours.border, fillColor: c.colours.fill, textColor: c.colours.text, borderWidth: 2, borderRadius: 8,
      ...rest,
    } as Trace
    traces.push(trace)
    return trace.id
  }
  const byId = (id: string) => values.find(v => v.id === id)!
  return {
    traces, links, values,
    // A value, holding `held` -- or, given a rule, what its rule makes of what it follows.
    value: (name: string, kind: ValueKind, held: Held, rule?: Rule) => {
      const id = crypto.randomUUID()
      values.push({ id, name, kind, value: rule ? applyRule(rule, byId(rule.from).value) : held, ...(rule ? { rule } : {}) })
      return id
    },
    // A trace's setting linked to a value (lib/templateValues): one setting, holding it now.
    link: (traceId: string, key: LinkableKey, valueId: string) => {
      const trace = traces.find(tr => tr.id === traceId)!
      const value = byId(valueId)
      trace.valueLinks = { ...trace.valueLinks, [key]: valueId }
      ;(trace as unknown as Record<string, unknown>)[key] = key === 'content' ? format(value.kind, value.value) : value.value
      return traceId
    },
    frame: (title: string, x: number, y: number, width: number, height: number, arranged = false) =>
      add(x, y, width, height, { type: 'frame', content: title, showBorder: true, showBackground: false, ...(arranged ? { frameArrange: 'masonry' as const, frameHeight: height } : {}) }),
    // Where a picture or a group dropped (with Ctrl) takes its place and size (lib/frames). Named, untitled.
    slot: (name: string, x: number, y: number, width: number, height: number, fit: SlotFit = 'fill') =>
      add(x, y, width, height, { type: 'frame', content: name, frameArrange: fit, strokeStyle: 'dashed', showBorder: true, showBackground: false }),
    // Words in a box.
    box: (text: string, x: number, y: number, width: number, height: number, frameId?: string, rest: Partial<Trace> = {}) =>
      add(x, y, width, height, { type: 'text', content: text, showBorder: true, showBackground: true, fontSize: 18, textFit: false, textScaleWithBox: false, textAlign: 'center', textValign: 'middle', frameId, ...rest }),
    // Words alone.
    words: (text: string, x: number, y: number, width: number, height: number, frameId?: string, rest: Partial<Trace> = {}) =>
      add(x, y, width, height, { type: 'text', content: text, showBorder: false, showBackground: false, textColor: c.ink, fontSize: 16, textFit: false, textScaleWithBox: false, textAlign: 'center', frameId, ...rest }),
    swatch: (colour: string, x: number, y: number, size: number, frameId?: string, rest: Partial<Trace> = {}) =>
      add(x, y, size, size, { type: 'shape', shapeType: 'rectangle', content: colour, shapeColor: colour, shapeOpacity: 1, shapeNoFill: false, showBorder: false, showBackground: false, cornerRadius: 8, frameId, ...rest }),
    thread: (from: string, to: string, arrow: 'none' | 'forward' = 'none') => { links.push([from, to, arrow]) },
  }
}
type Builder = ReturnType<typeof builder>

const PALETTE = ['#f2e2b3', '#b9ae9a', '#5d6b4a', '#c8ccc8', '#2a2a26']

const item = (id: string, name: string, make: (b: Builder, t: TemplateContext['t'], c: TemplateContext) => void): TemplateItem => ({
  kind: 'template', id, name,
  build: c => board(c, c.t(name), b => make(b, c.t, c)),
})

// A diagram's look as values: its boxes' colour, their words' colour readable
// on it whatever it's made, and one font -- each box given them.
function diagramLook(b: Builder, t: TemplateContext['t'], c: TemplateContext) {
  const fill = b.value(t('templates.text.boxColour'), 'colour', c.colours.fill)
  const text = b.value(t('templates.text.textColour'), 'colour', readableOn(c.colours.fill), { from: fill, op: 'readable' })
  const font = b.value(t('templates.kind.font'), 'font', 'sans')
  return (box: string) => {
    b.link(box, 'fillColor', fill)
    b.link(box, 'textColor', text)
    b.link(box, 'fontFamily', font)
    return box
  }
}

// Columns that arrange what's put in them, so a card moved between them falls into place.
function columns(b: Builder, titles: string[], card: string | null, width = 330, height = 560, gap = 30) {
  titles.forEach((title, i) => {
    const x = (i - (titles.length - 1) / 2) * (width + gap)
    const column = b.frame(title, x, 0, width, height, true)
    if (card) b.box(card, x, -height / 2 + 90, width - 50, 120, column)
  })
}

// The days of the week, Monday first, in the person's language.
function weekdays(language = 'en'): string[] {
  let format: Intl.DateTimeFormat
  try { format = new Intl.DateTimeFormat(language, { weekday: 'long', timeZone: 'UTC' }) } catch { format = new Intl.DateTimeFormat('en', { weekday: 'long', timeZone: 'UTC' }) }
  return Array.from({ length: 7 }, (_, i) => {
    const day = format.format(new Date(Date.UTC(2024, 0, 1 + i)))
    return day.charAt(0).toLocaleUpperCase(language) + day.slice(1)
  })
}

const left = { textAlign: 'left' as const }

export const DIGITAL_ATRIUM_FOLDER: TemplateFolder = {
  kind: 'folder',
  id: 'digital-atrium',
  name: 'Digital Atrium',
  items: [
    {
      kind: 'folder', id: 'boards', name: 'templates.folder.boards',
      items: [
        item('moodboard', 'templates.moodboard', (b, t) => {
          b.frame(t('templates.moodboard'), 0, 0, 1000, 640, true)
        }),
        item('task-board', 'templates.taskBoard', (b, t) => {
          columns(b, [t('templates.text.todo'), t('templates.text.doing'), t('templates.text.done')], t('templates.text.task'))
        }),
        // Each shot a slot: a picture dropped on it with Ctrl fills it.
        item('storyboard', 'templates.storyboard', (b, t) => {
          for (let i = 0; i < 6; i++) {
            const x = (i % 3 - 1) * 460, y = i < 3 ? -200 : 200
            const shot = t('templates.text.shot', { n: i + 1 })
            b.words(shot, x, y - 150, 430, 30, undefined, left)
            b.slot(shot, x, y - 10, 430, 240)
            b.words(t('templates.text.whatHappens'), x, y + 135, 430, 36, undefined, left)
          }
        }),
        // Fitted whole, so the two compare as they are.
        item('before-after', 'templates.beforeAfter', (b, t) => {
          ;[t('templates.text.before'), t('templates.text.after')].forEach((title, i) => {
            const x = i === 0 ? -270 : 270
            b.words(title, x, -225, 510, 32, undefined, left)
            b.slot(title, x, 0, 510, 400, 'fit')
          })
        }),
        item('retrospective', 'templates.retro', (b, t) => {
          columns(b, [t('templates.text.wentWell'), t('templates.text.toImprove'), t('templates.text.actions')], t('templates.text.thought'))
        }),
        item('weekly-planner', 'templates.weekPlanner', (b, _t, c) => {
          weekdays(c.language).forEach((day, i) => {
            const x = (i - 3) * 216
            b.frame(day, x, 0, 200, 440, true)
          })
        }),
      ],
    },
    {
      kind: 'folder', id: 'diagrams', name: 'templates.folder.diagrams',
      items: [
        item('mind-map', 'templates.mindMap', (b, t, c) => {
          const look = diagramLook(b, t, c)
          const centre = look(b.box(t('templates.text.idea'), 0, 0, 240, 110))
          const places = [[-400, -170], [400, -170], [-400, 170], [400, 170]]
          places.forEach(([x, y], i) => b.thread(centre, look(b.box(t('templates.text.branch', { n: i + 1 }), x, y, 200, 90))))
        }),
        item('flowchart', 'templates.flowchart', (b, t, c) => {
          const look = diagramLook(b, t, c)
          const words = [t('templates.text.start'), t('templates.text.step', { n: 1 }), t('templates.text.step', { n: 2 }), t('templates.text.end')]
          const steps = words.map((text, i) => look(b.box(text, (i - 1.5) * 300, 0, 210, 100)))
          steps.slice(1).forEach((step, i) => b.thread(steps[i], step, 'forward'))
        }),
        item('swot', 'templates.swot', (b, t) => {
          const titles = [t('templates.text.strengths'), t('templates.text.weaknesses'), t('templates.text.opportunities'), t('templates.text.threats')]
          titles.forEach((title, i) => b.frame(title, (i % 2 ? 1 : -1) * 240, (i < 2 ? -1 : 1) * 180, 450, 330, true))
        }),
        item('timeline', 'templates.timeline', (b, t, c) => {
          const look = diagramLook(b, t, c)
          const events = Array.from({ length: 5 }, (_, i) => {
            const x = (i - 2) * 260
            b.words(t('templates.text.when'), x, -80, 200, 30)
            return look(b.box(t('templates.text.event', { n: i + 1 }), x, 0, 200, 90))
          })
          events.slice(1).forEach((event, i) => b.thread(events[i], event, 'forward'))
        }),
      ],
    },
    {
      kind: 'folder', id: 'studies', name: 'templates.folder.studies',
      items: [
        // A name shown twice, the small one in capitals by a rule; three views fitted whole.
        item('reference-sheet', 'templates.referenceSheet', (b, t) => {
          const name = b.value(t('templates.text.name'), 'text', t('templates.text.name'))
          const caps = b.value(t('templates.text.nameCaps'), 'text', '', { from: name, op: 'capitals' })
          b.link(b.words('', 0, -300, 900, 26, undefined, { ...left, fontSize: 13 }), 'content', caps)
          b.link(b.words('', 0, -258, 900, 48, undefined, { ...left, fontSize: 32, textBold: true }), 'content', name)
          ;[t('templates.text.front'), t('templates.text.side'), t('templates.text.back')].forEach((view, i) => {
            const x = (i - 1) * 300
            b.slot(view, x, -10, 280, 380, 'fit')
            b.words(view, x, 200, 280, 28)
          })
          b.box(t('templates.text.notes'), 0, 320, 880, 140, undefined, { ...left, textValign: 'top', fontSize: 16 })
        }),
        item('study-grid', 'templates.studyGrid', (b, t) => {
          b.words(t('templates.folder.studies'), 0, -360, 632, 36, undefined, { ...left, fontSize: 22 })
          for (let i = 0; i < 9; i++) b.slot(t('templates.text.shot', { n: i + 1 }), (i % 3 - 1) * 216, (Math.floor(i / 3) - 1) * 216, 200, 200)
        }),
        // One colour and the tints and shades its rules make of it: change it, they follow.
        item('colour-study', 'templates.colourStudy', (b, t) => {
          const base = b.value(t('templates.text.base'), 'colour', '#4a6fa5')
          const ruled = (name: string, op: 'lighter' | 'darker', amount: number) => b.value(name, 'colour', '', { from: base, op, amount })
          const row = [
            ruled(t('templates.text.shade', { n: 2 }), 'darker', 60), ruled(t('templates.text.shade', { n: 1 }), 'darker', 30),
            base,
            ruled(t('templates.text.tint', { n: 1 }), 'lighter', 30), ruled(t('templates.text.tint', { n: 2 }), 'lighter', 60),
          ]
          b.words(t('templates.colourStudy'), 0, -150, 780, 36, undefined, { ...left, fontSize: 22 })
          row.forEach((value, i) => {
            const x = (i - 2) * 160
            const name = b.values.find(v => v.id === value)!.name
            b.words(name, x, -95, 140, 26, undefined, { fontSize: 13 })
            b.link(b.swatch('', x, 0, 140), 'shapeColor', value)
            b.link(b.words('', x, 90, 140, 28, undefined, { fontSize: 14 }), 'content', value)
          })
        }),
        // One typeface for all of it, and sizes kept in proportion by rules.
        item('type-specimen', 'templates.typeSpecimen', (b, t) => {
          const face = b.value(t('templates.text.typeface'), 'font', 'serif')
          const body = b.value(t('templates.text.bodySize'), 'number', 18)
          const heading = b.value(t('templates.text.headingSize'), 'number', 0, { from: body, op: 'times', amount: 2.5 })
          const caption = b.value(t('templates.text.captionSize'), 'number', 0, { from: body, op: 'times', amount: 0.75 })
          const label = b.words('', 0, -170, 900, 30, undefined, left)
          b.link(label, 'content', face)
          b.link(label, 'fontSize', caption)
          const lines: [string, number, number, string][] = [
            [t('templates.text.pangram'), -90, 130, heading], [t('templates.text.bodyText'), 50, 110, body], [t('templates.text.caption'), 140, 34, caption],
          ]
          for (const [text, y, height, size] of lines) {
            const line = b.words(text, 0, y, 900, height, undefined, left)
            b.link(line, 'fontFamily', face)
            b.link(line, 'fontSize', size)
          }
        }),
      ],
    },
    {
      kind: 'folder', id: 'pieces', name: 'templates.folder.pieces',
      items: [
        item('note', 'templates.note', (b, t) => { b.box(t('templates.text.note'), 0, 0, 260, 200) }),
        // Each swatch and its hex code are one colour: change either, both follow.
        item('palette', 'templates.palette', (b, t) => {
          const frame = b.frame(t('templates.palette'), 0, 0, 760, 240)
          PALETTE.forEach((colour, i) => {
            const x = (i - 2) * 140
            const value = b.value(`${t('templates.kind.colour')} ${i + 1}`, 'colour', colour)
            b.link(b.swatch(colour, x, -15, 120, frame), 'shapeColor', value)
            b.link(b.words(colour.toUpperCase(), x, 75, 130, 32, frame), 'content', value)
          })
        }),
        // A card with a picture's place and a caption that reads on whatever colour the card is made.
        item('photo-card', 'templates.photoCard', (b, t) => {
          const card = b.value(t('templates.text.cardColour'), 'colour', '#f4f1ea')
          const ink = b.value(t('templates.text.captionColour'), 'colour', '', { from: card, op: 'readable' })
          b.link(b.swatch('', 0, 0, 300, undefined, { height: 370, cornerRadius: 4 }), 'shapeColor', card)
          // Its edge and hint in the caption's colour: readable on the card, whatever colour it's made.
          b.link(b.slot(t('templates.photoCard'), 0, -35, 260, 260), 'borderColor', ink)
          b.link(b.words(t('templates.text.memory'), 0, 140, 260, 40, undefined, { fontSize: 18 }), 'textColor', ink)
        }),
        item('book-card', 'templates.bookCard', (b, t) => {
          b.slot(t('templates.bookCard'), -150, 0, 180, 270, 'fit')
          b.words(t('templates.text.title'), 110, -105, 300, 44, undefined, { ...left, fontSize: 26, textBold: true })
          b.words(t('templates.text.creator'), 110, -60, 300, 30, undefined, left)
          b.words('★★★☆☆', 110, -22, 300, 30, undefined, { ...left, fontSize: 20 })
          b.box(t('templates.text.notes'), 110, 75, 300, 120, undefined, { ...left, textValign: 'top', fontSize: 15 })
        }),
      ],
    },
  ],
}

export const allTemplates = (folder: TemplateFolder): TemplateItem[] =>
  folder.items.flatMap(node => (node.kind === 'folder' ? allTemplates(node) : [node]))

export const folderIds = (folder: TemplateFolder): string[] =>
  [folder.id, ...folder.items.flatMap(node => (node.kind === 'folder' ? folderIds(node) : []))]
