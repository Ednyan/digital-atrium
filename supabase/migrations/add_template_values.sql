-- A template's values, kept by the group it was placed as, and each trace's links
-- to them (src/lib/templateValues.ts): layers.template { values: [...] }, and
-- traces.value_links { setting: value id }.
--
-- Only an atrium still kept in Supabase needs it; a trace sends value_links only
-- once it has been linked, and a group its template only once it has one, so
-- everything else saves without them. Safe to run twice.

alter table public.traces add column if not exists value_links jsonb;
alter table public.layers add column if not exists template jsonb;
