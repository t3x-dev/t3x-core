---
'@t3x-dev/yops': patch
---

Preserve decoded path segments through define, rename, unset, and fold so quoted mapping keys containing `/` remain one key instead of being reinterpreted as nested paths.
