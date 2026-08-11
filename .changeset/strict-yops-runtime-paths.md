---
'@t3x-dev/yops': patch
---

Reject malformed runtime paths and out-of-bounds sequence writes so engine behavior matches path validation and never reports sparse or unrepresentable index writes as applied.
