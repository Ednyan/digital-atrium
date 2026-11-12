-- A 3D model trace (src/lib/model3d.ts) keeps which format its file is and how
-- it's turned: { format, view: { yaw, pitch, distance } }. The trace itself is
-- a picture -- media_url is a still of the model -- and the model's file is in
-- image_url, so nothing else about the table changes.
--
-- Run before the web build that uses it deploys: a model placed is written
-- with it, and without the column Postgres refuses that trace (no other trace
-- sends it). Safe to run twice.

alter table public.traces add column if not exists model jsonb;
