// A 3D model trace's light, textures and colour (lib/model3d ModelLook), in its
// Customization panel, and its file: another model chosen in its place. Each
// change makes its still again (TraceOverlay restyleModel): one step of undo.
// Exposure is kept as the slider is let go, a colour once it has stopped
// changing -- not a new still at every step of a drag.
//
// Its textures are on when it came with any, off when it didn't (or can't); a
// colour is given only with them off.

import { useEffect, useRef, useState } from 'react'
import { DEFAULT_LOOK, MODEL_ACCEPT, MODEL_LIGHTS, texturesOn, type ModelLight, type ModelLook, type ModelRecord } from '../lib/model3d'
import { Choices, Row } from './Customization'
import { Check, ColourField } from './ShapeStyleControls'
import { useTranslation } from '../lib/i18n'
import type { TranslationKey } from '../locales/en'

// The colour of a part with none of its own, shown when none is chosen.
const PLAIN = '#bdbdbd'
const BUTTON = 'w-full h-8 border border-nier-border/40 text-nier-bg text-xs tracking-[0.1em] uppercase hover:border-nier-border/80 disabled:opacity-40'

export default function ModelLookSection({ record, busy, onLook, onReplace }: {
  record: ModelRecord
  busy: boolean
  onLook: (look: ModelLook) => void
  // Another model file, with what it needs beside it, in this one's place.
  onReplace?: (files: File[]) => void
}) {
  const { t } = useTranslation()
  const look = record.look ?? DEFAULT_LOOK
  const textures = texturesOn(record)
  const [exposure, setExposure] = useState(look.exposure)
  useEffect(() => setExposure(look.exposure), [look.exposure])
  const keepExposure = () => { if (exposure !== look.exposure) onLook({ ...look, exposure }) }
  // A colour picked: kept once the picking has paused.
  const pause = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(pause.current), [])
  const pickColour = (colour: string) => {
    window.clearTimeout(pause.current)
    pause.current = window.setTimeout(() => onLook({ ...look, colour }), 450)
  }
  const file = useRef<HTMLInputElement>(null)
  const light = (name: ModelLight) => t(`atrium.model.light.${name}` as TranslationKey)
  return (
    <div data-model-look="">
      <Row stacked label={t('atrium.model.light')}>
        <Choices name="model-light" value={look.light} onChange={next => onLook({ ...look, light: next })} options={MODEL_LIGHTS.map(name => ({ value: name, label: light(name), title: light(name) }))} />
      </Row>
      <Row label={t('atrium.model.exposure')}>
        <div className="flex items-center gap-2">
          <input
            type="range" min={0.25} max={3} step={0.05} value={exposure}
            aria-label={t('atrium.model.exposure')}
            data-model-exposure=""
            onChange={e => setExposure(parseFloat(e.target.value))}
            onPointerUp={keepExposure}
            onKeyUp={keepExposure}
            onBlur={keepExposure}
            className="flex-1 min-w-0 accent-nier-bg"
          />
          <span className="w-12 shrink-0 text-right text-[11px] text-nier-strong tabular-nums">{exposure.toFixed(2)}</span>
        </div>
      </Row>
      {record.textured === false ? (
        <p data-model-no-textures="" className="mt-2 text-[11px] text-nier-bg/60">{t('atrium.model.noTextures')}</p>
      ) : (
        <div data-model-textures="">
          <Check row label={t('atrium.model.textures')} checked={textures} onChange={on => onLook({ ...look, textures: on })} />
        </div>
      )}
      {textures ? (
        <p className="mt-1 text-[11px] text-nier-bg/60">{t('atrium.model.colourNeedsOff')}</p>
      ) : (
        <ColourField
          label={t('atrium.model.colour')}
          value={look.colour ?? PLAIN}
          onChange={pickColour}
          onReset={look.colour ? () => { const { colour: _, ...own } = look; onLook(own) } : undefined}
        />
      )}
      {busy && <p data-model-busy="" className="mt-2 text-[11px] tracking-[0.1em] uppercase text-nier-bg/70">{t('atrium.model.rendering')}</p>}
      {onReplace && (
        <div className="mt-3">
          <input
            ref={file}
            type="file"
            multiple
            hidden
            data-model-file=""
            accept={`${MODEL_ACCEPT},image/*,.mtl,.bin`}
            onChange={e => { const files = [...(e.target.files ?? [])]; e.target.value = ''; if (files.length) onReplace(files) }}
          />
          <button type="button" data-model-choose="" className={BUTTON} disabled={busy} onClick={() => file.current?.click()}>{t('atrium.model.chooseFile')}</button>
        </div>
      )}
    </div>
  )
}
