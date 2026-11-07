// A name for traces kept as a template from the canvas (LobbyScene): asked once,
// as the template editor's title would be. A modal dialog, over everything.

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '../lib/i18n'

export default function TemplateNameDialog({ name, busy, problem, onSave, onClose }: {
  name: string; busy: boolean; problem: string | null; onSave: (name: string) => void; onClose: () => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(name)
  const box = useRef<HTMLDialogElement>(null)
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => { box.current?.showModal(); field.current?.select() }, [])
  const save = () => { if (!busy) onSave(draft.trim() || name) }
  return (
    <dialog
      ref={box}
      data-template-name=""
      aria-label={t('templates.saveAsTitle')}
      onCancel={e => { e.preventDefault(); if (!busy) onClose() }}
      className="m-auto w-[min(92vw,22rem)] p-0 bg-nier-blackLight border border-nier-border/50 text-nier-bg font-mono backdrop:bg-black/50"
    >
      <form method="dialog" className="p-5 space-y-4" onSubmit={e => { e.preventDefault(); save() }}>
        <h3 className="text-nier-strong tracking-[0.15em] uppercase text-sm">◇ {t('templates.saveAsTitle')}</h3>
        <label className="block">
          <span className="block text-[10px] tracking-[0.18em] uppercase text-nier-bg/75 mb-2">{t('templates.nameLabel')}</span>
          <input
            ref={field}
            value={draft}
            maxLength={80}
            onChange={e => setDraft(e.target.value)}
            className="w-full bg-nier-black border border-nier-border/30 text-nier-bg px-3 py-2 text-xs focus:outline-none focus:border-nier-border/60"
          />
        </label>
        {problem && <p role="alert" className="danger-word text-xs leading-relaxed">{problem}</p>}
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" onClick={onClose} disabled={busy} className="py-2 border border-nier-border/40 text-xs tracking-[0.15em] uppercase text-nier-strong hover:border-nier-border/80 transition-colors disabled:opacity-40">{t('common.cancel')}</button>
          <button type="submit" data-template-name-save="" disabled={busy} className="py-2 text-xs font-medium tracking-[0.15em] uppercase transition-opacity disabled:opacity-40" style={{ background: 'rgb(var(--c-accent))', color: 'rgb(var(--c-ground))' }}>{t('common.save')}</button>
        </div>
      </form>
    </dialog>
  )
}
