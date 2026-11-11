// An atrium's picture (lib/atriumPreview) -- read from the vault, where this tab has
// it open (the desktop's always is), or else from the copy kept outside it
// (lib/cardPictures), so Home never opens it -- or, with none, the atrium's mark on
// its grid. It fills what it's put in, and follows the picture as it's made anew.

import { useEffect, useState } from 'react'
import { isDesktop } from '../lib/supabase'
import { cardPicture, keepCardPicture } from '../lib/cardPictures'
import type { PreviewDetail } from '../lib/atriumPreview'

const inVault = (url?: string | null) => !!url && url.startsWith('local://')

// `first`: the page's largest picture (Home's last atrium) -- asked for at once and ahead
// of the rest, not when the browser gets round to it: it was the last thing to show.
export default function AtriumPicture({ url, className = '', first = false }: { url?: string | null; className?: string; first?: boolean }) {
  // Undefined while it's being read: not yet known to be without one.
  const [src, setSrc] = useState<string | null | undefined>(() => (inVault(url) ? undefined : url ?? null))
  // Made anew (lib/atriumPreview), at the same address: read again.
  const [made, setMade] = useState(0)
  useEffect(() => {
    if (!url) return
    const anew = (event: Event) => { if ((event as CustomEvent<PreviewDetail>).detail?.url === url) setMade(n => n + 1) }
    window.addEventListener('atrium:preview', anew)
    return () => window.removeEventListener('atrium:preview', anew)
  }, [url])
  useEffect(() => {
    if (!url) { setSrc(null); return }
    if (!inVault(url)) { setSrc(url); return }
    let live = true, shown: string | null = null
    void (async () => {
      const local = await import('../lib/localDb')
      if (isDesktop || local.browserVaultIsOpen()) {
        const resolved = await local.resolveLocalUrl(url).catch(() => url)
        if (!live) return
        if (resolved.startsWith('local://')) { setSrc(null); return }
        setSrc(resolved)
        if (!isDesktop) void fetch(resolved).then(answer => answer.blob()).then(picture => keepCardPicture(url, picture)).catch(() => {})
        return
      }
      const kept = await cardPicture(url)
      if (!live || !kept) return
      shown = URL.createObjectURL(kept)
      setSrc(shown)
    })()
    return () => {
      live = false
      if (shown) URL.revokeObjectURL(shown)
    }
  }, [url, made])
  if (src === undefined) return null
  if (src) return <img src={src} alt="" loading={first ? 'eager' : 'lazy'} decoding="async" {...(first ? { fetchpriority: 'high' } : {})} className={`atrium-picture absolute inset-0 w-full h-full object-cover ${className}`} />
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
