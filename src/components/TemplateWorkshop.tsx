// The template editor's bar (lib/workshop), where the atrium's own session bar is:
// the template's name, how many of its 50 traces it has, and the two ways out --
// Cancel, which lets it all go, and Save template.

import { useEffect, useState } from 'react'
import { useTranslation } from '../lib/i18n'
import { keepWorkshop, TEMPLATE_TRACES, type Workshop } from '../lib/workshop'

export default function WorkshopBar({ workshop, traces, busy, problem, onCancel, onSave }: {
  workshop: Workshop; traces: number; busy: boolean; problem: string | null; onCancel: () => void; onSave: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(workshop.name)
  useEffect(() => setName(workshop.name), [workshop.name])
  const over = traces > TEMPLATE_TRACES
  return (
    <div data-workshop-bar="" data-ui-element="true" className="hud-in-right fixed top-4 right-4 z-[10000] flex items-start gap-2 font-mono pointer-events-auto">
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2 h-10 px-3 border border-nier-border/40" style={{ backgroundColor: 'rgb(var(--c-ground) / 0.94)' }}>
          <span className="text-[10px] tracking-[0.2em] uppercase text-nier-bg/55 whitespace-nowrap">◇ {t('templates.workshop')}</span>
          <input
            value={name}
            maxLength={60}
            aria-label={t('templates.nameLabel')}
            placeholder={t('templates.untitled')}
            onChange={e => setName(e.target.value)}
            onBlur={() => keepWorkshop({ name: name.trim() })}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
            className="w-44 bg-transparent text-nier-strong text-xs border-b border-nier-border/30 focus:border-nier-border/70 focus:outline-none"
          />
          <span data-workshop-count="" className={`text-[11px] whitespace-nowrap tabular-nums ${over ? 'danger-word' : 'text-nier-bg/70'}`}>
            {t('templates.traceCount', { count: traces, most: TEMPLATE_TRACES })}
          </span>
        </div>
        {problem && <p role="alert" data-workshop-problem="" className="danger-word text-[11px] max-w-[22rem] text-right">{problem}</p>}
      </div>
      <button type="button" data-workshop-cancel="" disabled={busy} onClick={onCancel} className="atrium-btn cut-corner h-10 whitespace-nowrap" style={{ backgroundColor: 'rgb(var(--c-ground) / 0.94)' }}>
        {t('common.cancel')}
      </button>
      <button
        type="button"
        data-workshop-save=""
        disabled={busy || traces === 0}
        onClick={onSave}
        className="atrium-btn cut-corner h-10 whitespace-nowrap disabled:opacity-50"
        style={{ backgroundColor: 'rgb(var(--c-fg))', color: 'rgb(var(--c-ground))', borderColor: 'rgb(var(--c-fg))' }}
      >
        {busy ? t('common.saving') : t('templates.save')}
      </button>
    </div>
  )
}
