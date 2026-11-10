import { createHash } from 'node:crypto';
import { createYOpsState, hashWorkspaceSchemaDefinition } from '@t3x-dev/core';
import { type CommitV2, describeProtocolObject } from '@t3x-dev/transition';
import { expect, it } from 'vitest';
import {
  exportPortableArtifact,
  PortableArtifactIntegrityError,
} from '../repository/exportPortableArtifact';

async function fixture() {
  const state = createYOpsState({ candidate: { title: 'Portable' } });
  const commit: CommitV2 = {
    schema: 't3x/commit/v2',
    parents: [],
    decision: { kind: 'statement', schema: 't3x/statement/v1', digest: `sha256:${'a'.repeat(64)}` },
    result: describeProtocolObject(state),
  };
  const definition = { yschema: '0.1', name: 'Portable', nodes: {} };
  return {
    state,
    commit,
    commitDigest: describeProtocolObject(commit).digest,
    schema: {
      status: 'bound' as const,
      schemaHash: await hashWorkspaceSchemaDefinition(definition),
      definition,
      bindings: [{ canonicalName: 'team/portable', version: '1.0.0' }],
    },
  };
}

it('builds deterministic bytes from one exact Commit and committed Schema', async () => {
  const input = await fixture();
  const artifact = await exportPortableArtifact(input);
  expect(await exportPortableArtifact(input)).toEqual(artifact);
  expect(artifact.byteDigest).toBe(
    `sha256:${createHash('sha256').update(artifact.content).digest('hex')}`
  );
  expect(JSON.parse(artifact.content)).toMatchObject({
    schema: 't3x.application/portable-artifact/v1',
    sourceCommit: { digest: input.commitDigest },
    schemaSnapshot: { schemaHash: input.schema.schemaHash, bindings: input.schema.bindings },
    dependencies: { schemaBindings: input.schema.bindings, runtimeResources: [] },
  });
});

it('rejects a changed Commit or unverifiable Schema', async () => {
  const input = await fixture();
  await expect(
    exportPortableArtifact({ ...input, commitDigest: `sha256:${'b'.repeat(64)}` })
  ).rejects.toThrow(PortableArtifactIntegrityError);
  await expect(
    exportPortableArtifact({
      ...input,
      schema: { ...input.schema, schemaHash: `sha256:${'b'.repeat(64)}` },
    })
  ).rejects.toThrow(PortableArtifactIntegrityError);
  await expect(
    exportPortableArtifact({
      ...input,
      schema: { status: 'unbound', schemaHash: null, definition: null, bindings: [] },
    })
  ).rejects.toThrow(PortableArtifactIntegrityError);
});
