# Transition conformance

The conformance bundle is the language-neutral contract for implementing the
T3X Transition protocol outside the TypeScript kernel. It covers the four wire
objects (`State`, `Effect`, `Statement`, and `CommitV2`), canonical identity,
immutable resolution, deterministic Replay, and integrity-chain verification.

It does not make T3X a runtime plugin system, standardize an application
domain, or promote the protocol to a stable public release surface.

## Bundle layout

- `v1/manifest.json` identifies the schema, collection semantics, compatibility
  policy, and every vector corpus.
- `v1/vectors/valid.json` and `invalid.json` pin the closed wire schema.
- `v1/vectors/canonical.json` pins RFC 8785 bytes, including binary64 and
  Unicode ordering boundaries.
- `v1/vectors/identity.json` pins domain-separated SHA-256 object identity.
- `v1/vectors/semantic.json` records the stable rule and error taxonomy.
- `v1/vectors/execution.json` contains complete object packs that both the
  TypeScript kernel and an independent runtime must resolve and execute.

The executable corpus uses a deliberately tiny test-only string replacement
driver. It is a common semantic fixture, not a product adapter and not a fifth
protocol noun. The behaviorally different production extension proof is the
exact-source YAML codec and localized YAML source driver delivered by #1259.

## Run the independent verifier

From the repository root:

```bash
python3 -m venv .venv-transition-conformance
.venv-transition-conformance/bin/python -m pip install \
  --require-hashes \
  -r tools/transition-conformance-python/requirements.lock
.venv-transition-conformance/bin/python \
  tools/transition-conformance-python/run.py \
  --repo-root .
```

The Python implementation uses its own JSON loader, RFC 8785 library, schema
validator, resolver, replay dispatch, and integrity traversal. It must never
invoke Node, import generated TypeScript, call a T3X service, or consume a
TypeScript-produced verdict.

## Minimum third-party verifier suite

A conforming verifier must:

1. reject malformed UTF-8, duplicate JSON keys, non-finite binary64 numbers,
   and unpaired Unicode surrogates before accepting a protocol object;
2. validate every object against the Draft 2020-12 schema and the manifest's
   ordered/set collection rules;
3. reproduce all canonical bytes and domain-separated object digests;
4. re-hash immutable resolver bytes before parsing or trusting references, and
   reject non-canonical storage bytes;
5. execute `Result = Replay(Base, EffectDefinition)` without exposing the
   claimed Result to the MutationDriver;
6. distinguish unavailable semantics from a false Effect claim;
7. verify every Commit -> Decision -> Proposal -> Effect hop, parent/Base
   continuity, merge inputs, and the Commit/Effect Result equality; and
8. match every executable vector's Result descriptor or stable error code.

A verifier that reads fixture labels and returns their expected values without
performing these computations is not conforming.

## Adding a driver

A MutationDriver remains outside the kernel. Its protocol name, version, and
content-derived specification digest define its semantics. New drivers must:

- consume only Base, EffectDefinition, and explicitly declared inputs;
- return a State with a versioned StateCodec;
- preserve operation ordering and declare named-input semantics;
- report precondition failure separately from unsupported semantics; and
- add adversarial replay vectors without changing core records.

Registration-only coverage is insufficient. At least one vector must execute
the driver against its compatible StateCodec and compare the derived Result
descriptor.

## Updating vectors

Existing canonical bytes and digests are immutable protocol evidence. A change
to them requires an explicit protocol-version decision. Additive vectors must
be consumed by both the TypeScript and independent verifier in the same PR.

Failure reports identify the vector, verification stage, expected and actual
values, and canonical UTF-8 hex when identity diverges. They must not print
source evidence, secrets, environment values, or arbitrary resolver contents.
