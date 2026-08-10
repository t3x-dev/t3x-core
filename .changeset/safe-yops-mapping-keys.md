---
'@t3x-dev/yops': patch
---

Prevent prototype-chain mutation when YOps reads, clones, or writes mapping keys such as `__proto__`, `constructor`, and `toString`.
