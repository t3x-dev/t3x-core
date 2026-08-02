# Mixed-history retention

T3X can remove a workflow without deleting the evidence or history that the
workflow produced. The machine-checked source of truth is
[`packages/storage/contracts/history-retention.json`](../packages/storage/contracts/history-retention.json).

CommitV2 is the only target write model. CommitV1 is retained only as
read-only historical input while [#1305](https://github.com/t3x-dev/t3x-core/issues/1305)
migrates the remaining merge, pull-request, automation, and compatibility
writers. Retention is not continued support for producing CommitV1.

Three lifecycle states keep that decision explicit:

| Lifecycle | Meaning |
| --- | --- |
| `active` | Current product data with supported reads and writes. |
| `compatibility` | Retained while legacy writers, readers, or CommitV1 projections still depend on it. |
| `immutable_history` | Commit-bound provenance or links that feature retirement cannot delete. |

## Compatibility boundary

- `conversations`, `turns`, and `source_text_revisions` are the durable Source
  model. They are not retired Chat implementation details.
- `topics`, `trees`, and `tree_relations` are compatibility projections. Their
  writers stop only after the repository workspace replaces every live caller.
- `yops_log` remains readable while historical CommitV1 records store
  `yops_log_ids`. A referenced row is immutable history even after its editor
  is retired; CommitV2 records Effects instead of creating this linkage.
- `commits.sources` and `commits.yops_log_ids` are immutable CommitV1 facts.
  Legacy history is rendered honestly; it is never rewritten into CommitV2.

Ordinary conversation deletion fails when `committed_as` is set or a commit
source descriptor names the conversation. Project or tenant erasure is a
separate lifecycle and may remove the complete project graph.

## Migration and rollback

Transition storage is additive beside CommitV1 storage. An upgrade must leave
legacy source rows, YOps rows, and commit JSON unchanged. A rollback may ignore
the new Transition tables while the previous binary continues to read CommitV1;
it must not require down-converting CommitV2 into a synthetic CommitV1.

Removing a compatibility table requires a later, explicit migration with a
verified replacement read path, a mixed-history fixture, and a rollback plan.
Feature-retirement PRs do not get to infer that permission from zero UI callers.
