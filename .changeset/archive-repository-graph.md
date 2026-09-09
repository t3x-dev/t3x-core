---
'@t3x-dev/storage': minor
---

Validate archive-local repository records, canonical object identities, commit
membership, branch heads and parent closure using the shared CommitV2 verifier.
Reject unknown fields, duplicates, unbounded inputs and external object resolution.
Structural integrity does not authorize restore or prove policy evaluation/replay.
