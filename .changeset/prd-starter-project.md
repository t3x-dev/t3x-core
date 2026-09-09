---
'@t3x-dev/api': minor
'@t3x-dev/api-client': minor
---

Allow private project creation with the no-AI `prd-v1` starter. Namespace admission,
project, default branch, and initial canonical Transition share the existing creation
workflow; a failed initial commit rolls back project creation. Blank projects remain
unchanged. Starter content is intentionally incomplete and makes no schema-readiness claim.
