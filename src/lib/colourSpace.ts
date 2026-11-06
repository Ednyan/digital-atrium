// Colours between #rrggbb and hue, saturation and value (ColourPicker): hue in
// degrees, the other two from 0 to 1.

export interface Hsv { h: number; s: number; v: number }

/** A #rgb or #rrggbb colour as hue, saturation and value; black for anything else. */
export function hexToHsv(hex: string): Hsv {
  const short = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex.trim())
  const long = short ? [, short[1] + short[1], short[2] + short[2], short[3] + short[3]] : /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!long) return { h: 0, s: 0, v: 0 }
  const [r, g, b] = [long[1], long[2], long[3]].map(part => parseInt(part!, 16) / 255)
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b)
  const h = d === 0 ? 0
    : max === r ? 60 * (((g - b) / d) % 6)
    : max === g ? 60 * ((b - r) / d + 2)
    : 60 * ((r - g) / d + 4)
  return { h: (h + 360) % 360, s: max === 0 ? 0 : d / max, v: max }
}

/** Hue, saturation and value as #rrggbb. */
export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
  }
  return '#' + [f(5), f(3), f(1)].map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('')
}

/** `hex` moved toward `toward` by `t` (0 to 1): a tint toward white, a shade toward black. */
export function mixHex(hex: string, toward: string, t: number): string {
  const rgb = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) || 0)
  const a = rgb(hex), b = rgb(toward), k = Math.max(0, Math.min(1, t))
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, '0')).join('')}`
}
