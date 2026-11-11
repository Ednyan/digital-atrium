# The documentation

Written 2026-10-30, from the app's own text (`src/locales/en.ts`) and code, so it
lists what's really there. [arranging/frames.md](arranging/frames.md) is the first
article and the model for the rest.

## How it's organized

Three levels: **section > topic > article**. Each section is a folder, each
article a file: `docs/help/<section>/<id>.md`. The tree below is the one list of
what exists and where it goes; the help search and the AI both follow it.

Articles ship with the app, for the help search. They're translated
once the English has settled: 60 articles in 11 languages isn't worth doing twice.

## How to write an article

**Straight to the point.** People come for the information. Professional and
plain: no praise for the tool, no scene-setting, no "powerful" or "seamlessly".
If a sentence doesn't help someone do the thing, cut it.

**As visual as possible, and never vague.** A picture for every concept and a table
when there are choices. Under each picture, the exact steps and what happens. After
reading, someone must be able to do it without guessing.

- Open with one or two sentences saying what it is, then a picture.
- Steps by what the person wants ("A frame around traces you've placed"), not by
  menu.
- On-screen names exactly as in `en.ts`, in bold. Keys in bold too.
- Say what surprises: what gets resized, what stays behind.
- Real screenshots and small diagrams, in `images/`, named `<id>-<what>.png`.
- Every claim tried in the running app first. Notes go out of date: Frames'
  key was 8, not the 9 they said.

**Written for the AI too**, since AI answers will be built on these:

- **Front matter on every article:** `id`, `title`, `section`, `summary` (one
  sentence), `keywords` (including the words people would search for, not only
  ours), `where`, `works_on`, `related` (ids), `video`.
- **Good to know** lists the limits. It's how search and the AI can say something
  isn't possible, rather than guess.
- **Related** links each article to its neighbours and says why you'd go there,
  and when to use one over the other. A link to an article not written yet is fine.
- One topic in one place: link to it rather than explaining it twice.

## The tree

**Video** marks what's hard to explain without seeing it. **Order 1** is written
first. Web and Desktop mean only there; no mark means both.

### 1. Getting started (`getting-started/`)

| Article | Covers | Order | Video |
|---|---|---|---|
| [`what-is-an-atrium`](getting-started/what-is-an-atrium.md) | **Written.** Atriums, traces, how the pieces fit | 1 | Yes |
| [`first-atrium`](getting-started/first-atrium.md) | **Written.** Make one, bring things in, arrange, share | 1 | Yes |
| [`where-atriums-live`](getting-started/where-atriums-live.md) | **Written.** This browser, the Atrium's cloud, Google Drive, the desktop vault; differences, limits | 1 | |
| [`accounts`](getting-started/accounts.md) | **Written.** Email, Google, no account; username against display name; passwords; desktop | 2 | |
| [`atrium-browser`](getting-started/atrium-browser.md) | **Written.** Its parts, finding and opening, a card and its menu, Join by ID | 2 | |
| `web-or-desktop` | What each does, moving between them | 2 | |
| `install-desktop` | Windows, macOS, Linux; first-launch warnings; updates | 2 | |

### 2. Moving around (`moving-around/`)

| Article | Covers | Order | Video |
|---|---|---|---|
| [`moving-around`](moving-around/moving-around.md) | **Written.** Pan, zoom, Move the view (H), recenter (Shift+1), 100% (0), coordinates | 1 | Yes |
| [`keyboard-shortcuts`](moving-around/keyboard-shortcuts.md) | **Written.** Every key, one page | 1 | |
| `minimap-and-view` | Minimap, off-screen arrows, fade at the edge, hide UI, fullscreen | 3 | |
| [`locations-and-presenting`](moving-around/locations-and-presenting.md) | **Written.** Saved views, locking, presentation mode, export as slides or web page | 2 | Yes |
| `phones-and-tablets` | The bar along the foot, what changes with touch | 3 | |

### 3. Bringing things in (`bringing-things-in/`)

**3.1 The tools**

| Article | Covers | Order | Video |
|---|---|---|---|
| [`quick-bar`](bringing-things-in/quick-bar.md) | **Written.** The tools, armed or instant, reorder it, More | 1 | Yes |
| [`drop-and-paste`](bringing-things-in/drop-and-paste.md) | **Written.** Files, links, the clipboard; several at once; square or circle layout | 1 | Yes |
| [`templates`](bringing-things-in/templates.md) | **Written.** The sidebar, placing one, slots, values and rules, making your own (Save as Template, the editor, folders, limits), quick slots | 1 | |

**3.2 Words, shapes and drawing**

| Article | Covers | Order | Video |
|---|---|---|---|
| [`text`](bringing-things-in/text.md) | **Written.** Box or plain, sizing, fonts, alignment, inline editing | 1 | |
| [`shapes`](bringing-things-in/shapes.md) | **Written.** The five shapes, fill, outline, corners, a label | 2 | |
| [`paths-and-arrows`](bringing-things-in/paths-and-arrows.md) | **Written.** Drawing, points, elbows, arrowheads, Shift to snap to a border | 2 | Yes |
| [`drawing`](bringing-things-in/drawing.md) | **Written.** Brushes, eraser, your own brushes, Edit Drawing, Split into Strokes, Rasterize | 2 | Yes |

**3.3 Pictures and media**

| Article | Covers | Order | Video |
|---|---|---|---|
| [`pictures`](bringing-things-in/pictures.md) | **Written.** Formats, GIFs, crop, flip, reset | 1 | |
| `exr-grading` | View transform, colour space, exposure, presets, LUTs | 3 | Yes |
| `video-and-sound` | Files and YouTube/Vimeo; controls; spatial sound; sound bars | 2 | |
| [`embeds-and-links`](bringing-things-in/embeds-and-links.md) | **Written.** Pasting links, several at once, interaction on and off, iframes, what can't be framed, Convert to Image | 1 | |

**3.4 Documents and data**

| Article | Covers | Order | Video |
|---|---|---|---|
| `pdf-and-slides` | Paging, Extract Pages, PowerPoint | 2 | |
| `spreadsheets-and-charts` | Reading, editing cells, charts | 2 | Yes |
| [`live-files`](bringing-things-in/live-files.md) | **Written.** Desktop. What follows its file, seeing it, stopping | 3 | |

**3.5 From elsewhere**

| Article | Covers | Order | Video |
|---|---|---|---|
| `pinterest-import` | Connecting, importing a board; pins read from Pinterest each time (never kept, cropped, recoloured or exported); the mark, always shown; secret boards; disconnecting | 2 | |
| `browser-extension` | Installing it, sending things to the atrium | 3 | |

### 4. Arranging (`arranging/`)

**4.1 Selecting and moving**

| Article | Covers | Order | Video |
|---|---|---|---|
| [`selecting`](arranging/selecting.md) | **Written.** Select, direct select, area, lasso, Shift and Ctrl, Select submenu | 1 | Yes |
| [`move-resize-rotate`](arranging/move-resize-rotate.md) | **Written.** Handles, grid snap, snap angles, Reset Rotation and Aspect | 1 | |
| `copy-duplicate-delete` | Copy, paste, duplicate, between atriums, ask before deleting | 2 | |
| [`undo-and-saving`](arranging/undo-and-saving.md) | **Written.** Undo depth, Save, Don't Save, Auto-save, leaving with changes | 1 | |

**4.2 Organizing**

| Article | Covers | Order | Video |
|---|---|---|---|
| [`frames`](arranging/frames.md) | **Written.** | 1 | Yes |
| [`groups-and-layers`](arranging/groups-and-layers.md) | **Written.** The Layers panel, groups, Move to Group, lock, go to | 1 | Yes |
| `stacking-order` | What's on top and how to change it | 2 | |
| `tidying-up` | Reorganize Selected, rectangular or rounded | 3 | |

**4.3 Connecting**

| Article | Covers | Order | Video |
|---|---|---|---|
| [`connections`](arranging/connections.md) | **Written.** Threads: making, label, line style, arrows, ends | 2 | Yes |
| `clickable-traces` | Clickable, the link, the hover button to turn it off | 3 | |

### 5. Making it look right (`making-it-look-right/`)

| Article | Covers | Order | Video |
|---|---|---|---|
| [`customization-panel`](making-it-look-right/customization-panel.md) | **Written.** Sections and switches, quick presets, your own footer buttons, Batch Edit | 1 | Yes |
| `batch-edit` | Changing many at once, mixed values | 2 | |
| [`colours-and-palette`](making-it-look-right/colours-and-palette.md) | **Written.** Your palette, I to take a colour, copy and paste style | 2 | |
| `light-glow-effects` | Light, emit from, pulse, soft shadow, Colour (look) | 3 | Yes |
| `atrium-themes` | Presets, your own, grid, particles, background picture, parallax, ground | 2 | Yes |

### 6. Working together (`working-together/`)

| Article | Covers | Order | Video |
|---|---|---|---|
| [`sharing`](working-together/sharing.md) | **Written.** Adding people, the invite link, asking to join; why browser and desktop atriums can't be linked | 1 | |
| [`people-and-roles`](working-together/people-and-roles.md) | **Written.** Owner, admin, editor, viewer; adding, removing, blocking; asking to join; kicking | 2 | |
| [`public-atriums`](working-together/public-atriums.md) | **Written.** Making one public, finding them, view only, reporting | 2 | |
| [`drive-atriums`](working-together/drive-atriums.md) | **Written.** Making one, members, bringing back deleted traces, leaving or deleting, the Drive connection | 2 | |
| `live-together` | Cursors, name tags, laser, Hide My IP | 3 | Yes |

### 7. Keeping and moving (`keeping-and-moving/`)

| Article | Covers | Order | Video |
|---|---|---|---|
| [`export`](keeping-and-moving/export.md) | **Written.** .atrium, PNG, SVG, web page; selection or whole | 2 | |
| [`import`](keeping-and-moving/import.md) | **Written.** A new atrium or into this one; what can't come along | 2 | |
| [`storage-and-limits`](keeping-and-moving/storage-and-limits.md) | **Written.** Usage, what counts, making room, a full Drive | 1 | |
| [`moving-atriums`](keeping-and-moving/moving-atriums.md) | **Written.** Keep in Google Drive, Move to my Drive, Put online, offline copy, atriums from the old cloud | 2 | |
| [`desktop-vault`](keeping-and-moving/desktop-vault.md) | **Written.** Desktop. Where it is, Change Folder, backups, Restore From Vault, Store Embeds Locally | 2 | |
| [`overlay-mode`](keeping-and-moving/overlay-mode.md) | **Written.** Desktop. On top, click-through, see-through, hide menus, the ways out | 2 | Yes |

### 8. Your account and settings (`account-and-settings/`)

| Article | Covers | Order | Video |
|---|---|---|---|
| `preferences` | User Preferences, one by one: how you work, moving, seeing, sound, animations | 2 | |
| `profile-and-account` | Name, cursor colour, password, signing in on desktop, delete account | 3 | |
| `language-and-theme` | The 11 languages, light and dark | 3 | |

### 9. Help and support (`help-and-support/`)

| Article | Covers | Order | Video |
|---|---|---|---|
| [`report-or-suggest`](help-and-support/report-or-suggest.md) | **Written.** Reporting a problem, suggesting a feature | 1 | |
| `when-something-breaks` | Won't load, a missing file, an embed refuses, can't save, can't sign in | 2 | |
| `supporting-the-atrium` | Donating, monthly, the contributors wall | 3 | |

## Left out on purpose

Developers' tools, Health, bans, the names panel: only the operator sees them.
