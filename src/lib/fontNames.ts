// The fonts every trace can have, by the value kept and the name shown -- the
// Customization panel's list (with the ones bundled, lib/customFonts) and a font
// value's words (lib/templateValues): "Serif" shown, "serif" kept.

export const BUILT_IN_FONTS: { value: string; label: string }[] = [
  { value: 'sans', label: 'Sans-serif' },
  { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Monospace' },
  { value: 'palatino', label: 'Palatino' },
  { value: 'garamond', label: 'Garamond' },
  { value: 'comic', label: 'Comic Sans MS' },
  { value: 'impact', label: 'Impact' },
  { value: 'cursive', label: 'Cursive' },
  { value: 'fantasy', label: 'Fantasy' },
  { value: 'system-ui', label: 'System UI' },
  // Web-safe OS fonts -- no files to bundle, just relying on what's
  // typically installed, with a real CSS fallback stack (see
  // FONT_FAMILY_CSS_MAP) unlike the single-token entries above.
  { value: 'arial', label: 'Arial' },
  { value: 'times', label: 'Times New Roman' },
  { value: 'georgia', label: 'Georgia' },
  { value: 'courier', label: 'Courier New' },
  { value: 'verdana', label: 'Verdana' },
  { value: 'tahoma', label: 'Tahoma' },
  { value: 'trebuchet', label: 'Trebuchet MS' },
  { value: 'segoe', label: 'Segoe UI' },
  { value: 'calibri', label: 'Calibri' },
  { value: 'consolas', label: 'Consolas' },
  { value: 'century-gothic', label: 'Century Gothic' },
]

/** A font's name, as shown: a built-in's own, else the value itself (a bundled font's name). */
export const fontLabel = (value: string) => BUILT_IN_FONTS.find(font => font.value === value)?.label ?? value

/** The font words name: a built-in's value by its name or value, any case; else the words. */
export function fontValue(words: string): string {
  const wanted = words.trim().toLowerCase()
  return BUILT_IN_FONTS.find(font => font.value === wanted || font.label.toLowerCase() === wanted)?.value ?? words.trim()
}
