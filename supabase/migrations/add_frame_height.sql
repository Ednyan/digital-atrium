-- An arranged frame's height as it was given (src/types/database.ts
-- Trace.frameHeight): made, switched to Arrange Automatically, or resized by
-- hand. Laid out, it grows past it for what it holds and comes back to it,
-- never under (TraceOverlay arrangementOf).
--
-- Sent only by a frame that has one, so everything else saves without it; run
-- before the web build that sends it. Safe to run twice.

alter table public.traces add column if not exists frame_height real;
