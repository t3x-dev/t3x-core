# @t3x-dev/transition

Public alpha contracts for verifiable T3X state transitions.

`@t3x-dev/transition@0.6.0` is part of the public T3X alpha release surface.

## What

`@t3x-dev/transition` exposes the protocol nouns used by T3X:
State, Effect, Statement, and CommitV2. It also includes canonicalization,
object identity, parsing, Replay verification, and commit integrity helpers.

## Why

Third-party agents, MCP tools, and integration code need a small package that can
reason about T3X transition objects without depending on the WebUI, API server,
database, runner, or local installer.

The package is intentionally a leaf protocol surface. It does not include
network, storage, LLM, clock, random, or product UI behavior.

## Install

```bash
npm install @t3x-dev/transition
```

## Sample

```ts
import {
  InMemoryObjectResolver,
  describeProtocolObject,
  verifyCommitIntegrity,
} from '@t3x-dev/transition';

const resolver = new InMemoryObjectResolver([baseState, effect, proposal, decision]);
const result = await verifyCommitIntegrity(commit, { resolver });

console.log(describeProtocolObject(result.result));
```

Use this package for protocol-level verification. Use the T3X application or
higher-level packages for product workflows.
