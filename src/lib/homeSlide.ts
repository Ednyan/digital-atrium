// Home and Atriums are two walls of one room (components/HomeScreen): moving between
// them the camera pans, the top bar stays, and each atrium's picture flies from where
// it was to where it's going, so it's plainly the same thing. Only transform and
// opacity, on walls at rest in the same box: both can be measured as they stand, and
// nothing is left transformed afterwards, for what's fixed inside a wall.

const TIME = 760
const EASE = 'cubic-bezier(.22, 1, .36, 1)'

function flights(room: HTMLElement, from: HTMLElement, to: HTMLElement) {
  const box = room.getBoundingClientRect(), wall = from.getBoundingClientRect()
  const inSight = (r: DOMRect) => r.bottom > wall.top && r.top < wall.bottom
  from.querySelectorAll<HTMLElement>('[data-fly]').forEach(source => {
    const target = to.querySelector<HTMLElement>(`[data-fly="${CSS.escape(source.dataset.fly!)}"]`)
    const src = source.querySelector('img')?.getAttribute('src')
    if (!target || !src) return
    const a = source.getBoundingClientRect(), b = target.getBoundingClientRect()
    if (!inSight(a) || !inSight(b)) return
    const flight = document.createElement('div')
    flight.className = 'home-flight'
    const picture = document.createElement('img')
    picture.src = src
    picture.alt = ''
    flight.append(picture)
    room.append(flight)
    const at = (r: DOMRect) => ({ left: `${r.left - box.left}px`, top: `${r.top - box.top}px`, width: `${r.width}px`, height: `${r.height}px` })
    const done = () => flight.remove()
    flight.animate([at(a), at(b)], { duration: TIME, easing: EASE, fill: 'both' }).finished.then(done, done)
    // It flies over what's on the cards (a title, the picture's fade): faded in and
    // out, and handing over to the real pictures, so none of that pops as it passes.
    // By when it fades it's almost there: the easing has done nearly all its moving.
    const faded = { duration: TIME, fill: 'both' as const }
    flight.animate([{ opacity: 0, offset: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.5 }, { opacity: 0, offset: 1 }], faded)
    source.querySelector('img')?.animate([{ opacity: 1, offset: 0 }, { opacity: 0, offset: 0.12 }, { opacity: 0, offset: 1 }], { duration: TIME })
    target.querySelector('img')?.animate([{ opacity: 0, offset: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1, offset: 1 }], { duration: TIME })
  })
}

/** From one wall to the other; `direction` 1 to the right. Nothing, for anyone who
 *  asked for less motion: the walls just swap. */
export function slideBetween(room: HTMLElement, from: HTMLElement, to: HTMLElement, direction: 1 | -1) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  for (const wall of [from, to]) wall.getAnimations().forEach(running => running.cancel())
  const width = from.offsetWidth
  flights(room, from, to)
  // Hidden once it's left: till then, in sight despite its being the wall away.
  from.style.visibility = 'visible'
  const gone = () => { if (!from.getAnimations().length) from.style.visibility = '' }
  from.animate(
    [{ transform: 'none', opacity: 1 }, { transform: `translateX(${-direction * width}px)`, opacity: 0.15 }],
    { duration: TIME, easing: EASE },
  ).finished.then(gone, gone)
  to.animate(
    [{ transform: `translateX(${direction * width}px)`, opacity: 0.15 }, { transform: 'none', opacity: 1 }],
    { duration: TIME, easing: EASE },
  )
  // What's on the wall arrives a moment after, one by one: as far as anyone can see.
  to.querySelectorAll('[data-rise], .morph-card').forEach((part, i) => {
    if (i > 16) return
    part.animate(
      [{ opacity: 0, transform: `translateX(${direction * 36}px)` }, { opacity: 1, transform: 'none' }],
      { duration: 520, delay: 160 + i * 42, easing: EASE, fill: 'backwards' },
    )
  })
}
