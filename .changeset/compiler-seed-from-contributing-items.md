---
"@t3x-dev/core": patch
---

Tie the v2 extractor compiler's pre-existing-path seed to contributing items only.

`compileExtractionDraft` previously walked every input draft item to build the
`preExisting` set passed into `dedupeDefineOps`. That made dropped items —
items that failed compile in `allowPartial` mode, or items the empty-defines
guard filtered out — silently contribute their `target_ref.path` to
ancestor-define injection. A surviving sibling add at a fresh path could
then lose its required `define` ancestor because the dropped item's
unverified existence claim had already marked the ancestor as known.

The seed is now collected inline as each item is judged: only items whose ops
survive the compile failure / empty-defines / dropped-malformed-target checks
contribute to `preExisting`. Behavioural impact is limited to the buggy case
above; every existing regression test passes unchanged.

Closes #932.
