// The landing page's hall, behind the pages one comes back to: the atrium's grid,
// traces hanging in it, the light from above and its dust. All of it moves by the
// compositor: nothing here renders twice.

import { useEffect, useRef, type CSSProperties, type RefObject } from 'react'
import Atmosphere from './Atmosphere'

/** The pointer, published on `ref`'s element as --px and --py (-1 to 1) for the
 *  layers in it to follow, each at its own depth: no state, so no render, and
 *  written once a frame however many events arrive. */
export function usePointerDepth(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let frame = 0
    const move = (e: MouseEvent) => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        el.style.setProperty('--px', ((e.clientX / window.innerWidth) * 2 - 1).toFixed(4))
        el.style.setProperty('--py', ((e.clientY / window.innerHeight) * 2 - 1).toFixed(4))
      })
    }
    window.addEventListener('mousemove', move, { passive: true })
    return () => {
      window.removeEventListener('mousemove', move)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [ref])
}

// Where each hangs, as [left %, top %, width, height, turn, depth], mostly toward
// the edges, what's in front of them being in the middle. The nearer ones are the
// larger, and follow the pointer further. `lines`: a note's; `marks`: the selected.
type Hung = { at: [number, number, number, number, number, number]; lines?: number; marks?: boolean }
const HUNG: Hung[] = [
  { at: [27, 1, 120, 72, -3, 26], marks: true },
  { at: [14, 58, 74, 46, 4, 12] },
  { at: [1, 74, 190, 118, 2, 34], lines: 3 },
  { at: [24, 86, 96, 58, -5, 16] },
  { at: [38, 6, 62, 38, 6, 10] },
  { at: [46, 92, 132, 70, -2, 22], marks: true },
  { at: [58, 4, 112, 66, -4, 18], lines: 2 },
  { at: [70, 80, 84, 52, 5, 14] },
  { at: [76, 10, 58, 36, 3, 9] },
  { at: [86, 22, 168, 104, 3, 30], marks: true },
  { at: [90, 58, 96, 132, -3, 24], lines: 4 },
  { at: [82, 90, 150, 84, -2, 28] },
]

// Out of frame, till the room pans.
const FURTHER: Hung[] = [
  { at: [108, 18, 140, 88, 4, 34], lines: 3 },
  { at: [118, 62, 110, 70, -3, 30] },
  { at: [104, 84, 170, 96, 2, 38], lines: 2 },
]

export default function Hall({ pan }: {
  // Home's: looking across to Atriums, the room moved past, with more of it in sight.
  pan?: boolean
}) {
  const root = useRef<HTMLDivElement>(null)
  usePointerDepth(root)
  return (
    <div ref={root} aria-hidden="true" className="fixed inset-0 pointer-events-none overflow-hidden" style={{ '--pan': pan ? 1 : 0 } as CSSProperties}>
      <div className="hall-grid" />
      {(pan === undefined ? HUNG : [...HUNG, ...FURTHER]).map(({ at: [left, top, width, height, turn, depth], lines, marks }, i) => (
        <div key={i} className="hall-depth enter-fade" style={{ left: `${left}%`, top: `${top}%`, '--depth': `${depth}px`, '--i': i * 0.6 } as CSSProperties}>
          <div
            className="hall-trace"
            style={{ width, height, '--turn': `${turn}deg`, '--drift-x': `${(i % 2 ? -1 : 1) * (6 + i % 5)}px`, '--drift-y': `${-10 - (i * 3) % 12}px`, animationDuration: `${11 + (i * 5) % 9}s`, animationDelay: `${-(i * 2.7) % 11}s` } as CSSProperties}
          >
            {marks && <><span className="hall-mark -top-px -left-px border-l border-t" /><span className="hall-mark -bottom-px -right-px border-r border-b" /></>}
            {lines && [...Array(lines)].map((_, line) => <span key={line} className="hall-line" style={{ width: `${82 - ((line * 23) % 40)}%` }} />)}
          </div>
        </div>
      ))}
      <Atmosphere />
    </div>
  )
}
