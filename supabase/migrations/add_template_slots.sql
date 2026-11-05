-- A template's slots (src/lib/frames.ts isSlot): a frame arranged to fill, fit or
-- stretch what's put in it, as an arranged frame lays out its own (masonry).
--
-- Only an atrium still kept in Supabase needs it, and only once a template with a
-- slot is placed in one. Safe to run twice.

alter table public.traces drop constraint if exists traces_frame_arrange_check;
alter table public.traces add constraint traces_frame_arrange_check
  check (frame_arrange is null or frame_arrange in ('masonry', 'fill', 'fit', 'stretch'));
