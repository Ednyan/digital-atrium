// The top bar's order: its tools and separators, as chosen (Customize top bar), and
// what that comes to with the room there is. A separator is an entry like any
// tool, so it's moved like one.

const SEPARATOR = 'sep-'
export const isSeparator = (entry: string) => entry.startsWith(SEPARATOR)
export function newSeparator(order: string[]) {
  let n = 1
  while (order.includes(`${SEPARATOR}${n}`)) n++
  return `${SEPARATOR}${n}`
}

// As it comes: a separator wherever a tool asks to be set apart.
export function defaultOrder(items: { id: string; apart?: boolean }[]): string[] {
  const order: string[] = []
  for (const item of items) {
    if (item.apart) order.push(newSeparator(order))
    order.push(item.id)
  }
  return order
}

// As chosen, without what isn't here, and with any tool the choice predates at
// the end -- or as it comes, with none chosen.
export function barOrder(chosen: string[] | null, items: { id: string; apart?: boolean }[]): string[] {
  if (!chosen) return defaultOrder(items)
  const here = new Set(items.map(item => item.id))
  const known = chosen.filter((entry, i) => (isSeparator(entry) || here.has(entry)) && chosen.indexOf(entry) === i)
  return [...known, ...items.map(item => item.id).filter(id => !known.includes(id))]
}

// With room for `rows` buttons, one of them More, always last: those that fit, each
// marked if a separator comes before it, and the rest for More. A separator with
// no tool on one side of it there says nothing, so it isn't drawn.
export function layOut(order: string[], rows: number): { shown: { id: string; apart: boolean }[]; hidden: string[] } {
  const tools = order.filter(entry => !isSeparator(entry))
  const fitting = tools.length + 1 <= rows ? tools.length : Math.max(0, rows - 1)
  const shown: { id: string; apart: boolean }[] = []
  let apart = false
  for (const entry of order) {
    if (isSeparator(entry)) { apart = shown.length > 0; continue }
    if (shown.length === fitting) break
    shown.push({ id: entry, apart })
    apart = false
  }
  return { shown, hidden: tools.slice(fitting) }
}
