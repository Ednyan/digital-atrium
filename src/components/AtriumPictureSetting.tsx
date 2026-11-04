// An atrium's picture, in its settings (its owner's): the one on its card, and
// their own chosen instead -- cropped to the card's shape, made small
// (lib/myPicture) -- or the one made as it's left, again (lib/atriumPreview).

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from '../lib/i18n'
import { readCards } from '../lib/atriumCards'
import { chooseAtriumPicture, isPictureChosen, type PreviewDetail } from '../lib/atriumPreview'
import { useGameStore } from '../store/gameStore'
import AtriumPicture from './AtriumPicture'
import PictureCropper, { usePictureToCrop } from './PictureCropper'
import { FIELD_LABEL, SMALL_BUTTON } from './AtriumSettingsParts'

// The card's shape, and wide enough for Home's largest showing of it.
const ASPECT = 16 / 10
const WIDTH = 1280
const ENOUGH_BYTES = 120 * 1024

export default function AtriumPictureSetting({ lobbyId }: { lobbyId: string }) {
  const { t } = useTranslation()
  const userId = useGameStore(state => state.userId)
  const [url, setUrl] = useState(() => readCards(userId)[lobbyId]?.preview ?? null)
  const [chosen, setChosen] = useState(() => isPictureChosen(lobbyId, url))
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { image, open, letGo } = usePictureToCrop()
  const input = useRef<HTMLInputElement>(null)
  const here = useRef<HTMLDivElement>(null)
  // Kept anew, from here or as it's left: shown at once.
  useEffect(() => {
    const kept = (event: Event) => {
      const detail = (event as CustomEvent<PreviewDetail>).detail
      if (detail?.lobbyId === lobbyId) setUrl(detail.url)
    }
    window.addEventListener('atrium:preview', kept)
    return () => window.removeEventListener('atrium:preview', kept)
  }, [lobbyId])

  const automatic = async () => {
    setBusy(true)
    setProblem(null)
    const kept = await chooseAtriumPicture(lobbyId, null).catch(() => false)
    setBusy(false)
    if (kept) setChosen(false)
    else setProblem(t('atrium.manage.pictureFailed'))
  }

  // Over the settings, beside them: inside them, it'd be placed by their window.
  const over = here.current?.closest('.modal-backdrop') ?? document.body
  return (
    <div ref={here} data-atrium-picture-setting="">
      <span className={FIELD_LABEL}>{t('atrium.manage.picture')}</span>
      <div className="flex flex-wrap gap-4 items-start">
        <div className="relative w-40 aspect-[16/10] shrink-0 overflow-hidden border border-nier-border/30 bg-nier-black">
          <AtriumPicture url={url} />
        </div>
        <div className="min-w-0 flex-1 space-y-2.5">
          <p className="text-[11px] leading-relaxed text-nier-bg/70">{t(chosen ? 'atrium.manage.pictureChosen' : 'atrium.manage.pictureHint')}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" data-atrium-picture-choose="" disabled={busy} onClick={() => input.current?.click()} className={SMALL_BUTTON}>{t('atrium.manage.pictureChoose')}</button>
            {chosen && <button type="button" data-atrium-picture-automatic="" disabled={busy} onClick={() => void automatic()} className={SMALL_BUTTON}>{t('atrium.manage.pictureAutomatic')}</button>}
          </div>
          {problem && <p role="alert" className="danger-word text-xs">{problem}</p>}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        data-atrium-picture-file=""
        className="hidden"
        onChange={event => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) { setProblem(null); void open(file).then(setProblem) }
        }}
      />
      {image && createPortal(
        <PictureCropper
          image={image}
          aspect={ASPECT}
          width={WIDTH}
          enough={ENOUGH_BYTES}
          title={t('atrium.manage.pictureCrop')}
          onCancel={letGo}
          onSave={async file => {
            if (!await chooseAtriumPicture(lobbyId, file).catch(() => false)) return t('atrium.manage.pictureFailed')
            setChosen(true)
            letGo()
            return null
          }}
        />,
        over,
      )}
    </div>
  )
}
