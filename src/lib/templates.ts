// Templates (docs/IDEAS.md): traces ready to be dragged onto the canvas, kept in
// folders. A template is what an .atrium file holds, placed by the same import
// (lib/atriumFile importIntoAtrium): one undo step, new ids, at the drop.
//
// The Digital Atrium folder is made here rather than kept in files: its words
// come in the person's language, its colours from the atrium's, and it costs
// nothing to fetch. People's own templates, a paid feature, are still to come
// with the plans (docs/PLANS.md).

import type { AtriumFile } from './atriumFormat.ts'
import { traceRow } from './traceInsert.ts'
import type { Trace } from '../types/database'

export interface TemplateContext {
  userId: string
  username: string
  // The atrium's own, so a template looks at home wherever it's dropped.
  colours: { border: string; fill: string; text: string }
  // Text straight on the atrium's background.
  ink: string
  // How wide the view is, for what's laid out to it (the guide).
  viewWidth?: number
  t: (key: any, vars?: Record<string, string | number>) => string
}

export interface TemplateItem { kind: 'template'; id: string; name: string; build: (c: TemplateContext) => AtriumFile }
export interface TemplateFolder { kind: 'folder'; id: string; name: string; items: TemplateNode[] }
export type TemplateNode = TemplateItem | TemplateFolder

// Traces and threads, in the order they stack: the first at the bottom.
function board(c: TemplateContext, name: string, make: (b: ReturnType<typeof builder>) => void): AtriumFile {
  const b = builder(c)
  make(b)
  return {
    version: 3,
    layerOrder: 'flat',
    exportedAt: new Date().toISOString(),
    app: 'Digital Atrium',
    lobby: { name, theme_settings: null, is_public: false, max_players: 0 },
    layers: [],
    locations: [],
    traces: b.traces.map((trace, i) => ({ ...traceRow(trace), z_index: i })),
    links: b.links.map(([from, to, arrow]) => ({ from_trace: from, to_trace: to, arrow })),
  } as unknown as AtriumFile
}

function builder(c: TemplateContext) {
  const traces: Trace[] = []
  const links: [string, string, 'none' | 'forward'][] = []
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
  return {
    traces, links,
    frame: (title: string, x: number, y: number, width: number, height: number, arranged = false) =>
      add(x, y, width, height, { type: 'frame', content: title, showBorder: true, showBackground: false, ...(arranged ? { frameArrange: 'masonry' as const } : {}) }),
    // Words in a box.
    box: (text: string, x: number, y: number, width: number, height: number, frameId?: string) =>
      add(x, y, width, height, { type: 'text', content: text, showBorder: true, showBackground: true, fontSize: 18, textFit: false, textScaleWithBox: false, textAlign: 'center', textValign: 'middle', frameId }),
    // Words alone.
    words: (text: string, x: number, y: number, width: number, height: number, frameId?: string) =>
      add(x, y, width, height, { type: 'text', content: text, showBorder: false, showBackground: false, textColor: c.ink, fontSize: 16, textFit: false, textScaleWithBox: false, textAlign: 'center', frameId }),
    swatch: (colour: string, x: number, y: number, size: number, frameId: string) =>
      add(x, y, size, size, { type: 'shape', shapeType: 'rectangle', content: colour, shapeColor: colour, shapeOpacity: 1, shapeNoFill: false, showBorder: false, showBackground: false, cornerRadius: 8, frameId }),
    thread: (from: string, to: string, arrow: 'none' | 'forward' = 'none') => { links.push([from, to, arrow]) },
  }
}

const PALETTE = ['#f2e2b3', '#b9ae9a', '#5d6b4a', '#c8ccc8', '#2a2a26']

const item = (id: string, name: string, make: (b: ReturnType<typeof builder>, t: TemplateContext['t']) => void): TemplateItem => ({
  kind: 'template', id, name,
  build: c => board(c, c.t(name), b => make(b, c.t)),
})

// The guide (lib/guide), a line of real traces to learn on: walking along it is
// the first lesson, so the second card peeks in at the screen's edge, and the
// threads lead the way. Pieces left unjoined are the last lesson's to join.
export function guideFile(c: TemplateContext): AtriumFile {
  const wide = c.viewWidth ?? 1280
  const card = Math.min(340, Math.max(240, wide - 120))
  const peek = Math.min(130, wide * 0.15)
  return board(c, c.t('templates.guide'), b => {
    const walk = b.box(c.t('templates.guide.walk'), 0, 0, card, 210)
    let x = Math.max(card + 24, wide / 2 - peek + card / 2)
    const move = b.box(c.t('templates.guide.move'), x, 0, card, 210)
    x += card + 120
    const write = b.box(c.t('templates.guide.write'), x, 0, card, 210)
    x += card / 2 + 210
    const noteX = x
    x += 130 + 190
    b.words(c.t('templates.guide.frames'), (noteX + x) / 2, -215, 620, 70)
    const frame = b.frame(c.t('templates.guide.frame'), x, 0, 380, 300)
    const note = b.box(c.t('templates.guide.note'), noteX, 0, 180, 110)
    x += 190 + 220
    const from = b.box(c.t('templates.guide.from'), x, 0, 200, 110)
    const toX = x + 400
    b.words(c.t('templates.guide.connect'), x + 200, -215, 620, 70)
    const to = b.box(c.t('templates.guide.to'), toX, 0, 200, 110)
    const end = b.box(c.t('templates.guide.end'), toX + 100 + 120 + card / 2, 0, card, 210)
    b.thread(walk, move, 'forward')
    b.thread(move, write, 'forward')
    b.thread(write, note, 'forward')
    b.thread(frame, from, 'forward')
    b.thread(to, end, 'forward')
  })
}

// How far a guide's first card is from the middle of it all: where to put that
// middle, for the first card to be where the person is.
export function guideMiddle(file: AtriumFile) {
  const rows = file.traces as any[]
  const left = Math.min(...rows.map(r => r.position_x - r.width / 2)), right = Math.max(...rows.map(r => r.position_x + r.width / 2))
  const top = Math.min(...rows.map(r => r.position_y - r.height / 2)), bottom = Math.max(...rows.map(r => r.position_y + r.height / 2))
  return { x: (left + right) / 2, y: (top + bottom) / 2 }
}

export const DIGITAL_ATRIUM_FOLDER: TemplateFolder = {
  kind: 'folder',
  id: 'digital-atrium',
  name: 'Digital Atrium',
  items: [
    { kind: 'template', id: 'guide', name: 'templates.guide', build: guideFile },
    {
      kind: 'folder', id: 'boards', name: 'templates.folder.boards',
      items: [
        item('moodboard', 'templates.moodboard', (b, t) => {
          b.frame(t('templates.moodboard'), 0, 0, 1000, 640, true)
        }),
        item('task-board', 'templates.taskBoard', (b, t) => {
          ;(['templates.text.todo', 'templates.text.doing', 'templates.text.done'] as const).forEach((title, i) => {
            const x = (i - 1) * 360
            const column = b.frame(t(title), x, 0, 330, 560)
            b.box(t('templates.text.task'), x, -190, 280, 120, column)
          })
        }),
        item('storyboard', 'templates.storyboard', (b, t) => {
          for (let i = 0; i < 6; i++) {
            const x = (i % 3 - 1) * 460, y = i < 3 ? -190 : 190
            const shot = b.frame(t('templates.text.shot', { n: i + 1 }), x, y, 430, 300)
            b.words(t('templates.text.whatHappens'), x, y + 115, 390, 40, shot)
          }
        }),
        item('before-after', 'templates.beforeAfter', (b, t) => {
          b.frame(t('templates.text.before'), -270, 0, 510, 400)
          b.frame(t('templates.text.after'), 270, 0, 510, 400)
        }),
      ],
    },
    {
      kind: 'folder', id: 'diagrams', name: 'templates.folder.diagrams',
      items: [
        item('mind-map', 'templates.mindMap', (b, t) => {
          const centre = b.box(t('templates.text.idea'), 0, 0, 240, 110)
          const places = [[-400, -170], [400, -170], [-400, 170], [400, 170]]
          places.forEach(([x, y], i) => b.thread(centre, b.box(t('templates.text.branch', { n: i + 1 }), x, y, 200, 90)))
        }),
        item('flowchart', 'templates.flowchart', (b, t) => {
          const words = [t('templates.text.start'), t('templates.text.step', { n: 1 }), t('templates.text.step', { n: 2 }), t('templates.text.end')]
          const steps = words.map((text, i) => b.box(text, (i - 1.5) * 300, 0, 210, 100))
          steps.slice(1).forEach((step, i) => b.thread(steps[i], step, 'forward'))
        }),
      ],
    },
    {
      kind: 'folder', id: 'pieces', name: 'templates.folder.pieces',
      items: [
        item('note', 'templates.note', (b, t) => { b.box(t('templates.text.note'), 0, 0, 260, 200) }),
        item('palette', 'templates.palette', (b, t) => {
          const frame = b.frame(t('templates.palette'), 0, 0, 760, 240)
          PALETTE.forEach((colour, i) => {
            const x = (i - 2) * 140
            b.swatch(colour, x, -15, 120, frame)
            b.words(colour.toUpperCase(), x, 75, 130, 32, frame)
          })
        }),
      ],
    },
  ],
}

export const allTemplates = (folder: TemplateFolder): TemplateItem[] =>
  folder.items.flatMap(node => (node.kind === 'folder' ? allTemplates(node) : [node]))
