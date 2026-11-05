// Linking settings to their group's values (lib/templateValues), in the
// Customization panel: the link button beside each setting that can be linked
// (Row's `link`), and the Values section, where each value is set for every
// trace linked to it. Given by TraceOverlay for the traces the panel edits, to
// developers only until the plans exist (docs/IDEAS.md, "Making your own").

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { tCount, useTranslation } from '../lib/i18n'
import type { TranslationKey } from '../locales/en'
import {
  fits, forget, format, freshName, holdEverywhere, isLinkable, kindFor, linkAsNew, linkTo, parse, unlink, usesOf, valueNow,
  type Change, type Held, type TemplateValue, type ValueKind,
} from '../lib/templateValues'
import type { Layer, Trace } from '../types/database'
import { Section, Switch } from './Customization'

export interface ValueLinking {
  // What the panel edits, the group keeping the values, and every trace sharing them.
  traces: Trace[]
  group: Layer
  members: Trace[]
  values: TemplateValue[]
  fonts: { value: string; label: string }[]
  // Traces changed and, given, the group's values written: one step of undo.
  change: (changes: Change[], values?: TemplateValue[]) => void
  // "Show links": the values' links drawn as threads, and that switched.
  threads: boolean
  showThreads: (on: boolean) => void
}
export const ValueLinkContext = createContext<ValueLinking | null>(null)

const KIND_NAME: Record<ValueKind, TranslationKey> = {
  colour: 'templates.kind.colour', font: 'templates.kind.font', number: 'templates.kind.number', text: 'templates.kind.text', toggle: 'templates.kind.toggle',
}
const CHAIN = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5" aria-hidden="true">
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </svg>
)
const ITEM = 'w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[11px] text-nier-bg/80 hover:bg-nier-bg/10 hover:text-nier-strong focus-visible:bg-nier-bg/10 focus:outline-none'

function Swatch({ value, held }: { value: TemplateValue; held: Held }) {
  return value.kind === 'colour'
    ? <span className="w-3 h-3 shrink-0 border border-nier-border/50" style={{ backgroundColor: String(held) }} />
    : <span className="w-2 h-2 shrink-0 rotate-45 border border-nier-border/70" />
}

/** The link button for `field`: nothing where there's nothing to link it to. */
export function LinkButton({ field }: { field: keyof Trace }) {
  const linking = useContext(ValueLinkContext)
  const { t } = useTranslation()
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  // A popover: in the top layer over the panel, closed by a press elsewhere or Escape.
  useLayoutEffect(() => { menu.current?.setAttribute('popover', 'auto') })
  useEffect(() => {
    const el = menu.current
    if (!el) return
    const toggled = (event: Event) => setOpen((event as ToggleEvent).newState === 'open')
    el.addEventListener('toggle', toggled)
    return () => el.removeEventListener('toggle', toggled)
  }, [linking])
  // Its Escape is the menu's, not the panel's under it.
  useEffect(() => {
    if (!open) return
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopImmediatePropagation()
      menu.current?.hidePopover()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [open])
  if (!linking || !isLinkable(field)) return null

  const ids = linking.traces.map(trace => trace.valueLinks?.[field] ?? null)
  const linked = ids[0] && ids.every(id => id === ids[0]) ? linking.values.find(v => v.id === ids[0]) ?? null : null
  const anyLinked = ids.some(Boolean)
  const choices = linking.values.filter(value => fits(field, value.kind))
  const show = () => {
    const el = menu.current, at = button.current?.getBoundingClientRect()
    if (!el || !at) return
    el.style.left = `${Math.max(8, Math.min(at.right - 224, innerWidth - 232))}px`
    el.style.top = `${Math.min(at.bottom + 4, innerHeight - 40)}px`
    el.showPopover()
  }
  const done = (changes: Change[], values?: TemplateValue[]) => { linking.change(changes, values); menu.current?.hidePopover() }
  const makeNew = () => {
    const made = linkAsNew(linking.traces, field, freshName(linking.values, t(KIND_NAME[kindFor(field)])), crypto.randomUUID())
    if (made) done(made.changes, [...linking.values, made.value])
  }
  const label = linked ? t('templates.linkedTo', { name: linked.name }) : t('templates.link')
  return (
    <>
      <button
        ref={button}
        type="button"
        data-value-link={field}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => (open ? menu.current?.hidePopover() : show())}
        className={`w-7 h-7 shrink-0 flex items-center justify-center border transition-colors ${anyLinked ? 'border-nier-border/60 text-nier-strong bg-nier-bg/10' : 'border-transparent text-nier-bg/50 hover:text-nier-strong hover:border-nier-border/40'}`}
      >
        {CHAIN}
      </button>
      <div
        ref={menu}
        role="menu"
        data-value-menu={field}
        className="fixed m-0 inset-auto w-56 p-0 bg-nier-blackLight border border-nier-border/50 text-nier-bg shadow-[0_16px_32px_-18px_rgba(0,0,0,0.8)]"
      >
        <span className="block px-2.5 pt-2 pb-1 text-[9px] tracking-[0.2em] uppercase text-nier-bg/50">{t('templates.link')}</span>
        {choices.map(value => {
          const held = valueNow(linking.members, value)
          return (
            <button key={value.id} type="button" role="menuitem" data-value-choice={value.id} onClick={() => done(linkTo(linking.traces, field, value, held))} className={`${ITEM} ${linked?.id === value.id ? 'text-nier-strong' : ''}`}>
              <Swatch value={value} held={held} />
              <span className="truncate">{value.name}</span>
              <code className="ml-auto text-[10px] text-nier-bg/50 truncate max-w-[6rem]">{format(value.kind, held)}</code>
            </button>
          )
        })}
        <button type="button" role="menuitem" data-value-new="" onClick={makeNew} className={`${ITEM} border-t border-nier-border/20`}>
          + {linking.traces.length > 1 ? t('templates.linkThese', { n: linking.traces.length }) : t('templates.newFromThis')}
        </button>
        {anyLinked && (
          <button type="button" role="menuitem" data-value-unlink="" onClick={() => done(unlink(linking.traces, field))} className={ITEM}>
            {t('templates.unlink')}
          </button>
        )}
      </div>
    </>
  )
}

/** The words of a text, for its link button: shown as a row of their own only
 *  where there are values to show in them. */
export function WordsLinkRow({ label }: { label: string }) {
  const linking = useContext(ValueLinkContext)
  const { t } = useTranslation()
  if (!linking) return null
  const ids = linking.traces.map(trace => trace.valueLinks?.content ?? null)
  const linked = ids[0] && ids.every(id => id === ids[0]) ? linking.values.find(v => v.id === ids[0]) : undefined
  return (
    <div className="flex items-center gap-3 min-h-8">
      <span className="w-[5.75rem] shrink-0 text-nier-bg/70 text-[11px] tracking-[0.06em] leading-tight">{label}</span>
      <span className="flex-1 min-w-0 truncate text-[11px] text-nier-bg/60">{linked ? t('templates.showsValue', { name: linked.name }) : t('templates.wordsOwn')}</span>
      <LinkButton field="content" />
    </div>
  )
}

/** The values of the group the panel's traces are in, each set for all it's linked to. */
export function ValuesSection() {
  const linking = useContext(ValueLinkContext)
  const { t } = useTranslation()
  if (!linking || linking.values.length === 0) return null
  return (
    <Section id="values" title={t('templates.values')} summary={String(linking.values.length)}>
      <div className="space-y-1.5" data-values="">
        {linking.values.map(value => <ValueRow key={value.id} linking={linking} value={value} />)}
      </div>
      <ThreadsSwitch linking={linking} />
    </Section>
  )
}

// "Show links", wherever the values are listed: one switch, the same everywhere.
function ThreadsSwitch({ linking }: { linking: ValueLinking }) {
  const { t } = useTranslation()
  return <div className="pt-2"><Switch testId="value-threads" label={t('templates.showLinks')} hint={t('templates.showLinksHint')} on={linking.threads} onChange={linking.showThreads} /></div>
}

function ValueRow({ linking, value }: { linking: ValueLinking; value: TemplateValue }) {
  const { t } = useTranslation()
  const held = valueNow(linking.members, value)
  const uses = usesOf(linking.members, value.id)
  const [name, setName] = useState(value.name)
  useEffect(() => setName(value.name), [value.name])
  const others = linking.values.filter(v => v.id !== value.id)
  const set = (next: Held) => {
    // Linked to nothing, it holds it itself.
    linking.change(holdEverywhere(linking.members, value, next), uses === 0 ? linking.values.map(v => (v.id === value.id ? { ...v, value: next } : v)) : undefined)
  }
  const rename = () => {
    const wanted = name.trim()
    if (!wanted || wanted === value.name) return setName(value.name)
    linking.change([], linking.values.map(v => (v.id === value.id ? { ...v, name: freshName(others, wanted) } : v)))
  }
  const field = 'h-7 min-w-0 bg-nier-black text-nier-bg border border-nier-border/30 px-1.5 font-mono text-[11px] focus:outline-none focus:border-nier-border/60'
  return (
    <div data-value={value.id} className="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-center gap-1.5">
      <div className="min-w-0">
        <input
          value={name}
          aria-label={t('templates.valueName')}
          onChange={e => setName(e.target.value)}
          onBlur={rename}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          className="w-full bg-transparent text-nier-strong text-[11px] border-b border-transparent hover:border-nier-border/30 focus:border-nier-border/60 focus:outline-none"
        />
        <span className="block text-[9px] text-nier-bg/50">{t(KIND_NAME[value.kind])} · {tCount('templates.uses', uses)}</span>
      </div>
      <ValueEditor value={value} held={held} fonts={linking.fonts} onSet={set} className={field} />
      <button
        type="button"
        data-value-delete={value.id}
        aria-label={t('templates.deleteValue', { name: value.name })}
        title={t('templates.deleteValue', { name: value.name })}
        onClick={() => linking.change(forget(linking.members, value.id), others)}
        className="w-6 h-7 flex items-center justify-center text-nier-bg/50 hover:text-nier-strong"
      >
        ×
      </button>
    </div>
  )
}

// What sets a value, by its kind. Words are set once they read as one.
function ValueEditor({ value, held, fonts, onSet, className }: { value: TemplateValue; held: Held; fonts: ValueLinking['fonts']; onSet: (held: Held) => void; className: string }) {
  const [draft, setDraft] = useState(format(value.kind, held))
  useEffect(() => setDraft(format(value.kind, held)), [value.kind, held])
  if (value.kind === 'toggle') {
    return <input type="checkbox" aria-label={value.name} checked={!!held} onChange={e => onSet(e.target.checked)} className="justify-self-start accent-current" />
  }
  if (value.kind === 'font') {
    return (
      <select aria-label={value.name} value={String(held)} onChange={e => onSet(e.target.value)} className={className}>
        {fonts.map(font => <option key={font.value} value={font.value}>{font.label}</option>)}
      </select>
    )
  }
  const commit = () => {
    const read = parse(value.kind, draft)
    if (read === null) setDraft(format(value.kind, held))
    else if (read !== held) onSet(read)
  }
  return (
    <div className="flex items-center gap-1 min-w-0">
      {value.kind === 'colour' && (
        <input type="color" aria-label={value.name} value={String(held)} onChange={e => onSet(e.target.value)} className="w-7 h-7 shrink-0 p-0 border border-nier-border/40 bg-transparent cursor-pointer" />
      )}
      <input
        value={draft}
        aria-label={value.name}
        data-value-input={value.id}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        className={`${className} w-full ${parse(value.kind, draft) === null ? 'border-red-400/70' : ''}`}
      />
    </div>
  )
}

// A new value's start, by kind, made from the column with nothing to take it from.
const NEW_VALUE: Record<ValueKind, Held> = { colour: '#e8c15a', font: 'sans', number: 16, text: '', toggle: true }
const KINDS: ValueKind[] = ['colour', 'font', 'number', 'text', 'toggle']

/** The template editor's column (TemplateWorkshop): every value the template has,
 *  set and named here, and new ones made -- linked from each setting's link button. */
export function TemplateColumn({ slots, onSlot, onSelectSlot }: {
  slots: { id: string; name: string; fit: 'fill' | 'fit' | 'stretch'; filled: boolean }[]
  onSlot?: () => void
  onSelectSlot: (id: string) => void
}) {
  const linking = useContext(ValueLinkContext)
  const { t } = useTranslation()
  if (!linking) return null
  const FIT_NAME = { fill: 'templates.slotFill', fit: 'templates.slotFitWhole', stretch: 'templates.slotStretch' } as const
  const add = (kind: ValueKind) => linking.change([], [...linking.values, { id: crypto.randomUUID(), name: freshName(linking.values, t(KIND_NAME[kind])), kind, value: NEW_VALUE[kind] }])
  return (
    <aside
      data-template-column=""
      data-ui-element="true"
      className="fixed right-4 top-[4.25rem] bottom-16 w-[19rem] z-[9990] flex flex-col border border-nier-border/40 font-mono pointer-events-auto shadow-[0_10px_28px_rgba(0,0,0,0.45)] panel-in-right"
      style={{ backgroundColor: 'rgb(var(--c-ground) / 0.97)' }}
      onWheel={e => e.stopPropagation()}
    >
      <div className="shrink-0 px-3.5 pt-3 pb-2 border-b border-nier-border/25">
        <h2 className="text-nier-strong text-[11px] tracking-[0.2em] uppercase">◇ {t('templates.values')}</h2>
        <div className="mt-2 flex flex-wrap gap-1" aria-label={t('templates.newValue')}>
          {KINDS.map(kind => (
            <button key={kind} type="button" data-value-add={kind} onClick={() => add(kind)} className="px-1.5 py-0.5 border border-nier-border/30 text-[10px] text-nier-bg/75 hover:text-nier-strong hover:border-nier-border/60 transition-colors">
              + {t(KIND_NAME[kind])}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3.5 py-3 space-y-2" data-values="">
        {linking.values.map(value => <ValueRow key={value.id} linking={linking} value={value} />)}
        <p className="text-[11px] leading-relaxed text-nier-bg/55">{t('templates.columnHint')}</p>
        <ThreadsSwitch linking={linking} />
      </div>
      <div className="shrink-0 px-3.5 py-3 border-t border-nier-border/25 space-y-2" data-template-slots="">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-nier-strong text-[11px] tracking-[0.2em] uppercase">◫ {t('templates.slots')}</h2>
          {onSlot && <button type="button" data-slot-add="" onClick={onSlot} className="px-1.5 py-0.5 border border-nier-border/30 text-[10px] text-nier-bg/75 hover:text-nier-strong hover:border-nier-border/60 transition-colors">+ {t('templates.slot')}</button>}
        </div>
        {slots.map(slot => (
          <button key={slot.id} type="button" data-slot={slot.id} onClick={() => onSelectSlot(slot.id)} className="w-full flex items-center justify-between gap-2 px-2 py-1.5 border border-dashed border-nier-border/40 hover:border-nier-border/70 text-left">
            <span className="min-w-0 truncate text-[11px] text-nier-strong">{slot.name}</span>
            <span className="shrink-0 text-[10px] text-nier-bg/55">{t(FIT_NAME[slot.fit])}{slot.filled ? '' : ` · ${t('templates.slotEmpty')}`}</span>
          </button>
        ))}
        <p className="text-[11px] leading-relaxed text-nier-bg/55">{t('templates.slotsHint')}</p>
      </div>
    </aside>
  )
}
