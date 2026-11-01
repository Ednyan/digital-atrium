// Cropping one's picture to a square, here and now: the frame stays still and the
// picture moves under it. Dragged; zoomed by the slider, the wheel, a pinch or + and -;
// moved by the arrow keys too. What's outside the frame shows dimmed.

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from '../lib/i18n'
import { pictureFile } from '../lib/myPicture'
import { keptInFrame, mostZoom, scaleOf, zoomedAt, type CropView } from '../lib/pictureCrop'

const STAGE = 340
const FRAME = 260

export default function PictureCropper({ image, onSave, onCancel }: {
  image: HTMLImageElement
  // The file made. Refused, its reason is said here and it stays open.
  onSave: (file: Blob) => Promise<string | null>
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const width = image.naturalWidth, height = image.naturalHeight
  const [view, setView] = useState<CropView>({ zoom: 1, x: 0, y: 0 })
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const stage = useRef<HTMLDivElement>(null)
  const most = mostZoom(width, height)
  const moved = (next: CropView) => setView(keptInFrame(next, width, height, FRAME))
  // A point on the screen, from the frame's middle.
  const fromMiddle = (clientX: number, clientY: number) => {
    const box = stage.current!.getBoundingClientRect()
    return { x: clientX - box.left - box.width / 2, y: clientY - box.top - box.height / 2 }
  }

  // Each finger on it, and how far apart two were.
  const fingers = useRef(new Map<number, { x: number; y: number }>())
  const pinched = useRef(0)
  const down = (event: ReactPointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    fingers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    pinched.current = 0
  }
  const move = (event: ReactPointerEvent) => {
    const was = fingers.current.get(event.pointerId)
    if (!was) return
    const now = { x: event.clientX, y: event.clientY }
    fingers.current.set(event.pointerId, now)
    if (fingers.current.size === 1) {
      setView(v => keptInFrame({ ...v, x: v.x + now.x - was.x, y: v.y + now.y - was.y }, width, height, FRAME))
      return
    }
    const [a, b] = [...fingers.current.values()]
    const apart = Math.hypot(a.x - b.x, a.y - b.y)
    if (pinched.current) setView(v => zoomedAt(v, v.zoom * (apart / pinched.current), fromMiddle((a.x + b.x) / 2, (a.y + b.y) / 2), width, height, FRAME))
    pinched.current = apart
  }
  const up = (event: ReactPointerEvent) => {
    fingers.current.delete(event.pointerId)
    pinched.current = 0
  }

  // Not React's: a wheel it hands on can't be stopped from scrolling the page.
  useEffect(() => {
    const el = stage.current!
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const at = fromMiddle(event.clientX, event.clientY)
      setView(v => zoomedAt(v, v.zoom * Math.exp(-event.deltaY * 0.002), at, width, height, FRAME))
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [width, height])

  // Escape is this, not the page under it.
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopImmediatePropagation()
      onCancel()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [onCancel])

  const pressed = (event: ReactKeyboardEvent) => {
    const step = event.shiftKey ? 20 : 4
    const by: Record<string, Partial<CropView>> = {
      ArrowLeft: { x: view.x - step }, ArrowRight: { x: view.x + step }, ArrowUp: { y: view.y - step }, ArrowDown: { y: view.y + step },
    }
    if (by[event.key]) moved({ ...view, ...by[event.key] })
    else if (event.key === '+' || event.key === '=') setView(zoomedAt(view, view.zoom * 1.1, { x: 0, y: 0 }, width, height, FRAME))
    else if (event.key === '-') setView(zoomedAt(view, view.zoom / 1.1, { x: 0, y: 0 }, width, height, FRAME))
    else return
    event.preventDefault()
  }

  const save = async () => {
    setSaving(true)
    setProblem(null)
    const refused = await pictureFile(image, view, FRAME).then(onSave, () => t('profile.pictureFailed'))
    if (refused) {
      setProblem(refused)
      setSaving(false)
    }
  }

  const scale = scaleOf(view.zoom, width, height, FRAME)
  return (
    <div data-picture-cropper="" data-ui-element="true" className="modal-backdrop fixed inset-0 bg-nier-black/80 flex items-center justify-center z-[10001] p-4">
      <div className="bg-nier-blackLight border border-nier-border/40 w-full max-w-[24rem] max-h-[100dvh] overflow-y-auto relative">
        <div className="flex justify-between items-center gap-3 px-5 pt-5 pb-3">
          <h2 className="text-sm text-nier-strong tracking-[0.15em] uppercase truncate">{t('profile.pictureCrop')}</h2>
          <button type="button" onClick={onCancel} aria-label={t('common.close')} className="w-8 h-8 shrink-0 flex items-center justify-center border border-nier-border/30 text-nier-bg/80 hover:text-nier-bg hover:border-nier-border/60 transition-colors">×</button>
        </div>
        <div
          ref={stage}
          data-picture-stage=""
          tabIndex={0}
          role="application"
          aria-label={t('profile.pictureCropHint')}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onKeyDown={pressed}
          className="picture-stage relative mx-auto overflow-hidden bg-black cursor-move select-none outline-none"
          style={{ width: `min(100%, ${STAGE}px)`, aspectRatio: '1', touchAction: 'none' }}
        >
          <img
            src={image.src}
            alt=""
            draggable={false}
            data-picture-image=""
            className="absolute left-1/2 top-1/2 max-w-none pointer-events-none"
            style={{ width, height, transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${scale})` }}
          />
          <div aria-hidden="true" data-picture-frame="" className="picture-frame absolute left-1/2 top-1/2 pointer-events-none" style={{ width: FRAME, height: FRAME, translate: '-50% -50%' }} />
        </div>
        <div className="px-5 pt-4 pb-5">
          <p className="text-[11px] text-nier-bg/75">{t('profile.pictureCropHint')}</p>
          <label className="mt-3 flex items-center gap-3 text-[10px] tracking-[0.16em] uppercase text-nier-bg/75">
            {t('profile.pictureZoom')}
            <input
              type="range"
              data-picture-zoom=""
              min={1}
              max={most}
              step={0.01}
              disabled={most === 1}
              value={view.zoom}
              onChange={event => setView(v => zoomedAt(v, Number(event.target.value), { x: 0, y: 0 }, width, height, FRAME))}
              className="flex-1 min-w-0 accent-[rgb(var(--c-accent))]"
            />
          </label>
          {problem && <p role="alert" className="profile-note danger-word mt-3 text-xs">{problem}</p>}
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <button type="button" onClick={onCancel} disabled={saving} className="welcome-action h-[2.75rem] border border-nier-border/50 hover:border-nier-border/90 text-[11px] tracking-[0.14em] uppercase text-nier-strong disabled:opacity-40">{t('common.cancel')}</button>
            <button type="button" data-picture-save="" onClick={() => void save()} disabled={saving} className="h-[2.75rem] text-[11px] font-medium tracking-[0.14em] uppercase transition-opacity disabled:opacity-50" style={{ background: 'rgb(var(--c-accent))', color: 'rgb(var(--c-ground))' }}>{t('common.save')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
