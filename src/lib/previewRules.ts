// When an atrium's picture may be made, and whether what was made is fit to stand
// for it. A picture is redrawn in the page, so it needs the bytes of what it shows;
// where those can't be read (the Atrium's files answer only its own sites, not a
// local copy of the app) it comes out with the room's picture and images gone.
// That must never take the place of a good one, here or, shared, anywhere else.

export interface PreviewMemory {
  print: string
  at: number
  // It had all it should: its theme's picture, and most of its images. Not said by
  // those made before this was asked, so each of those gets one better chance.
  whole?: boolean
  // Whole, and newer than what's been shared of it (Google wasn't there to send it
  // to, say). What's shared is older, whatever its version says: never taken over this.
  unshared?: boolean
}

/** Whether it's time to make one: changed since a whole one, or the last wasn't. */
export function previewDue(last: PreviewMemory | null, print: string, now: number, atMostEvery: number) {
  if (!last) return true
  if (now - last.at < atMostEvery) return false
  return !(last.whole && last.print === print)
}

/** Whether a picture made as it was left shows the atrium as it looks. Some images
 *  are always out of reach (another site's); most of them is the sign of trouble. */
export function previewIsWhole(made: {
  // The view as it was left: none of the atrium in sight, there's no room to show.
  hadRoom: boolean
  // The room has a picture, and it wasn't on screen, or couldn't be read.
  roomPictureLost: boolean
  images: { tried: number; missed: number }
}) {
  return made.hadRoom && !made.roomPictureLost && made.images.missed * 2 <= made.images.tried
}
