# Fixed portable artifact

Task 10 under [Gate 2 Epic #1706](https://github.com/t3x-dev/t3x-core/issues/1706)
prepares one deterministic artifact from an exact verified Commit. It does not
resolve a branch name while building the artifact.

The artifact contains:

- the complete committed State and its Commit/State descriptors;
- the exact verified committed Schema definition, hash and bindings; and
- an explicit dependency manifest. Runtime resources are empty until a later
  version defines and qualifies them.

Preparation fails closed when the Commit/State pair does not match, the
committed Schema cannot be recovered, or the Schema definition does not match
its hash. The JSON bytes end with one newline and have their own SHA-256 byte
digest. The browser verifies the selected Commit, format, byte length and byte
digest before starting the download.

`t3x:portable-artifact` is an application delivery target with an immutable
preparation receipt. A prepared receipt proves only which fixed bytes were
created.

Task 11 adds the built-in `preview` deployment slot. A deployment consumes only
a successful portable receipt and records the fixed artifact digest as both its
desired and actual version. Every deploy and rollback appends a new record; a
rollback selects an earlier recorded digest and never rebuilds from a branch or
Draft. This is version assignment and audit evidence inside T3X, not proof that
an external cloud runtime restored or started the artifact. External deployment,
backup completeness and runtime compatibility remain later Gate 2/3 work.
