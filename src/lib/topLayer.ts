// The top layer -- popovers, modal dialogs, fullscreen -- is drawn over every
// element of the page whatever its z-index, in the order things go into it. What
// must be over all of it (the pointer the app draws, TraceOverlay's OwnCursor)
// joins it, and goes back to its top whenever anything else goes in.

const onTop = new Set<HTMLElement>()
const raise = () => {
  // In the order they were kept: what's kept later lies over what's kept before.
  for (const el of onTop) {
    try { el.hidePopover(); el.showPopover() } catch { /* not in it: its own z-index, then */ }
  }
}

let watching = false
function watch() {
  if (watching) return
  watching = true
  // A popover shown: its toggle doesn't bubble, so it's caught on the way down.
  document.addEventListener('toggle', event => {
    if (!onTop.has(event.target as HTMLElement) && (event as Event & { newState?: string }).newState === 'open') raise()
  }, true)
  // A dialog opened (showModal says nothing else everywhere), and fullscreen.
  new MutationObserver(records => {
    if (records.some(record => record.target instanceof HTMLDialogElement && record.target.open)) raise()
  }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['open'] })
  document.addEventListener('fullscreenchange', raise)
}

/** `el` over everything, the top layer too, until the returned function lets it go. */
export function keepOnTop(el: HTMLElement): () => void {
  watch()
  el.setAttribute('popover', 'manual')
  onTop.add(el)
  try { el.showPopover() } catch { /* no top layer here: its own z-index, then */ }
  return () => {
    onTop.delete(el)
    try { el.hidePopover() } catch { /* gone already */ }
  }
}

// A popover's own look, undone: where its element puts itself, it is.
export const TOP_LAYER_RESET = { inset: 'auto', left: 0, top: 0, margin: 0, padding: 0, border: 0, background: 'transparent', overflow: 'visible' } as const
