-- Pins from Pinterest (docs/PINTEREST.md, src/lib/pins.ts): Pinterest's rules
-- don't let what's read from it be kept, so a pin is kept as its id (its link),
-- its board and whose connection imported it -- traces.pin_source
-- { board, by } -- and its picture and title are read from Pinterest each time
-- it's shown (src/lib/pinShow.ts).
--
-- Run before the web build that sends pin_source: a pin's save sends it.
-- Safe to run twice.

alter table public.traces add column if not exists pin_source jsonb;

-- The pictures' addresses pins were kept with until now, let go of. (Their
-- titles, kept as their names, go as each atrium is next opened by someone
-- who can change it: only then can a title be told from a name given it.)
update public.traces
set media_url = null, image_url = null
where type = 'embed'
  and link_url like 'https://www.pinterest.com/pin/%'
  and (media_url is not null or image_url is not null);
