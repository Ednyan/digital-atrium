// A 3D model trace's light and colour (lib/model3d ModelLook), in its
// Customization panel. Each change makes its still again (TraceOverlay
// restyleModel): one step of undo. Exposure is kept as the slider is let go,
// a colour once it has stopped changing -- not a new still at every step of a drag.

import { useEffect, useRef, useState } from 'react'
import { MODEL_LIGHTS, type ModelLight, type ModelLook } from '../lib/model3d'
import { Choices, Row } from './Customization'
import { ColourField } from './ShapeStyleControls'
import { useTranslation } from '../lib/i18n'
import type { TranslationKey } from '../locales/en'

// The colour of a part with none of its own, shown when none is chosen.
const PLAIN = '#bdbdbd'

export default function ModelLookSection({ look, busy, onLook }: { look: ModelLook; busy: boolean; onLook: (look: ModelLook) => void }) {
  const { t } = useTranslation()
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
      <ColourField
        label={t('atrium.model.colour')}
        value={look.colour ?? PLAIN}
        onChange={pickColour}
        onReset={look.colour ? () => { const { colour: _, ...own } = look; onLook(own) } : undefined}
      />
      <p className="mt-1 text-[11px] text-nier-bg/60">{t('atrium.model.colourHint')}</p>
      {busy && <p data-model-busy="" className="mt-2 text-[11px] tracking-[0.1em] uppercase text-nier-bg/70">{t('atrium.model.rendering')}</p>}
    </div>
  )
}
