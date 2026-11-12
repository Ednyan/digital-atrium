-- Calendar traces (src/lib/calendar.ts): 'calendar' joins the trace types
-- traces_type_check allows, and a calendar keeps how it's shown -- a month or
-- a week -- in a column of its own: { view }. Its .ics file is media_url, as a
-- picture's file is.
--
-- Run before the web build that uses it deploys. Safe to run twice: the
-- constraint is dropped first and made again with the whole list.

ALTER TABLE public.traces DROP CONSTRAINT IF EXISTS traces_type_check;

ALTER TABLE public.traces ADD CONSTRAINT traces_type_check
  CHECK (type IN ('text', 'image', 'audio', 'video', 'embed', 'shape', 'document', 'frame', 'sheet', 'chart', 'calendar'));

alter table public.traces add column if not exists calendar jsonb;
