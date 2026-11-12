// Lines that boil, as a hand-drawn film's do: each trace whose look has a wiggle
// (lib/traceLook) is drawn through an SVG filter (components/WiggleFilter) --
// noise pushing its pixels about -- and the noise's seed is stepped a few times
// a second, round four seeds, so the push changes and comes back: a drawing's
// strokes, a picture's edges, whether it's strokes or one picture.
//
// Cheap as it can be: one clock for all of them, writing an attribute (never a
// render); only a trace on screen, only while the tab is seen, and never for
// someone who's asked for less motion, who sees it still, pushed once.

const SEEDS = 4
const TICK_MS = 1000 / 24

interface Boiling { noise: SVGFETurbulenceElement; every: number; last: number; seed: number; seen: boolean }
const boiling = new Set<Boiling>()
let clock: number | undefined
const still = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

function tick() {
  if (document.hidden) return
  const now = performance.now()
  for (const one of boiling) {
    if (!one.seen || now - one.last < one.every) continue
    one.last = now
    one.seed = (one.seed % SEEDS) + 1
    one.noise.setAttribute('seed', String(one.seed))
  }
}

/** `noise`, the filter's turbulence, stepped `speed` times a second while `host` is on screen. */
export function boil(noise: SVGFETurbulenceElement, host: Element, speed: number): () => void {
  if (still()) return () => {}
  const one: Boiling = { noise, every: 1000 / Math.max(1, speed), last: 0, seed: 1, seen: false }
  const watch = new IntersectionObserver(entries => { for (const entry of entries) one.seen = entry.isIntersecting })
  watch.observe(host)
  boiling.add(one)
  clock ??= window.setInterval(tick, TICK_MS)
  return () => {
    watch.disconnect()
    boiling.delete(one)
    if (boiling.size === 0 && clock !== undefined) { window.clearInterval(clock); clock = undefined }
  }
}
