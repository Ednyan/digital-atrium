// Where a picture sits under the square frame it's cropped by, as the frame's
// pixels: its middle's offset from the frame's, and how far it's zoomed (1: its
// shorter side just fills the frame). Pure, so it's tested (tests/pictureCrop).

export type CropView = { zoom: number; x: number; y: number }

// Past this, or past a square this many of the picture's own pixels across, there's
// nothing left to see.
const MOST_ZOOM = 6
const FEWEST_PIXELS = 64

export const mostZoom = (width: number, height: number) =>
  Math.max(1, Math.min(MOST_ZOOM, Math.min(width, height) / FEWEST_PIXELS))

/** How large one of the picture's pixels is, in the frame's. */
export const scaleOf = (zoom: number, width: number, height: number, frame: number) => (frame / Math.min(width, height)) * zoom

/** The view, kept where the picture still covers the frame. */
export function keptInFrame(view: CropView, width: number, height: number, frame: number): CropView {
  const zoom = Math.min(mostZoom(width, height), Math.max(1, view.zoom))
  const scale = scaleOf(zoom, width, height, frame)
  const spareX = Math.max(0, (width * scale - frame) / 2)
  const spareY = Math.max(0, (height * scale - frame) / 2)
  return { zoom, x: Math.max(-spareX, Math.min(spareX, view.x)), y: Math.max(-spareY, Math.min(spareY, view.y)) }
}

/** Zoomed to `zoom` with the point `at` (from the frame's middle) staying where it is. */
export function zoomedAt(view: CropView, zoom: number, at: { x: number; y: number }, width: number, height: number, frame: number): CropView {
  const next = Math.min(mostZoom(width, height), Math.max(1, zoom))
  const grew = next / view.zoom
  return keptInFrame({ zoom: next, x: at.x - (at.x - view.x) * grew, y: at.y - (at.y - view.y) * grew }, width, height, frame)
}

/** The square of the picture's own pixels the frame shows. */
export function cropOf(view: CropView, width: number, height: number, frame: number) {
  const scale = scaleOf(view.zoom, width, height, frame)
  const side = frame / scale
  return { x: width / 2 - view.x / scale - side / 2, y: height / 2 - view.y / scale - side / 2, side }
}
