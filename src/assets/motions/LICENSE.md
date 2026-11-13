The poses and animations here are frames read from two sources, made into this
form (lib/motions) by `scripts/build-motions.mjs`:

- `quaternius.json`, and poses taken from it: the animations of Quaternius's
  Universal Animation Library 1 and 2 [Standard] (https://quaternius.com).
  License: CC0 1.0 Universal (CC0 1.0), Public Domain Dedication,
  https://creativecommons.org/publicdomain/zero/1.0/

- `cmu.json`, and poses taken from it: recordings from the Carnegie Mellon
  University Graphics Lab Motion Capture Database, as BVH (the cgspeed
  conversion, via https://github.com/sfd158/cmu-mocap). Its terms: "This data
  is free for use in research and commercial projects worldwide."
  The data used in this project was obtained from mocap.cs.cmu.edu.
  The database was created with funding from NSF EIA-0196217.

`poses.json` holds single frames of both; `index.json` lists what can be played.
