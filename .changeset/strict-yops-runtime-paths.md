---
'@t3x-dev/yops': patch
---

Reject malformed runtime paths and out-of-bounds sequence writes so engine behavior matches path validation and never reports sparse or unrepresentable index writes as applied.

Breaking declaration: `@t3x-dev/yops` expands the exported
`ParsePathResult.code` union with `INVALID_INDEX_SYNTAX`,
`INVALID_MATCH_SYNTAX`, and `INDEX_OUT_OF_RANGE`. Exhaustive consumers must
handle these additional results for malformed paths; valid path behavior and
the permissive `parsePath` API remain compatible.
