// A trace's lines boiling (lib/wiggle): the filter its drawing is shown through,
// noise pushing its pixels, in the trace's own units, so it grows with the trace.

import { useEffect, useRef } from 'react'
import { boil } from '../lib/wiggle'
import type { Wiggle } from '../lib/traceLook'

export default function WiggleFilter({ id, traceId, wiggle }: { id: string; traceId: string; wiggle: Wiggle }) {
  const noise = useRef<SVGFETurbulenceElement>(null)
  useEffect(() => {
    const host = document.querySelector(`[data-trace-id="${CSS.escape(traceId)}"]`)
    if (!noise.current || !host) return
    return boil(noise.current, host, wiggle.speed)
  }, [traceId, wiggle.speed])
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
      <filter id={id} x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
        <feTurbulence ref={noise} type="fractalNoise" baseFrequency={wiggle.detail} numOctaves={2} seed={1} result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale={wiggle.amount * 2} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  )
}
