// The template editor's own chrome (lib/workshop), in place of the atrium's: at
// the top left, what this is -- a template -- its name and how many of its 50
// traces it has (undo and redo beside it, as in an atrium); at the top right,
// the two ways out, Cancel and Save template; a line of the template's gold
// round the screen, so it's never taken for an atrium; and on an empty canvas,
// where to start. The rest is the atrium's own tools: the quick bar (with Slot),
// Layers, and the panel on the right -- the template's, or a trace's.

import { useEffect, useState } from 'react'
import { useTranslation } from '../lib/i18n'
import { SlideLabel } from './AtriumMenu'
import { SLOT_ICON } from './QuickBar'
import { keepWorkshop, TEMPLATE_TRACES, type Workshop } from '../lib/workshop'
import { useGamePick } from '../store/gameStore'

// The template's colour: the reveal's gold (index.css .template-reveal).
const GOLD = '232 193 90'
const GROUND = { backgroundColor: 'rgb(var(--c-ground) / 0.94)' }

/** What's being made, where an atrium's menu and name are: its name, set here. */
export function WorkshopTitle({ workshop, traces }: { workshop: Workshop; traces: number }) {
  const { t } = useTranslation()
  const [name, setName] = useState(workshop.name)
  useEffect(() => setName(workshop.name), [workshop.name])
  const over = traces > TEMPLATE_TRACES
  return (
    <div
      data-workshop-title=""
      data-ui-element="true"
      className="h-[2.125rem] flex items-center gap-3 pl-3 pr-3 border font-mono pointer-events-auto"
      style={{ ...GROUND, borderColor: `rgb(${GOLD} / 0.55)` }}
    >
      <span className="text-[11px] tracking-[0.2em] uppercase whitespace-nowrap" style={{ color: `rgb(${GOLD})` }}>◇ {t('templates.template')}</span>
      <input
        data-workshop-name=""
        value={name}
        maxLength={60}
        aria-label={t('templates.nameLabel')}
        placeholder={t('templates.untitled')}
        onChange={e => setName(e.target.value)}
        onBlur={() => keepWorkshop({ name: name.trim() })}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur() }}
        className="w-48 bg-transparent text-nier-strong text-xs border-b border-transparent hover:border-nier-border/40 focus:border-nier-border/70 focus:outline-none"
      />
      <span data-workshop-count="" title={t('templates.traceLimit', { most: TEMPLATE_TRACES })} className={`text-[11px] whitespace-nowrap tabular-nums ${over ? 'danger-word' : 'text-nier-bg/60'}`}>
        {t('templates.traceCount', { count: traces, most: TEMPLATE_TRACES })}
      </span>
    </div>
  )
}

/** The two ways out, where an atrium's session bar is -- and what stops a save. */
export function WorkshopActions({ traces, busy, problem, onCancel, onSave }: {
  traces: number; busy: boolean; problem: string | null; onCancel: () => void; onSave: () => void
}) {
  const { t } = useTranslation()
  return (
    <div data-workshop-bar="" data-ui-element="true" className="hud-in-right fixed top-4 right-4 z-[var(--layer-hud-menu)] flex flex-col items-end gap-1.5 font-mono pointer-events-auto">
      <div className="flex items-center gap-2">
        <button type="button" data-workshop-cancel="" disabled={busy} onClick={onCancel} className="atrium-btn cut-corner h-[2.125rem] whitespace-nowrap" style={GROUND}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          data-workshop-save=""
          disabled={busy || traces === 0}
          onClick={onSave}
          className="atrium-btn cut-corner h-[2.125rem] whitespace-nowrap disabled:opacity-50"
          style={{ backgroundColor: `rgb(${GOLD})`, color: '#14110a', borderColor: `rgb(${GOLD})` }}
        >
          {busy ? t('common.saving') : t('templates.save')}
        </button>
      </div>
      {problem && <p role="alert" data-workshop-problem="" className="danger-word text-[11px] max-w-[22rem] text-right px-2 py-1" style={GROUND}>{problem}</p>}
    </div>
  )
}

/** The Slot tool, the editor's own, above the quick bar and apart from it: a slot
 *  dragged out (or clicked) as a frame is; S. In hand while `armed`. */
export function WorkshopSlotTool({ armed, onPick }: { armed: boolean; onPick: () => void }) {
  const { t } = useTranslation()
  return (
    <div data-ui-element="true" data-hud="true" className="group relative p-1 border pointer-events-auto" style={{ ...GROUND, borderColor: `rgb(${GOLD} / 0.6)` }}>
      <button
        type="button"
        data-slot-tool=""
        aria-pressed={armed}
        aria-label={t('templates.slot')}
        aria-keyshortcuts="S"
        onClick={onPick}
        className="peer relative w-9 h-9 flex items-center justify-center border transition-colors"
        style={armed
          ? { backgroundColor: `rgb(${GOLD})`, color: '#14110a', borderColor: `rgb(${GOLD})` }
          : { color: `rgb(${GOLD})`, borderColor: 'transparent' }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">{SLOT_ICON}</svg>
        <span className="absolute right-0.5 bottom-0 text-[8px] leading-none font-mono opacity-60">S</span>
      </button>
      <SlideLabel text={t('templates.slot')} hint="S" />
    </div>
  )
}

/** The template's gold round the screen: this is the editor, not an atrium. */
export function WorkshopFrame() {
  return <div aria-hidden="true" data-workshop-frame="" className="fixed inset-0 z-[var(--layer-ink)] pointer-events-none" style={{ boxShadow: `inset 0 0 0 2px rgb(${GOLD} / 0.5)` }} />
}

/** On an empty canvas: what a template is made of, in the middle of the view. */
export function WorkshopEmptyHint({ ink }: { ink: string }) {
  const { t } = useTranslation()
  const { traces } = useGamePick('traces')
  if (traces.length > 0) return null
  return (
    <div data-hud="true" data-empty-hint="" className="panel-in fixed inset-0 z-[var(--layer-ink)] pointer-events-none flex items-center justify-center p-8">
      <div className="max-w-md text-center font-mono" style={{ color: ink }}>
        <p className="text-sm tracking-[0.2em] uppercase opacity-70">{t('templates.emptyTitle')}</p>
        <p className="mt-3 text-xs leading-relaxed tracking-wide opacity-60">{t('templates.emptyTools', { most: TEMPLATE_TRACES })}</p>
        <p className="mt-1 text-xs leading-relaxed tracking-wide opacity-60">{t('templates.emptyValues')}</p>
        <p className="mt-1 text-xs leading-relaxed tracking-wide opacity-60">{t('templates.emptySlots')}</p>
      </div>
    </div>
  )
}
