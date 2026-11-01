// One's picture at the top of Profile, or one's initial on one's colour, and the way
// to change it: pressed with none, it asks for a file; with one, a small menu asks
// which. Any shape of picture is cropped here (PictureCropper), not beforehand.

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '../lib/i18n'
import { removeMyPicture, saveMyPicture, useMyPicture } from '../lib/myPicture'
import PictureCropper from './PictureCropper'

const CUT = 'polygon(0 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%)'

/** One's picture or, without one, one's initial: filling what it's put in. */
export function PictureOrInitial({ picture, initial, className = '' }: { picture: string | null; initial: string; className?: string }) {
  const [broken, setBroken] = useState<string | null>(null)
  if (picture && picture !== broken) return <img src={picture} alt="" decoding="async" draggable={false} onError={() => setBroken(picture)} className={`block w-full h-full object-cover ${className}`} />
  return <>{initial}</>
}

export default function ProfilePicture({ colour, initial }: { colour: string; initial: string }) {
  const { t } = useTranslation()
  const picture = useMyPicture()
  const [menu, setMenu] = useState(false)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const beside = (event: MouseEvent | TouchEvent) => { if (!root.current?.contains(event.target as Node)) setMenu(false) }
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopImmediatePropagation()
      setMenu(false)
    }
    document.addEventListener('mousedown', beside)
    document.addEventListener('touchstart', beside)
    window.addEventListener('keydown', key, true)
    return () => {
      document.removeEventListener('mousedown', beside)
      document.removeEventListener('touchstart', beside)
      window.removeEventListener('keydown', key, true)
    }
  }, [menu])

  // Let go of with whatever follows it.
  const showing = useRef<string | null>(null)
  const letGo = () => {
    if (showing.current) URL.revokeObjectURL(showing.current)
    showing.current = null
    setImage(null)
  }
  useEffect(() => () => { if (showing.current) URL.revokeObjectURL(showing.current) }, [])

  const chosen = async (file: File | undefined) => {
    if (!file) return
    setProblem(null)
    const url = URL.createObjectURL(file)
    const opened = new Image()
    opened.src = url
    // An SVG's own size means nothing, and it isn't a photograph.
    const decoded = file.type !== 'image/svg+xml' && await opened.decode().then(() => true, () => false)
    if (!decoded || !opened.naturalWidth || !opened.naturalHeight) {
      URL.revokeObjectURL(url)
      setProblem(t('profile.pictureUnreadable'))
      return
    }
    if (showing.current) URL.revokeObjectURL(showing.current)
    showing.current = url
    setImage(opened)
  }

  const remove = async () => {
    setMenu(false)
    setProblem(null)
    await removeMyPicture().catch(() => setProblem(t('profile.pictureFailed')))
  }

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        data-profile-picture=""
        aria-label={t(picture ? 'profile.pictureChange' : 'profile.pictureAdd')}
        title={t(picture ? 'profile.pictureChange' : 'profile.pictureAdd')}
        aria-haspopup={picture ? 'true' : undefined}
        aria-expanded={picture ? menu : undefined}
        onClick={() => (picture ? setMenu(now => !now) : input.current?.click())}
        className="profile-picture enter-zoom relative block w-28 h-28 overflow-hidden text-[2.9rem] font-bold uppercase transition-colors duration-300"
        style={{ background: colour, color: '#191919', clipPath: CUT }}
      >
        <PictureOrInitial picture={picture} initial={initial} />
        <span aria-hidden="true" className="profile-picture-over absolute inset-0 flex items-center justify-center">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round"><path d="M4 8h3.5L9 5.5h6L16.5 8H20v11H4Z" /><circle cx="12" cy="13" r="3.4" /></svg>
        </span>
      </button>
      <input ref={input} type="file" accept="image/*" data-profile-picture-file="" className="hidden" onChange={event => { void chosen(event.target.files?.[0]); event.target.value = '' }} />
      {menu && (
        <div data-profile-picture-menu="" className="ctx-menu absolute left-0 top-[calc(100%+6px)] z-20">
          <button type="button" data-profile-picture-change="" className="ctx-item" onClick={() => { setMenu(false); input.current?.click() }}>{t('profile.pictureChange')}</button>
          <button type="button" data-profile-picture-remove="" data-danger="" className="ctx-item" onClick={() => void remove()}>{t('profile.pictureRemove')}</button>
        </div>
      )}
      {problem && <p role="alert" data-profile-picture-problem="" className="profile-note danger-word absolute left-0 top-[calc(100%+6px)] z-10 w-56 text-xs">{problem}</p>}
      {image && (
        <PictureCropper
          image={image}
          onCancel={letGo}
          onSave={async file => {
            const refused = await saveMyPicture(file).then(() => null, () => t('profile.pictureFailed'))
            if (!refused) letGo()
            return refused
          }}
        />
      )}
    </div>
  )
}
