// Pinterest's mark, drawn in one colour.
//
// currentColor rather than Pinterest red, because everywhere it appears here it
// sits in a row of monochrome glyphs that take the theme's foreground -- a
// single brand-red dot among them would read as an error state rather than a
// logo. The shape is what identifies it; the colour is the atrium's.
import { PINTEREST_MARK } from '../lib/pins'

export default function PinterestMark({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d={PINTEREST_MARK} />
    </svg>
  )
}
