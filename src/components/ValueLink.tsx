// Linking settings to their group's values (lib/templateValues), in the
// Customization panel: the link button beside each setting that can be linked
// (Row's `link`), and the Values section, where each value is set for every
// trace linked to it. Given by TraceOverlay for the traces the panel edits, to
// developers only until the plans exist (docs/IDEAS.md, "Making your own").

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { tCount, useTranslation } from '../lib/i18n'
import type { TranslationKey } from '../locales/en'
import {
  canFollow, fits, format, freshName, isLinkable, kindFor, linkAsNew, linkTo, parse, removeValue, RULES, rulesFor, setRule, setValue,
  unlink, usesOf, valueNow, type Change, type Held, type Rule, type RuleOp, type TemplateValue, type ValueKind,
} from '../lib/templateValues'
import type { Layer, Trace } from '../types/database'
import { Section, Switch } from './Customization'
import { ColourInput } from './ColourPicker'

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
  // In the template editor: values made here, at the top of a trace's panel.
  making?: boolean
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
const RULE_NAME: Record<RuleOp, TranslationKey> = {
  lighter: 'templates.rule.lighter', darker: 'templates.rule.darker', readable: 'templates.rule.readable',
  times: 'templates.rule.times', plus: 'templates.rule.plus', capitals: 'templates.rule.capitals', opposite: 'templates.rule.opposite',
}
// What a rule's amount is shown with.
const RULE_UNIT: Partial<Record<RuleOp, string>> = { lighter: '%', darker: '%', times: '×', plus: '+' }

// A value with a rule whose value it follows is still there.
const ruled = (values: TemplateValue[], value: TemplateValue | undefined) => !!value?.rule && values.some(v => v.id === value.rule!.from)

/** A setting (`field`) of the panel's traces, as it's set: where it's linked to a
 *  value that follows a rule, its rule sets it, and it's shown so, not to be set by hand. */
export function RuledField({ field, children }: { field?: keyof Trace; children: ReactNode }) {
  const linking = useContext(ValueLinkContext)
  const { t } = useTranslation()
  if (!linking || !field || !isLinkable(field)) return <>{children}</>
  const ids = linking.traces.map(trace => trace.valueLinks?.[field])
  const value = ids[0] && ids.every(id => id === ids[0]) ? linking.values.find(v => v.id === ids[0]) : undefined
  if (!value || !ruled(linking.values, value)) return <>{children}</>
  return <fieldset disabled data-ruled={field} title={t('templates.ruled', { name: value.name })} className="min-w-0 m-0 p-0 border-0 opacity-50">{children}</fieldset>
}

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
          const held = valueNow(linking.members, value, linking.values)
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
// The values, at the top of a trace's panel -- in the template editor with new
// ones made there too (the user's, 2026-11-06: a panel of its own for them
// only confused), each then given to a setting by the link button beside it.
export function ValuesSection() {
  const linking = useContext(ValueLinkContext)
  const { t } = useTranslation()
  if (!linking || (linking.values.length === 0 && !linking.making)) return null
  const add = (kind: ValueKind) => linking.change([], [...linking.values, { id: crypto.randomUUID(), name: freshName(linking.values, t(KIND_NAME[kind])), kind, value: NEW_VALUE[kind] }])
  return (
    <Section id="values" title={t('templates.values')} summary={String(linking.values.length)}>
      {linking.making && (
        <div className="flex flex-wrap gap-1" role="group" aria-label={t('templates.newValue')}>
          {KINDS.map(kind => (
            <button key={kind} type="button" data-value-add={kind} onClick={() => add(kind)} className="px-1.5 py-0.5 border border-nier-border/30 text-[10px] text-nier-bg/75 hover:text-nier-strong hover:border-nier-border/60 transition-colors">
              + {t(KIND_NAME[kind])}
            </button>
          ))}
        </div>
      )}
      {linking.values.length > 0 && (
        <div className="space-y-1.5" data-values="">
          {linking.values.map(value => <ValueRow key={value.id} linking={linking} value={value} />)}
        </div>
      )}
      {linking.making && linking.values.length === 0 && <p className="text-[11px] leading-relaxed text-nier-bg/55">{t('templates.emptyValues')}</p>}
      {linking.values.length > 0 && <ThreadsSwitch linking={linking} />}
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
  const held = valueNow(linking.members, value, linking.values)
  const uses = usesOf(linking.members, value.id)
  const [name, setName] = useState(value.name)
  useEffect(() => setName(value.name), [value.name])
  const others = linking.values.filter(v => v.id !== value.id)
  const set = (next: Held) => {
    const out = setValue(linking.members, linking.values, value, next)
    linking.change(out.changes, out.values)
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
      <ValueEditor value={value} held={held} fonts={linking.fonts} onSet={set} className={field} ruled={ruled(linking.values, value)} />
      <button
        type="button"
        data-value-delete={value.id}
        aria-label={t('templates.deleteValue', { name: value.name })}
        title={t('templates.deleteValue', { name: value.name })}
        onClick={() => { const out = removeValue(linking.members, linking.values, value.id); linking.change(out.changes, out.values) }}
        className="w-6 h-7 flex items-center justify-center text-nier-bg/50 hover:text-nier-strong"
      >
        ×
      </button>
      <RuleLine linking={linking} value={value} />
    </div>
  )
}

// A value's rule, under it: what it follows and how, picked from lists -- or the
// way to give it one, where there's another value of its kind to follow.
function RuleLine({ linking, value }: { linking: ValueLinking; value: TemplateValue }) {
  const { t } = useTranslation()
  const ops = rulesFor(value.kind)
  const sources = linking.values.filter(v => canFollow(linking.values, value.id, v.id))
  const rule = ruled(linking.values, value) ? value.rule! : null
  const put = (next: Rule | null) => {
    const out = setRule(linking.members, linking.values, value.id, next)
    linking.change(out.changes, out.values)
  }
  if (ops.length === 0 || sources.length === 0) return null
  if (!rule) {
    return (
      <button type="button" data-value-follow={value.id} onClick={() => put({ from: sources[0].id, op: ops[0], amount: RULES[ops[0]].amount })} className="col-span-3 justify-self-start -mt-1 text-[10px] text-nier-bg/50 hover:text-nier-strong">
        + {t('templates.follow')}
      </button>
    )
  }
  const small = 'h-6 min-w-0 bg-nier-black text-nier-bg border border-nier-border/30 px-1 text-[10px] focus:outline-none focus:border-nier-border/60'
  const unit = RULE_UNIT[rule.op]
  return (
    <div data-value-rule={value.id} className="col-span-3 -mt-1 flex items-center gap-1 pl-1">
      <span aria-hidden="true" className="shrink-0 text-nier-bg/45 text-[11px]">↳</span>
      {ops.length > 1 && (
        <select aria-label={t('templates.ruleOf')} data-rule-op="" value={rule.op} onChange={e => { const op = e.target.value as RuleOp; put({ ...rule, op, amount: RULES[op].amount }) }} className={`${small} shrink-0`}>
          {ops.map(op => <option key={op} value={op}>{t(RULE_NAME[op])}</option>)}
        </select>
      )}
      {ops.length === 1 && <span className="shrink-0 text-[10px] text-nier-bg/70">{t(RULE_NAME[rule.op])}</span>}
      <select aria-label={t('templates.ruleFrom')} data-rule-from="" value={rule.from} onChange={e => put({ ...rule, from: e.target.value })} className={`${small} flex-1`}>
        {sources.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
      </select>
      {unit && <RuleAmount unit={unit} amount={rule.amount ?? RULES[rule.op].amount ?? 0} percent={unit === '%'} onCommit={amount => put({ ...rule, amount })} className={small} />}
      <button type="button" data-value-unrule={value.id} aria-label={t('templates.unrule')} title={t('templates.unrule')} onClick={() => put(null)} className="w-5 h-6 shrink-0 text-nier-bg/50 hover:text-nier-strong">×</button>
    </div>
  )
}

// A rule's amount, set once typed (a half-typed number changes nothing).
function RuleAmount({ unit, amount, percent, onCommit, className }: { unit: string; amount: number; percent: boolean; onCommit: (amount: number) => void; className: string }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(String(amount))
  useEffect(() => setDraft(String(amount)), [amount])
  const commit = () => {
    const read = parse('number', draft)
    if (read === null) return setDraft(String(amount))
    const next = percent ? Math.max(0, Math.min(100, Number(read))) : Number(read)
    if (next !== amount) onCommit(next)
    else setDraft(String(amount))
  }
  return (
    <label className="shrink-0 flex items-center gap-0.5 text-[10px] text-nier-bg/60">
      {unit !== '%' && <span aria-hidden="true">{unit}</span>}
      <input value={draft} aria-label={t('templates.ruleAmount')} data-rule-amount="" inputMode="decimal" onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} className={`${className} w-10 text-right tabular-nums`} />
      {unit === '%' && <span aria-hidden="true">%</span>}
    </label>
  )
}

// What sets a value, by its kind. Words are set once they read as one. A
// value following a rule shows what it makes, not to be set by hand.
function ValueEditor({ value, held, fonts, onSet, className, ruled }: { value: TemplateValue; held: Held; fonts: ValueLinking['fonts']; onSet: (held: Held) => void; className: string; ruled: boolean }) {
  const [draft, setDraft] = useState(format(value.kind, held))
  useEffect(() => setDraft(format(value.kind, held)), [value.kind, held])
  if (value.kind === 'toggle') {
    return <input type="checkbox" aria-label={value.name} checked={!!held} disabled={ruled} onChange={e => onSet(e.target.checked)} className="justify-self-start accent-current disabled:opacity-60" />
  }
  if (value.kind === 'font') {
    return (
      <select aria-label={value.name} value={String(held)} disabled={ruled} onChange={e => onSet(e.target.value)} className={className}>
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
        <ColourInput label={value.name} value={String(held)} onChange={onSet} disabled={ruled} className="w-7 h-7 shrink-0 border border-nier-border/40 cursor-pointer disabled:cursor-default" />
      )}
      <input
        value={draft}
        aria-label={value.name}
        data-value-input={value.id}
        readOnly={ruled}
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

