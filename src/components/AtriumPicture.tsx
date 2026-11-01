// An atrium's picture (lib/atriumPreview) -- read from the vault first, on desktop
// -- or, with none yet, the atrium's mark on its grid. It fills what it's put in.

import { useEffect, useState } from 'react'
import { previewFromWorker } from '../lib/people'

export default function AtriumPicture({ url, className = '' }: { url?: string | null; className?: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    if (!url) { setSrc(null); return }
    if (!url.startsWith('local://')) { setSrc(url); return }
    let live = true
    void import('../lib/localDb').then(m => m.resolveLocalUrl(url)).then(resolved => { if (live) setSrc(resolved.startsWith('local://') ? null : resolved) })
    return () => { live = false }
  }, [url])
  if (src) return <img src={src} alt="" loading="lazy" decoding="async" className={`absolute inset-0 w-full h-full object-cover ${className}`} onError={() => setSrc(previewFromWorker(src))} />
  return (
    <div
      aria-hidden="true"
      className={`absolute inset-0 grid place-items-center ${className}`}
      style={{ backgroundImage: 'linear-gradient(rgb(var(--c-fg) / 0.06) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--c-fg) / 0.06) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
    >
      <span
        className="w-10 h-10 bg-nier-bg/20"
        style={{ WebkitMaskImage: 'url(/atrium-mark.png)', maskImage: 'url(/atrium-mark.png)', WebkitMaskSize: 'contain', maskSize: 'contain', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat', WebkitMaskPosition: 'center', maskPosition: 'center' }}
      />
    </div>
  )
}
