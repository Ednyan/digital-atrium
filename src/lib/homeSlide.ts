// Home and Atriums are two walls of one room (components/HomeScreen): moving between
// them the camera pans, the top bar stays, and each atrium's picture flies from where
// it was to where it's going, so it's plainly the same thing. Only transform and
// opacity, on walls at rest in the same box: both can be measured as they stand, and
// nothing is left transformed afterwards, for what's fixed inside a wall.

const TIME = 760
// With pictures to fly, a moment's lift first, nothing moving: each flight fades
// in over its own picture, so what's written on it goes under, not out at once.
const LIFT = 90
const EASE = 'cubic-bezier(.22, 1, .36, 1)'

// Each picture flies from one wall to its place on the other: the ones it covers
// are hidden while it's over them, and it hands over in the frame it lands, the
// same picture at the same place -- never two of it, fading, a little apart. The
// one it lands on is hidden by where it is, not as an element: one's lists arriving
// mid-flight can make it anew, or move it, and the flight follows it there. What's
// written over it comes after. The pictures landed on, back.
type Box = { left: number; top: number; width: number; height: number }
// Where a picture is: inside its holder's border, as it fills it.
const inside = (holder: HTMLElement): Box => {
  const r = holder.getBoundingClientRect()
  return { left: r.left + holder.clientLeft, top: r.top + holder.clientTop, width: holder.clientWidth, height: holder.clientHeight }
}
function flights(room: HTMLElement, from: HTMLElement, to: HTMLElement): HTMLElement[] {
  const landing: HTMLElement[] = []
  const box = room.getBoundingClientRect(), wall = from.getBoundingClientRect(), rest = to.getBoundingClientRect()
  const inSight = (r: Box) => r.top + r.height > wall.top && r.top < wall.bottom
  const at = (r: Box) => ({ left: `${r.left - box.left}px`, top: `${r.top - box.top}px`, width: `${r.width}px`, height: `${r.height}px` })
  from.querySelectorAll<HTMLElement>('[data-fly]').forEach(source => {
    const where = `[data-fly="${CSS.escape(source.dataset.fly!)}"]`
    const target = to.querySelector<HTMLElement>(where)
    const left = source.querySelector('img'), arrived = target?.querySelector('img')
    if (!target || !left?.getAttribute('src')) return
    const a = inside(source)
    let b = inside(target)
    if (!inSight(a) || !inSight(b)) return
    landing.push(target)
    const flight = document.createElement('div')
    flight.className = 'home-flight'
    const picture = document.createElement('img')
    picture.src = left.getAttribute('src')!
    picture.alt = ''
    flight.append(picture)
    room.append(flight)
    const veil = document.createElement('style')
    veil.textContent = `[data-landing] ${where} > img { opacity: 0 !important; }`
    document.head.append(veil)
    const lifted = LIFT / (LIFT + TIME)
    const held = [
      left.animate([{ opacity: 1 }, { opacity: 1, offset: lifted }, { opacity: 0, offset: lifted }, { opacity: 0 }], { duration: LIFT + TIME, fill: 'both' }),
      ...[...source.children].filter(part => part !== left).map(part => part.animate([{ opacity: 1 }, { opacity: 0 }], { duration: LIFT, fill: 'forwards' })),
    ]
    const done = () => { held.forEach(one => one.cancel()); veil.remove(); flight.remove() }
    flight.animate([{ opacity: 0 }, { opacity: 1 }], { duration: LIFT, fill: 'both' })
    const motion = flight.animate([at(a), at(b)], { duration: TIME, delay: LIFT, easing: EASE, fill: 'both' })
    motion.finished.then(done, done)
    // Where it's landing, as it would be at rest: as it is, less the wall's slide.
    const follow = () => {
      if (!flight.isConnected) return
      const holder = to.querySelector<HTMLElement>(where), slid = to.getBoundingClientRect()
      const now = holder && inside(holder)
      if (now) {
        const there = { left: now.left - (slid.left - rest.left), top: now.top - (slid.top - rest.top), width: now.width, height: now.height }
        if ((['left', 'top', 'width', 'height'] as const).some(side => Math.abs(there[side] - b[side]) > 0.5)) {
          b = there
          ;(motion.effect as KeyframeEffect).setKeyframes([at(a), at(b)])
        }
      }
      requestAnimationFrame(follow)
    }
    requestAnimationFrame(follow)
    for (const part of target.children) {
      if (part !== arrived) part.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, delay: LIFT + TIME, easing: 'ease-out', fill: 'backwards' })
    }
  })
  return landing
}

/** From one wall to the other; `direction` 1 to the right. Nothing, for anyone who
 *  asked for less motion: the walls just swap. */
export function slideBetween(room: HTMLElement, from: HTMLElement, to: HTMLElement, direction: 1 | -1) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  for (const wall of [from, to]) wall.getAnimations().forEach(running => running.cancel())
  const width = from.offsetWidth
  from.removeAttribute('data-landing')
  to.setAttribute('data-landing', '')
  const landing = flights(room, from, to)
  const lift = landing.length ? LIFT : 0
  // Hidden once it's left: till then, in sight despite its being the wall away.
  from.style.visibility = 'visible'
  const gone = () => { if (!from.getAnimations().length) from.style.visibility = '' }
  from.animate(
    [{ transform: 'none', opacity: 1 }, { transform: `translateX(${-direction * width}px)`, opacity: 0.15 }],
    { duration: TIME, delay: lift, easing: EASE },
  ).finished.then(gone, gone)
  to.animate(
    [{ transform: `translateX(${direction * width}px)`, opacity: 0.15 }, { transform: 'none', opacity: 1 }],
    { duration: TIME, delay: lift, easing: EASE, fill: 'backwards' },
  )
  // What's on the wall arrives a moment after, one by one: as far as anyone can see.
  // What a picture lands in only fades in, done as it lands: it's still by then.
  to.querySelectorAll('[data-rise], .morph-card').forEach((part, i) => {
    if (i > 16) return
    if (landing.some(target => part.contains(target))) {
      part.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, delay: lift + TIME - 420, easing: EASE, fill: 'backwards' })
      return
    }
    part.animate(
      [{ opacity: 0, transform: `translateX(${direction * 36}px)` }, { opacity: 1, transform: 'none' }],
      { duration: 520, delay: lift + 160 + i * 42, easing: EASE, fill: 'backwards' },
    )
  })
}
