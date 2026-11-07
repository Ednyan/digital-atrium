// Templates: an inventory beside the canvas. Folders inside folders, ready-made
// traces dragged out of them onto the canvas -- or clicked, to land in the middle
// of the view -- and a few pinned at the foot, to hand: the quick slots, kept with
// one's templates (lib/myTemplates) -- on the account signed in, on the device signed out.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from '../lib/i18n'
import { formatSize } from '../lib/size'
import { isCanvasTarget } from '../lib/editableTarget'
import { allTemplates, DIGITAL_ATRIUM_FOLDER, type TemplateContext, type TemplateFolder, type TemplateItem, type TemplateNode } from '../lib/templates'
import { panelDrop } from '../lib/panelDrop'
import type { AtriumFile } from '../lib/atriumFormat'
import {
  deleteFolder, forgetTemplate, isWithin, makeFolder, MINE, moveFolder, moveTemplate, MOST_QUICK, renameFolder, setQuickSlots,
  templateFile, templatePicture, useMyFolders, useMyTemplates, useQuickSlots, type MyTemplate,
} from '../lib/myTemplates'

const DRAG_PX = 4
// One's own folder (lib/myTemplates), among the panel's folders: by its id with this before it.
const FOLDER = 'myfolder:'

// The template as a little plan of itself.
function Thumb({ file, size = 44 }: { file: AtriumFile; size?: number }) {
  const rows = file.traces as any[]
  const left = Math.min(...rows.map(r => r.position_x - r.width / 2)), right = Math.max(...rows.map(r => r.position_x + r.width / 2))
  const top = Math.min(...rows.map(r => r.position_y - r.height / 2)), bottom = Math.max(...rows.map(r => r.position_y + r.height / 2))
  const pad = Math.max(right - left, bottom - top) * 0.04
  return (
    <svg width={size} height={size * 0.72} viewBox={`${left - pad} ${top - pad} ${right - left + pad * 2} ${bottom - top + pad * 2}`} aria-hidden="true" className="shrink-0 text-nier-bg">
      {rows.map((r, i) => {
        const shape = r.type === 'shape'
        const wordsAlone = r.type === 'text' && !r.show_background
        if (wordsAlone) return <rect key={i} x={r.position_x - r.width * 0.3} y={r.position_y - r.height * 0.12} width={r.width * 0.6} height={r.height * 0.24} fill="currentColor" opacity={0.45} />
        return (
          <rect
            key={i}
            x={r.position_x - r.width / 2} y={r.position_y - r.height / 2} width={r.width} height={r.height}
            fill={shape ? r.shape_color : r.type === 'text' ? 'currentColor' : 'none'}
            fillOpacity={shape ? 1 : 0.25}
            stroke={shape ? 'none' : 'currentColor'}
            strokeWidth={Math.max(right - left, bottom - top) * 0.012}
            vectorEffect="none"
          />
        )
      })}
    </svg>
  )
}

export default function TemplatesPanel({ context, onPlace, onClose, onNew, onEdit, onSaveSelection }: {
  context: TemplateContext
  // A template to place: where the pointer let go, or (none) the middle of the view.
  onPlace: (file: AtriumFile, screen?: { x: number; y: number }) => void
  onClose: () => void
  // A new one begun, or one's own changed, in the template editor (lib/workshop).
  onNew?: () => void
  onEdit?: (template: MyTemplate) => void
  // Traces carried in from the canvas, let go here: kept as a template, in the
  // folder they were let go on (none: at the top of My templates).
  onSaveSelection?: (ids: string[], folder: string | null) => void
}) {
  const { t, language } = useTranslation()
  const pins = useQuickSlots()
  // Every folder open to begin with -- one added later, one's own made, too -- till it's closed.
  const [closed, setClosed] = useState<Set<string>>(() => new Set())
  // One's own: their files and pictures read from the device as they're listed.
  const mine = useMyTemplates()
  const [mineFiles, setMineFiles] = useState(() => new Map<string, AtriumFile>())
  const [minePictures, setMinePictures] = useState(() => new Map<string, string>())
  const [deleting, setDeleting] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    for (const { id } of mine) {
      if (mineFiles.has(id)) continue
      void templateFile(id).then(file => { if (live && file) setMineFiles(now => new Map(now).set(id, file)) })
      void templatePicture(id).then(blob => { if (live && blob) setMinePictures(now => new Map(now).set(id, URL.createObjectURL(blob))) })
    }
    return () => { live = false }
  }, [mine])
  useEffect(() => () => { for (const url of minePictures.values()) URL.revokeObjectURL(url) }, [])
  const mineItems: TemplateItem[] = mine.filter(({ id }) => mineFiles.has(id)).map(({ id, name }) => ({ kind: 'template', id: MINE + id, name, build: () => mineFiles.get(id)! }))
  // One's folders, inside each other, and the templates in each. One whose folder
  // is gone (deleted on another device) is at the top.
  const folders = useMyFolders()
  const known = (id: string | null | undefined) => (id && folders.some(folder => folder.id === id) ? id : null)
  const mineTree = (parent: string | null, depth = 0): TemplateNode[] => (depth > 32 ? [] : [
    ...folders.filter(folder => known(folder.parent) === parent).sort((a, b) => a.name.localeCompare(b.name))
      .map(folder => ({ kind: 'folder' as const, id: FOLDER + folder.id, name: folder.name, items: mineTree(folder.id, depth + 1) })),
    ...mineItems.filter(item => known(mine.find(own => MINE + own.id === item.id)?.folder) === parent),
  ])
  const mineFolder: TemplateFolder = { kind: 'folder', id: 'mine', name: 'templates.mine', items: mineTree(null) }
  // A folder being named (just made, or renamed), one being deleted (asked once).
  const [renaming, setRenaming] = useState<{ id: string; draft: string } | null>(null)
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null)
  // Where what's carried -- a template, a folder, traces from the canvas -- would go: lit.
  const [dropOver, setDropOver] = useState<string | null>(null)
  const [carried, setCarried] = useState(false)
  const movedFolder = useRef(false)
  const [folderGhost, setFolderGhost] = useState<{ name: string; x: number; y: number } | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  // The folder of one's own under (x, y): its key ('mine', or one's folder's), and its
  // id (none: the top). By where the rows are, as the Layer panel finds its places --
  // what the browser says is under the pointer isn't to be trusted mid-drag from the
  // canvas -- and only where the list shows them.
  const list = useRef<HTMLDivElement>(null)
  const folderAt = (x: number, y: number): { key: string; folder: string | null } | null => {
    const inside = (r: DOMRect) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
    const shown = list.current?.getBoundingClientRect()
    if (!shown || !inside(shown)) return null
    for (const row of list.current!.querySelectorAll<HTMLElement>('[data-my-folder]')) {
      if (!inside(row.getBoundingClientRect())) continue
      const folder = row.dataset.myFolder || null
      return { key: folder ? FOLDER + folder : 'mine', folder }
    }
    return null
  }
  // Traces from the canvas, carried over the panel (lib/panelDrop): let go, kept as a template there.
  useEffect(() => {
    if (!onSaveSelection) return
    const target = {
      rect: () => panel.current?.getBoundingClientRect() ?? null,
      hover: (_ids: string[], x: number, y: number) => { setCarried(true); setDropOver(folderAt(x, y)?.key ?? 'mine') },
      drop: (ids: string[], x: number, y: number) => {
        setCarried(false)
        setDropOver(null)
        onSaveSelection(ids, folderAt(x, y)?.folder ?? null)
        return true
      },
      leave: () => { setCarried(false); setDropOver(null) },
    }
    panelDrop.current = target
    return () => { if (panelDrop.current === target) panelDrop.current = null }
  }, [onSaveSelection])
  const freshFolderName = () => {
    const base = t('templates.newFolder')
    const taken = new Set(folders.map(folder => folder.name.toLowerCase()))
    if (!taken.has(base.toLowerCase())) return base
    for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`
  }
  const newFolder = async (parent: string | null) => {
    const name = freshFolderName()
    const id = await makeFolder(name, parent)
    setClosed(now => { const next = new Set(now); next.delete(parent ? FOLDER + parent : 'mine'); return next })
    setRenaming({ id, draft: name })
  }
  const commitRename = () => {
    if (!renaming) return
    const name = renaming.draft.trim()
    if (name) void renameFolder(renaming.id, name.slice(0, 80))
    setRenaming(null)
  }
  const [ghost, setGhost] = useState<{ template: TemplateItem; x: number; y: number } | null>(null)
  // A press in the panel that may become a drag -- a template's, a folder's --
  // followed on the window till it's let go: wherever the pointer goes, whatever
  // else has it captured (a row's own capture didn't hold through the panel's
  // re-renders, and a drag over the folders was lost). A click if it never moved far.
  const pressed = useRef<{ dragging: boolean; cancel: () => void } | null>(null)
  const follow = (e: React.PointerEvent, on: { move: (x: number, y: number) => void; drop: (x: number, y: number) => void; click?: () => void; end: () => void }) => {
    if (e.button !== 0) return
    const start = { x: e.clientX, y: e.clientY }
    const finish = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', held.cancel)
      if (pressed.current === held) pressed.current = null
      on.end()
    }
    const held = { dragging: false, cancel: finish }
    const move = (ev: PointerEvent) => {
      if (!held.dragging && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_PX) return
      held.dragging = true
      on.move(ev.clientX, ev.clientY)
    }
    const up = (ev: PointerEvent) => {
      const dragged = held.dragging
      finish()
      if (dragged) on.drop(ev.clientX, ev.clientY)
      else on.click?.()
    }
    pressed.current?.cancel()
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', held.cancel)
    pressed.current = held
  }

  const nameOf = (name: string) => (name.startsWith('templates.') ? t(name as any) : name)
  // Made once for the panel: a plan of each to show.
  const files = useMemo(() => new Map(allTemplates(DIGITAL_ATRIUM_FOLDER).map(template => [template.id, template.build(context)])), [context])
  const byId = useMemo(() => new Map(allTemplates(DIGITAL_ATRIUM_FOLDER).map(template => [template.id, template])), [])
  const pinned = pins.flatMap(id => byId.get(id) ?? mineItems.find(item => item.id === id) ?? [])

  // Esc drops what's being dragged, and otherwise closes the panel.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (pressed.current?.dragging) pressed.current.cancel()
      else onClose()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [onClose])

  const togglePin = (id: string) => void setQuickSlots(pins.includes(id) ? pins.filter(pin => pin !== id) : pins.length < MOST_QUICK ? [...pins, id] : pins)

  const dragHandlers = (template: TemplateItem) => {
    const own = template.id.startsWith(MINE) ? template.id.slice(MINE.length) : null
    return {
      onPointerDown: (e: React.PointerEvent) => follow(e, {
        move: (x, y) => {
          setGhost({ template, x, y })
          // One's own, over one of one's folders: it'd go there.
          if (own) setDropOver(folderAt(x, y)?.key ?? null)
        },
        // Each drop is built anew: its ids are its own, however many are placed.
        drop: (x, y) => {
          if (isCanvasTarget(document.elementFromPoint(x, y))) { onPlace(template.build(context), { x, y }); return }
          // One's own let go on one of one's folders: moved into it.
          const into = own ? folderAt(x, y) : null
          if (own && into) void moveTemplate(own, into.folder)
        },
        click: () => onPlace(template.build(context)),
        end: () => { setGhost(null); setDropOver(null) },
      }),
    }
  }

  const thumbOf = (id: string, size?: number) => {
    const own = id.startsWith(MINE) ? id.slice(MINE.length) : null
    const picture = own && minePictures.get(own)
    // Not the browser's to drag: pressed, it's the panel's drag (an image's own carries no template).
    if (picture) return <img src={picture} alt="" draggable={false} className="shrink-0 object-contain" style={{ width: size ?? 44, height: (size ?? 44) * 0.72 }} />
    const file = own ? mineFiles.get(own) : files.get(id)
    return file ? <Thumb file={file} size={size} /> : null
  }

  const renderNode = (node: TemplateNode, depth: number) => {
    if (node.kind === 'folder') return renderFolder(node, depth)
    const pin = pins.includes(node.id)
    const own = node.id.startsWith(MINE) ? node.id.slice(MINE.length) : null
    const bytes = own ? mine.find(m => m.id === own)?.bytes : undefined
    return (
      <div key={node.id} className="group flex items-center gap-1" style={{ paddingLeft: depth * 12 }}>
        <button
          type="button"
          data-template={node.id}
          {...dragHandlers(node)}
          title={t('templates.hint')}
          className="flex-1 min-w-0 flex items-center gap-2 p-1.5 border border-transparent hover:border-nier-border/50 cursor-grab active:cursor-grabbing select-none touch-pan-y text-left transition-colors"
        >
          {thumbOf(node.id)}
          <span className="min-w-0">
            <span className="block truncate text-nier-strong text-xs">{own ? node.name : nameOf(node.name)}</span>
            {/* What one's own takes on the account -- and again in each atrium it's placed in. */}
            {bytes !== undefined && <span data-template-size={own} title={t('templates.sizeHint')} className="block text-[10px] text-nier-bg/55">{formatSize(bytes, language)}</span>}
          </span>
        </button>
        {/* One's own: changed in the editor, or let go of, asked once. */}
        {own && onEdit && (
          <button
            type="button"
            data-template-edit={own}
            aria-label={t('templates.editMine', { name: node.name })}
            title={t('templates.editMine', { name: node.name })}
            onClick={() => { const template = mine.find(m => m.id === own); if (template) onEdit(template) }}
            className="shrink-0 w-7 h-7 flex items-center justify-center text-nier-bg/70 hover:text-nier-strong opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M4 20 H8 L19 9 L15 5 L4 16 Z M13 7 L17 11" /></svg>
          </button>
        )}
        {own && (
          <button
            type="button"
            data-template-delete={own}
            aria-label={t('templates.deleteMine', { name: node.name })}
            title={t('templates.deleteMine', { name: node.name })}
            onClick={() => { if (deleting === own) { setDeleting(null); void forgetTemplate(own) } else setDeleting(own) }}
            onBlur={() => setDeleting(null)}
            className={`shrink-0 h-7 px-1.5 flex items-center justify-center text-[10px] transition-opacity ${deleting === own ? 'danger-word opacity-100' : 'text-nier-bg/70 opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100'}`}
          >
            {deleting === own ? t('common.delete') : '×'}
          </button>
        )}
        <button
          type="button"
          data-template-pin={node.id}
          aria-pressed={pin}
          aria-label={t(pin ? 'templates.unpin' : 'templates.pin')}
          title={t(pin ? 'templates.unpin' : 'templates.pin')}
          disabled={!pin && pins.length >= MOST_QUICK}
          onClick={() => togglePin(node.id)}
          className={`shrink-0 w-7 h-7 flex items-center justify-center transition-opacity disabled:hidden ${pin ? 'text-nier-strong opacity-100' : 'text-nier-bg/70 opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100'}`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={pin ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true"><path d="M9 3.5 H15 L14 9 L17 12 H7 L10 9 Z M12 12 V20.5" /></svg>
        </button>
      </div>
    )
  }

  // A folder: the Digital Atrium's, My templates, or one of one's own -- those
  // three made in, renamed, carried into another, deleted (what's in it moving up).
  const renderFolder = (folder: TemplateFolder, depth: number) => {
    const isOpen = !closed.has(folder.id)
    const ownId = folder.id.startsWith(FOLDER) ? folder.id.slice(FOLDER.length) : null
    const mineRoot = folder.id === 'mine'
    const target = mineRoot || !!ownId
    const toggle = () => setClosed(now => { const next = new Set(now); if (isOpen) next.add(folder.id); else next.delete(folder.id); return next })
    const tool = 'shrink-0 w-7 h-7 flex items-center justify-center text-nier-bg/70 hover:text-nier-strong opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity'
    const folderDrag = ownId ? {
      onPointerDown: (e: React.PointerEvent) => follow(e, {
        move: (x, y) => {
          setFolderGhost({ name: folder.name, x, y })
          setDropOver(folderAt(x, y)?.key ?? null)
        },
        drop: (x, y) => {
          // Into another of one's folders, or to the top -- never into itself.
          const into = folderAt(x, y)
          if (into && into.folder !== ownId && !(into.folder && isWithin(folders, into.folder, ownId))) void moveFolder(ownId, into.folder)
          // The click this release may make isn't a toggle -- and only that one.
          movedFolder.current = true
          window.setTimeout(() => { movedFolder.current = false })
        },
        end: () => { setFolderGhost(null); setDropOver(null) },
      }),
    } : {}
    return (
      <div key={folder.id} data-template-folder={folder.id}>
        <div
          className={`group flex items-center gap-1 ${dropOver === folder.id ? 'bg-nier-bg/15 outline outline-1 outline-nier-bg/60' : ''}`}
          style={{ paddingLeft: depth * 12 }}
          {...(target ? { 'data-my-folder': ownId ?? '' } : {})}
        >
          {renaming && renaming.id === ownId ? (
            <input
              autoFocus
              data-folder-rename={ownId}
              aria-label={t('templates.folderName')}
              value={renaming.draft}
              maxLength={80}
              onChange={e => setRenaming({ id: ownId, draft: e.target.value })}
              onBlur={commitRename}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') { e.stopPropagation(); setRenaming(null) }
              }}
              className="flex-1 min-w-0 my-1 bg-nier-black border border-nier-border/50 text-nier-strong px-1.5 py-1 text-[11px] focus:outline-none"
            />
          ) : (
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => { if (movedFolder.current) { movedFolder.current = false; return } toggle() }}
              {...folderDrag}
              className={`flex-1 min-w-0 flex items-center gap-2 py-1.5 text-left text-nier-bg/85 hover:text-nier-strong transition-colors ${ownId ? 'cursor-grab active:cursor-grabbing select-none touch-pan-y' : ''}`}
            >
              <span aria-hidden="true" className="w-3 text-[10px]">{isOpen ? '▾' : '▸'}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true"><path d="M4 5.5 H9.5 L11.5 8 H20 V18.5 H4 Z" /></svg>
              <span className={`truncate ${ownId ? 'text-[11px]' : 'text-[11px] tracking-[0.12em] uppercase'}`}>{ownId ? folder.name : nameOf(folder.name)}</span>
            </button>
          )}
          {target && (
            <button type="button" data-template-new-folder={ownId ?? ''} aria-label={t('templates.newFolder')} title={t('templates.newFolder')} onClick={() => void newFolder(ownId)} className={tool}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true"><path d="M4 5.5 H9.5 L11.5 8 H20 V18.5 H4 Z M12 10.5 V16 M9.25 13.25 H14.75" /></svg>
            </button>
          )}
          {ownId && (
            <>
              <button type="button" data-folder-rename-start={ownId} aria-label={t('templates.renameFolder', { name: folder.name })} title={t('templates.renameFolder', { name: folder.name })} onClick={() => setRenaming({ id: ownId, draft: folder.name })} className={tool}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M4 20 H8 L19 9 L15 5 L4 16 Z M13 7 L17 11" /></svg>
              </button>
              <button
                type="button"
                data-folder-delete={ownId}
                aria-label={t('templates.deleteFolder', { name: folder.name })}
                title={t('templates.deleteFolder', { name: folder.name })}
                onClick={() => { if (deletingFolder === ownId) { setDeletingFolder(null); void deleteFolder(ownId) } else setDeletingFolder(ownId) }}
                onBlur={() => setDeletingFolder(null)}
                className={`shrink-0 h-7 px-1.5 flex items-center justify-center text-[10px] transition-opacity ${deletingFolder === ownId ? 'danger-word opacity-100' : 'text-nier-bg/70 opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100'}`}
              >
                {deletingFolder === ownId ? t('common.delete') : '×'}
              </button>
            </>
          )}
        </div>
        {isOpen && folder.items.map(node => renderNode(node, depth + 1))}
      </div>
    )
  }

  return (
    <div
      ref={panel}
      data-templates-panel=""
      data-ui-element="true"
      className="layer-panel docked-panel panel-in-right fixed flex flex-col w-80 top-20 h-[calc(100vh-160px)] border-2 border-nier-bg shadow-2xl overflow-hidden font-mono"
      style={{ backgroundColor: 'rgb(var(--c-ground) / 0.98)' }}
      onWheel={e => e.stopPropagation()}
    >
      <div className="shrink-0 bg-nier-black border-b border-nier-border/40 p-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rotate-45 border border-gray-400" />
          <h2 className="text-sm text-nier-strong tracking-[0.15em] uppercase">{t('templates.title')}</h2>
        </div>
        <button type="button" data-templates-close="" onClick={onClose} aria-label={t('common.close')} className="w-7 h-7 flex items-center justify-center text-nier-bg/70 hover:text-nier-strong transition-colors">×</button>
      </div>
      <p className="shrink-0 px-3 pt-3 text-nier-bg/60 text-[11px] leading-relaxed">{t('templates.hint')}</p>
      {onNew && (
        <div className="shrink-0 px-3 pt-3">
          <button type="button" data-template-new="" onClick={onNew} className="w-full atrium-btn cut-corner justify-center">+ {t('templates.newTemplate')}</button>
        </div>
      )}
      <div className="relative flex-1 min-h-0 flex flex-col">
        <div ref={list} className="flex-1 min-h-0 overflow-y-auto p-3">
          {(onNew || mine.length > 0 || folders.length > 0) && renderFolder(mineFolder, 0)}
          {renderFolder(DIGITAL_ATRIUM_FOLDER, 0)}
        </div>
        {/* Traces from the canvas carried over: said over the list, never moving it under the pointer. */}
        {carried && (
          <p data-template-drop-hint="" className="pointer-events-none absolute left-3 right-3 bottom-2 px-2 py-1.5 border border-nier-bg text-[10px] text-nier-strong" style={{ backgroundColor: 'rgb(var(--c-ground) / 0.95)' }}>
            {t('templates.dropToSave')}
          </p>
        )}
      </div>
      {/* To hand: what's pinned, dragged or clicked as it is above. */}
      <div data-template-quick="" className="shrink-0 border-t border-nier-border/30 p-3">
        <p className="mb-2 text-nier-bg/70 text-[10px] tracking-[0.15em] uppercase">{t('templates.quick')}</p>
        {pinned.length === 0 ? (
          <p className="text-nier-bg/55 text-[11px] leading-relaxed">{t('templates.quickHint', { most: MOST_QUICK })}</p>
        ) : (
          <div className="grid grid-cols-4 gap-1">
            {pinned.map(template => (
              <button
                key={template.id}
                type="button"
                data-template-quick-item={template.id}
                {...dragHandlers(template)}
                title={nameOf(template.name)}
                aria-label={nameOf(template.name)}
                className="flex items-center justify-center p-1.5 border border-nier-border/30 hover:border-nier-bg cursor-grab active:cursor-grabbing select-none touch-none transition-colors"
              >
                {thumbOf(template.id, 48)}
              </button>
            ))}
          </div>
        )}
      </div>
      {folderGhost && (
        <div data-folder-ghost="" className="fixed z-[var(--layer-drag)] pointer-events-none px-2 py-1.5 border border-nier-bg text-nier-strong text-xs" style={{ left: folderGhost.x + 12, top: folderGhost.y + 12, backgroundColor: 'rgb(var(--c-ground) / 0.92)' }}>
          {folderGhost.name}
        </div>
      )}
      {ghost && (
        <div
          data-template-ghost=""
          className="fixed z-[var(--layer-drag)] pointer-events-none flex items-center gap-2 px-2 py-1.5 border border-nier-bg text-nier-strong text-xs"
          style={{ left: ghost.x + 12, top: ghost.y + 12, backgroundColor: 'rgb(var(--c-ground) / 0.92)' }}
        >
          {thumbOf(ghost.template.id)}
          {ghost.template.id.startsWith(MINE) ? ghost.template.name : nameOf(ghost.template.name)}
        </div>
      )}
    </div>
  )
}
