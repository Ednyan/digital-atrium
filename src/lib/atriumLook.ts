// What the Atrium's own drawings of a file share -- a chart's (lib/sheetDraw), a
// calendar's (lib/calendar): its monospace, and, on a trace's fill, the trace's
// text colour or an ink that reads on it.

export const ATRIUM_FONT = "Consolas, Monaco, 'Lucida Console', 'Liberation Mono', monospace"

export function atriumInk(fill: string | null | undefined, text: string | null | undefined): { ink: string; surface?: string } {
  const m = /^#?([0-9a-f]{6})$/i.exec(fill ?? '')
  const n = m ? parseInt(m[1], 16) : 0x191919
  const light = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.55
  const ink = /^#[0-9a-f]{6}$/i.test(text ?? '') ? text! : light ? '#2b2722' : '#e6e1d3'
  return { ink, surface: m ? `#${m[1]}` : undefined }
}
