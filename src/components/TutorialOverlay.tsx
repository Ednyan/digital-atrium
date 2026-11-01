// The tutorial: a few pop-ups pointing at the interface, then the tools, used for
// real. A step with something to do moves on by itself once it's done, so nobody
// has to find a Next button with their hands full. Nothing here takes the pointer
// but the card: the canvas and the tools under it are the ones being learned.
//
// What it's watching is read a few times a second rather than subscribed to: it
// only runs in the tutorial, and one timer is simpler than each step's own events.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from '../lib/i18n'
import { isDrawingTrace } from '../lib/brushes'
import { useGameStore } from '../store/gameStore'
import type { Trace } from '../types/database'
import type { TranslationKey } from '../locales/en'

const DONE_MS = 450
const CARD_WIDTH = 300
const GAP = 14

const isPath = (trace: Trace) => trace.type === 'shape' && trace.shapeType === 'path'
const typing = () => {
  const now = document.activeElement as HTMLElement | null
  return !!now && (now.tagName === 'TEXTAREA' || now.tagName === 'INPUT' || now.isContentEditable)
}

interface View { x: number; y: number; zoom: number }
interface Step {
  id: 'welcome' | 'move' | 'bar' | 'view' | 'menu' | 'text' | 'shape' | 'draw' | 'path' | 'connect' | 'finish'
  // What it points at: the first of these on the screen.
  target?: string[]
  // A pop-up about the interface: the rest is dimmed while it's read.
  dim?: boolean
  // Those made since the step began, for the steps that count what's on the canvas.
  count?: (traces: Trace[]) => Trace[]
  // Done, by anything other than `count` finding one.
  done?: (made: Trace[]) => boolean
}

const STEPS: Step[] = [
  { id: 'welcome', dim: true },
  { id: 'move' },
  { id: 'bar', target: ['[data-quick-bar]'], dim: true },
  { id: 'view', target: ['[data-view-bar]', '[data-atrium-menu]'], dim: true },
  { id: 'menu', target: ['[data-atrium-menu]'], dim: true },
  { id: 'text', target: ['[data-quick="text"]', '[data-quick="more"]'], count: ts => ts.filter(t => t.type === 'text' && !!t.content?.trim()), done: made => made.length > 0 && !typing() },
  { id: 'shape', target: ['[data-quick="shape"]', '[data-quick="more"]'], count: ts => ts.filter(t => t.type === 'shape' && !isPath(t)) },
  { id: 'draw', target: ['[data-quick="draw"]', '[data-quick="more"]'], count: ts => ts.filter(isDrawingTrace) },
  { id: 'path', target: ['[data-quick="path"]', '[data-quick="more"]'], count: ts => ts.filter(isPath), done: made => made.some(t => (t.shapePoints?.length ?? 0) >= 3) },
  { id: 'connect', target: ['[data-quick="connect"]', '[data-quick="more"]'] },
  { id: 'finish', dim: true },
]

const TITLE = {
  welcome: 'tutorial.welcome.title', move: 'tutorial.move.title', bar: 'tutorial.bar.title', view: 'tutorial.view.title', menu: 'tutorial.menu.title',
  text: 'tutorial.text.title', shape: 'tutorial.shape.title', draw: 'tutorial.draw.title', path: 'tutorial.path.title', connect: 'tutorial.connect.title', finish: 'tutorial.finish.title',
} as const satisfies Record<Step['id'], TranslationKey>
const BODY = {
  welcome: 'tutorial.welcome.body', move: 'tutorial.move.body', bar: 'tutorial.bar.body', view: 'tutorial.view.body', menu: 'tutorial.menu.body',
  text: 'tutorial.text.body', shape: 'tutorial.shape.body', draw: 'tutorial.draw.body', path: 'tutorial.path.body', connect: 'tutorial.connect.body', finish: 'tutorial.finish.body',
} as const satisfies Record<Step['id'], TranslationKey>

type Box = { left: number; top: number; width: number; height: number }
const boxOf = (selectors?: string[]): Box | null => {
  for (const selector of selectors ?? []) {
    const r = document.querySelector(selector)?.getBoundingClientRect()
    if (r && r.width > 0) return { left: r.left - 4, top: r.top - 4, width: r.width + 8, height: r.height + 8 }
  }
  return null
}

// Beside what it points at, on the side with room; in the middle with nothing to
// point at, or at the foot for a step that needs the canvas clear.
function cardPlace(box: Box | null, step: Step, height: number) {
  const vw = window.innerWidth, vh = window.innerHeight
  const width = Math.min(CARD_WIDTH, vw - 32)
  let left = (vw - width) / 2
  let top = step.id === 'move' ? vh - height - 96 : (vh - height) / 2
  if (box) {
    if (box.left + box.width < vw * 0.3 && box.height > box.width * 0.6) {
      left = box.left + box.width + GAP
      top = box.top + box.height / 2 - height / 2
    } else if (box.top < vh * 0.4) {
      left = box.left + box.width / 2 - width / 2
      top = box.top + box.height + GAP
    } else {
      left = box.left + box.width / 2 - width / 2
      top = box.top - height - GAP
    }
  }
  return { left: Math.max(16, Math.min(left, vw - width - 16)), top: Math.max(16, Math.min(top, vh - height - 16)), width }
}

export default function TutorialOverlay({ view, onToolDown, onStay, onExit }: {
  view: () => View | null
  // A step done: its tool put down, whatever it opened closed.
  onToolDown: () => void
  onStay: () => void
  onExit: () => void
}) {
  const { t } = useTranslation()
  const [index, setIndex] = useState(0)
  const [done, setDone] = useState(false)
  const [box, setBox] = useState<Box | null>(null)
  const [cardHeight, setCardHeight] = useState(180)
  const cardRef = useRef<HTMLDivElement>(null)
  const step = STEPS[index]

  // On to the next, past any there's nothing yet to do with: joining needs two.
  const next = () => {
    setDone(false)
    setIndex(now => {
      const after = now + 1
      const traces = useGameStore.getState().traces
      return STEPS[after]?.id === 'connect' && traces.length < 2 ? after + 1 : after
    })
  }
  const nextRef = useRef(next)
  nextRef.current = next

  useLayoutEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight)
  }, [index, done, t])

  // Where it's pointing, and whether it's been done.
  useEffect(() => {
    const started = useGameStore.getState()
    const before = new Set((step.count?.(started.traces) ?? []).map(trace => trace.id))
    const links = started.links.length
    const from = view()
    let finished = false
    const look = () => {
      const measured = boxOf(step.target)
      setBox(now => (JSON.stringify(now) === JSON.stringify(measured) ? now : measured))
      if (finished) return
      const state = useGameStore.getState()
      let reached = false
      if (step.id === 'connect') reached = state.links.length > links
      else if (step.id === 'move') {
        const here = view()
        reached = !!from && !!here && (Math.hypot(here.x - from.x, here.y - from.y) > 60 || Math.abs(here.zoom - from.zoom) > 0.05)
      } else if (step.count) {
        const made = step.count(state.traces).filter(trace => !before.has(trace.id))
        reached = step.done ? step.done(made) : made.length > 0
      }
      if (!reached) return
      finished = true
      setDone(true)
      window.setTimeout(() => {
        onToolDown()
        nextRef.current()
      }, DONE_MS)
    }
    look()
    const timer = window.setInterval(look, 120)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  const hasSomethingToDo = !!step.count || step.id === 'connect' || step.id === 'move'
  const place = cardPlace(box, step, cardHeight)
  // With nothing to point at, the light's shut to a point in the middle of the card.
  const spot: Box = box ?? { left: place.left + place.width / 2, top: place.top + cardHeight / 2, width: 0, height: 0 }

  return (
    <div data-tutorial={step.id} data-hud="true" className="fixed inset-0 z-[10000300] pointer-events-none font-mono">
      <div
        aria-hidden="true"
        data-tutorial-spot=""
        className={box ? 'tutorial-spot' : 'tutorial-spot tutorial-spot-closed'}
        style={{ ...spot, boxShadow: step.dim ? '0 0 0 100vmax rgb(0 0 0 / 0.4)' : '0 0 0 100vmax rgb(0 0 0 / 0)' }}
      />
      <div
        ref={cardRef}
        role="dialog"
        aria-label={t(TITLE[step.id])}
        data-tutorial-card=""
        className="tutorial-card pointer-events-auto absolute border p-4"
        style={{ left: place.left, top: place.top, width: place.width, background: 'rgb(var(--c-ground))', borderColor: done ? 'rgb(var(--c-emerald))' : 'rgb(var(--c-fg) / 0.35)', color: 'rgb(var(--c-fg))' }}
      >
        <div className="absolute top-0 left-0 h-[2px] transition-[width] duration-300 ease-out" style={{ width: `${((index + 1) / STEPS.length) * 100}%`, background: 'rgb(255 138 61)' }} />
        {/* Keyed, so what it says arrives rather than just changes. */}
        <div key={step.id} className="panel-in">
          <p className="text-nier-strong text-xs tracking-[0.18em] uppercase">
            {done && <span aria-hidden="true" className="mr-2" style={{ color: 'rgb(var(--c-emerald))' }}>✓</span>}
            {t(TITLE[step.id])}
          </p>
          <p className="mt-2 text-xs leading-relaxed tracking-wide opacity-85">{t(BODY[step.id])}</p>
          <div className="mt-3 flex items-center justify-end gap-3">
            {step.id === 'finish' ? (
              <>
                <button type="button" data-tutorial-exit="" onClick={onExit} className="h-8 px-3 border text-[11px] tracking-[0.12em] uppercase hover:bg-nier-bg/10 transition-colors" style={{ borderColor: 'rgb(var(--c-fg) / 0.35)' }}>{t('tutorial.exit')}</button>
                <button type="button" data-tutorial-stay="" onClick={onStay} className="h-8 px-3 bg-nier-bg text-nier-black text-[11px] tracking-[0.12em] uppercase hover:bg-nier-strong transition-colors">{t('tutorial.stay')}</button>
              </>
            ) : hasSomethingToDo ? (
              <button type="button" data-tutorial-skip="" disabled={done} onClick={() => { onToolDown(); next() }} className="text-[11px] tracking-[0.12em] uppercase opacity-60 hover:opacity-100 transition-opacity">{t('tutorial.skip')}</button>
            ) : (
              <button type="button" data-tutorial-next="" onClick={next} className="h-8 px-4 bg-nier-bg text-nier-black text-[11px] tracking-[0.12em] uppercase hover:bg-nier-strong transition-colors">{t(step.id === 'welcome' ? 'tutorial.start' : 'tutorial.next')}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
