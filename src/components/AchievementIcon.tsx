// Each achievement's own icon (lib/achievements): a dark tile with the app's cut
// corner, lit from within in its family's colour, its glyph drawn over it in
// line -- and, where it's a step of a count (traces placed, deleted, days in a
// row), that step's diamonds along its foot. Not earned yet, it's grey and dim,
// as a locked one is shown. Drawn, not pictures: sharp at any size.

import { useId } from 'react'
import { FAMILY_COLOUR, type Achievement } from '../lib/achievements'

// Glyphs in a 24 grid, drawn in line (some from Tabler's icons, MIT).
const CARD = 'M6 8h12v11H6z'
const GLYPHS: Record<string, string> = {
  // Two bare footprints, one ahead of the other.
  firstSteps: 'M8 11.2c1.8 0 2.8 1.9 2.8 4.3s-1.1 4.3-2.8 4.3-2.8-1.9-2.8-4.3 1-4.3 2.8-4.3zM5.7 9.9h.01M7.3 8.9h.01M9.0 8.7h.01M10.5 9.4h.01M16 4.9c1.8 0 2.8 1.9 2.8 4.3s-1.1 4.3-2.8 4.3-2.8-1.9-2.8-4.3 1-4.3 2.8-4.3zM13.7 3.6h.01M15.3 2.6h.01M17.0 2.4h.01M18.5 3.1h.01',
  // A trace: a card with the mark on it -- then more of them.
  firstTrace: `${CARD}M12 10.5l3 3-3 3-3-3z`,
  hundred: 'M9 5h11v11M5 8h11v11H5z',
  thousand: 'M11 3h10v10M8 6h10v10M4 9h10v11H4z',
  tenThousand: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  hundredThousand: 'M3 3h5v5H3zM9.5 3h5v5h-5zM16 3h5v5h-5zM3 9.5h5v5H3zM9.5 9.5h5v5h-5zM16 9.5h5v5h-5zM3 16h5v5H3zM9.5 16h5v5h-5zM16 16h5v5h-5z',
  // Piles of them, one taller than the rest, the mark on its top.
  million: 'M9 4h7v3H9zM9 9.5h7M9 12h7M9 14.5h7M9 17h7M8.5 19.5h8M2.5 11h5.5v3H2.5zM2.5 16.5h5.5M2 19h6.5M17 8h5v3h-5zM17 13.5h5M17 16h5M16.5 18.5h6M12.5 4.6l.8.9-.8.9-.8-.9z',
  // Taken away: an eraser, a bin, a sweep that sparkles, a fire.
  secondThoughts: 'M19 20H8.5l-4.2-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4L11.5 20M18 13.3L11.7 7',
  tidyingUp: 'M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3',
  springCleaning: 'M20 3l-7.5 7.5M9 9l6 6-3 6H4l1-7zM8 17l-1 4M11 17l-1 4M5.5 2.5l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7zM19 14.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z',
  scorchedEarth: 'M12 10.9c2.3-3.3.2-7.8-1-8.9 0 3.4-2.2 5.3-3.7 6.7C5.9 10.1 5 12.3 5 14c0 3.3 3.1 6 7 6s7-2.7 7-6c0-1.5-1-3.7-2-5-1.9 3.1-2.9 3.1-4 2.9',
  // Coming back: the way back, a week, a moon, a year's sun.
  cameBack: 'M9 14l-4-4 4-4M5 10h11a4 4 0 1 1 0 8h-1',
  oneWeek: 'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM16 3v4M8 3v4M4 11h16M10 14h4l-2.5 5',
  oneMonth: 'M12 3h.4a7.5 7.5 0 0 0 7.9 12.4A9 9 0 1 1 12 3z',
  oneYear: 'M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0M3 12h1.5M19.5 12H21M12 3v1.5M12 19.5V21M5.6 5.6l1.1 1.1M17.3 17.3l1.1 1.1M5.6 18.4l1.1-1.1M17.3 6.7l1.1-1.1',
  // The rest: a thread between two, a cobweb with its spider, a palette, a pencil's line, a layout.
  weaver: 'M4 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0M16 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0M8 6c7 0 1 12 8 12',
  spider: 'M3 3l18 1M3 3l17 9M3 3l13 13M3 3l9 17M3 3l1 18M10 3.4Q8.8 4.4 9.2 6.3Q7.8 6.6 8 8Q6.6 7.8 6.3 9.2Q4.4 8.8 3.4 10M16 3.7Q14 5.6 14.6 8.8Q12 9.4 12.2 12.2Q9.4 12 8.8 14.6Q5.6 14 3.7 16M16 16v2.4M16 18.4a1.6 1.6 0 1 0 0 3.2a1.6 1.6 0 1 0 0-3.2M13.9 19l.9.6M18.1 19l-.9.6M13.9 21.6l.9-.5M18.1 21.6l-.9-.5',
  colourist: 'M12 21a9 9 0 0 1 0-18c5 0 9 3.6 9 8 0 1.1-.5 2.1-1.3 2.8-.8.8-2 1.2-3.2 1.2h-2.5a2 2 0 0 0-1 3.8 1.3 1.3 0 0 1-1 2.2M7.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0-2 0M11.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0-2 0M15.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
  scribbler: 'M4 20h4L18.5 9.5a2.8 2.8 0 0 0-4-4L4 16v4M13.5 6.5l4 4M3 22c2-1.2 3.5.4 5.5-.8',
  offTheShelf: 'M4 4h16v6H4zM4 14h7v6H4zM14 14h6v6h-6z',
}
// Which step of its count it is: that many diamonds along its foot.
const STEP: Record<string, number> = {
  hundred: 1, thousand: 2, tenThousand: 3, hundredThousand: 4, million: 5,
  tidyingUp: 1, springCleaning: 2, scorchedEarth: 3,
  oneWeek: 1, oneMonth: 2, oneYear: 3,
  spider: 1,
}
// The tile: square, its top right corner cut, as the app's buttons are.
const TILE = 'M2 2h48l12 12v48H2z'

export default function AchievementIcon({ one, earned = true, size = 48, className = '' }: { one: Achievement; earned?: boolean; size?: number; className?: string }) {
  const light = `achievement-light-${useId().replace(/:/g, '')}`
  const colour = FAMILY_COLOUR[one.family]
  const step = STEP[one.id] ?? 0
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      data-achievement-icon={one.id}
      className={`achievement-icon shrink-0 ${earned ? '' : 'achievement-icon-locked'} ${className}`}
    >
      <defs>
        <radialGradient id={light} cx="50%" cy="34%" r="72%">
          <stop offset="0" stopColor={colour} stopOpacity="0.62" />
          <stop offset="0.5" stopColor={colour} stopOpacity="0.18" />
          <stop offset="1" stopColor={colour} stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d={TILE} fill="#111114" />
      <path d={TILE} fill={`url(#${light})`} />
      <path d="M7 7h41l9 9v41H7z" fill="none" stroke="#ffffff" strokeOpacity="0.07" />
      <path d={TILE} fill="none" stroke={colour} strokeOpacity="0.75" strokeWidth="1.5" />
      <g transform={`translate(14 ${step ? 9 : 13}) scale(1.5)`} fill="none" stroke="#f6f2ea" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d={GLYPHS[one.id] ?? GLYPHS.firstTrace} />
      </g>
      {Array.from({ length: step }, (_, i) => {
        const x = 32 + (i - (step - 1) / 2) * 7.5
        return <path key={i} d={`M${x} 51.5l2.6 2.6-2.6 2.6-2.6-2.6z`} fill={colour} />
      })}
    </svg>
  )
}
