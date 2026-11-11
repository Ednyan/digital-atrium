// New traces: there at once, and kept the way every other change is -- in the
// store, marked to be written, and written with the next Save (lib/traceSave,
// whose write inserts a row that isn't there yet). Not before.
//
// They used to be written to the database the moment they were made, while
// changes and deletions waited for Save -- the user, 2026-11-11: what was made
// stayed though one left without saving, and Don't Save couldn't take it back,
// since it reads the atrium again from the database. And where a path wrote
// first and showed after, the database's echo of the insert could arrive first
// and be taken for someone else's trace: no step of undo for it.
//
// Made in the store first, each is seen by TraceOverlay as one's own addition
// (one step of undo for all made together), unless the caller records a step
// of its own (adoptTraces, as a drawing does).

import { useGameStore } from '../store/gameStore'
import { mapRowToTrace } from '../hooks/useTraces'
import type { Trace } from '../types/database'

/** `rows` as the database has them (column names), ids made if they have none:
 *  in the store now, written with the next Save. The traces, as the store has them. */
export function newTraces(rows: Record<string, any>[]): Trace[] {
  const store = useGameStore.getState()
  const now = new Date().toISOString()
  const made = rows.map(row => mapRowToTrace({ ...row, id: row.id ?? crypto.randomUUID(), created_at: row.created_at ?? now }))
  for (const trace of made) {
    store.addTrace(trace)
    store.markTraceChanged(trace.id)
  }
  return made
}

/** One new trace (newTraces). */
export const insertTrace = (row: Record<string, any>): Trace => newTraces([row])[0]
