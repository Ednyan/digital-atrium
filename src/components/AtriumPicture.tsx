// An atrium's picture (lib/atriumPreview) -- read from the vault first, on desktop
// -- or, with none yet, the atrium's mark on its grid. It fills what it's put in.

import { useEffect, useState } from 'react'
import { isDesktop } from '../lib/supabase'

const inVault = (url?: string | null) => !!url && url.startsWith('local://')

export default function AtriumPicture({ url, className = '' }: { url?: string | null; className?: string }) {
  // Undefined while the vault's being read: not yet known to be without one.
  const [src, setSrc] = useState<string | null | undefined>(() => (inVault(url) ? undefined : url ?? null))
  useEffect(() => {
    if (!url) { setSrc(null); return }
    if (!inVault(url)) { setSrc(url); return }
    let live = true
    void import('../lib/localDb').then(async local => {
      // On the web it opens with the first thing to want it, which may be this.
      if (!isDesktop) await local.browserVaultOpen()
      return local.resolveLocalUrl(url)
    }).catch(() => url).then(resolved => { if (live) setSrc(resolved.startsWith('local://') ? null : resolved) })
    return () => { live = false }
  }, [url])
  if (src === undefined) return null
  if (src) return <img src={src} alt="" loading="lazy" decoding="async" className={`atrium-picture absolute inset-0 w-full h-full object-cover ${className}`} />
  return (
    <div
      aria-hidden="true"
      data-atrium-mark=""
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
