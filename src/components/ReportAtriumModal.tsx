// Reporting an atrium that breaks the terms of use: why, and what's wrong, to the
// Atrium's operator (Developers > Feedback, lib/feedback) -- with its name and id,
// and, signed in, who's reporting it (the worker's to know, not the form's).

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '../lib/i18n'
import { sendFeedbackReport, ATRIUM_REPORT_REASONS, type AtriumReportReason } from '../lib/feedback'
import type { TranslationKey } from '../locales/en'
import { SUPPORT_EMAIL } from './ReportFeedbackModal'

export default function ReportAtriumModal({ lobbyId, name, onClose }: { lobbyId: string; name: string; onClose: () => void }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState<AtriumReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  // A modal dialog: over everything, a card's menu or an atrium's controls alike.
  const box = useRef<HTMLDialogElement>(null)
  useEffect(() => { box.current?.showModal() }, [])

  const send = async () => {
    if (!reason) return
    setSending(true)
    setProblem(null)
    const { success, error } = await sendFeedbackReport({
      motive: 'atrium',
      subject: reason,
      // The worker wants words: the reason's, if none were written.
      description: details.trim() || `(${reason})`,
      atriumName: `${name} (${lobbyId})`,
    })
    setSending(false)
    if (success) setSent(true)
    else setProblem(error ?? t('report.sendFailed'))
  }

  return (
    <dialog
      ref={box}
      data-report-atrium=""
      aria-label={t('report.atrium.title')}
      onCancel={event => { event.preventDefault(); onClose() }}
      // Pressed outside it -- on its backdrop, which is the dialog's own.
      onClick={event => { if (event.target === box.current) onClose() }}
      className="atrium-dialog w-[min(28rem,calc(100%-2rem))] p-0"
    >
      <div className="p-6">
        <div className="flex justify-between items-start gap-3 mb-3">
          <h3 className="text-nier-strong tracking-[0.15em] uppercase text-sm">◇ {t('report.atrium.title')}</h3>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="w-8 h-8 shrink-0 flex items-center justify-center border border-nier-border/30 text-nier-bg/80 hover:text-nier-bg hover:border-nier-border/60 transition-colors">×</button>
        </div>
        {sent ? (
          <>
            <p role="status" className="text-xs leading-relaxed text-nier-bg/85 mb-5">✓ {t('report.atrium.sent')}</p>
            <button type="button" onClick={onClose} className="w-full py-2 border border-nier-border/40 text-xs tracking-[0.15em] uppercase text-nier-strong hover:border-nier-border/80 transition-colors">{t('common.close')}</button>
          </>
        ) : (
          <>
            <p className="text-xs leading-relaxed text-nier-bg/80 mb-4">
              {t('report.atrium.lead', { name })}{' '}
              <a href="/terms.html#report" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-nier-strong">{t('report.atrium.terms')}</a>
            </p>
            <fieldset className="mb-4">
              <legend className="text-[10px] tracking-[0.18em] uppercase text-nier-bg/75 mb-2">{t('report.atrium.why')}</legend>
              <div className="grid gap-1.5">
                {ATRIUM_REPORT_REASONS.map(one => (
                  <label key={one} data-report-reason={one} className={`flex items-center gap-2.5 px-3 py-2 border cursor-pointer text-xs transition-colors ${reason === one ? 'border-nier-bg text-nier-strong' : 'border-nier-border/30 text-nier-bg/85 hover:border-nier-border/60'}`}>
                    <input type="radio" name="report-reason" value={one} checked={reason === one} onChange={() => setReason(one)} className="accent-[rgb(var(--c-accent))]" />
                    {t(`report.atrium.reason.${one}` as TranslationKey)}
                  </label>
                ))}
              </div>
            </fieldset>
            {/* A formal copyright notice needs what a form doesn't ask: by email (the terms, #report). */}
            {reason === 'copyright' && (() => {
              // The address as a link, where the words put it.
              const [before, after] = t('report.atrium.copyrightNote').split('{email}')
              return (
                <p data-report-copyright="" className="mb-4 text-[11px] leading-relaxed text-nier-bg/80">
                  {before}<a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Copyright notice: ${name} (${lobbyId})`)}`} className="underline underline-offset-2 hover:text-nier-strong">{SUPPORT_EMAIL}</a>{after}
                </p>
              )
            })()}
            <label className="block text-[10px] tracking-[0.18em] uppercase text-nier-bg/75 mb-2" htmlFor="report-atrium-details">{t('report.atrium.details')}</label>
            <textarea
              id="report-atrium-details"
              data-report-details=""
              value={details}
              onChange={event => setDetails(event.target.value.slice(0, 2000))}
              rows={4}
              className="w-full bg-nier-black border border-nier-border/30 text-nier-bg px-3 py-2 text-xs leading-relaxed focus:border-nier-border/60 transition-colors resize-y"
            />
            {problem && <p role="alert" className="danger-word mt-3 text-xs">{problem}</p>}
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <button type="button" onClick={onClose} disabled={sending} className="py-2 border border-nier-border/40 text-xs tracking-[0.15em] uppercase text-nier-strong hover:border-nier-border/80 transition-colors disabled:opacity-40">{t('common.cancel')}</button>
              <button type="button" data-report-send="" onClick={() => void send()} disabled={!reason || sending} className="py-2 text-xs font-medium tracking-[0.15em] uppercase transition-opacity disabled:opacity-40" style={{ background: 'rgb(var(--c-accent))', color: 'rgb(var(--c-ground))' }}>
                {sending ? t('report.sending') : t('report.send')}
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  )
}
