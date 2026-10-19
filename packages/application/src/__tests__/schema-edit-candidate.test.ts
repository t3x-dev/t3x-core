import { describe, expect, it } from 'vitest';
import {
  parseWorkspaceSchemaEditCandidate,
  saveWorkspaceSchemaEditCandidate,
} from '../schema-authoring';

const source = {
  projectId: 'project_source',
  canonicalName: 'team/product',
  version: '1.0.0',
  artifactVersionId: 'ysv_product_1',
  hash: `sha256:${'a'.repeat(64)}` as const,
};
const origin = {
  channel: 'studio' as const,
  actor: { kind: 'human' as const, id: 'user_1' },
};
const createInput = {
  candidateId: 'schema-edit:workspace_1',
  workspaceId: 'workspace_1',
  expectedRevision: 0,
  baseSources: [source],
  localContribution: { nodes: {} },
  intent: 'Add an advantage node',
  origin,
  retryKey: 'retry-create',
};

describe('Workspace Schema edit candidate use case', () => {
  it('creates one server candidate and reuses an exact retry', () => {
    const created = saveWorkspaceSchemaEditCandidate(null, createInput);
    expect(created.kind).toBe('created');
    if (created.kind === 'conflict') throw new Error(created.message);
    expect(created.candidate).toMatchObject({
      candidateId: createInput.candidateId,
      revision: 1,
      baseSources: [source],
      retryKey: 'retry-create',
    });

    const retry = saveWorkspaceSchemaEditCandidate(created.candidate, createInput);
    expect(retry).toEqual({ kind: 'reused', candidate: created.candidate });
  });

  it('edits the same candidate and rejects stale or mismatched retries', () => {
    const created = saveWorkspaceSchemaEditCandidate(null, createInput);
    if (created.kind === 'conflict') throw new Error(created.message);
    const updated = saveWorkspaceSchemaEditCandidate(created.candidate, {
      ...createInput,
      expectedRevision: 1,
      retryKey: 'retry-update',
      localContribution: { nodes: { advantage: { slots: {} } } },
    });
    expect(updated.kind).toBe('updated');
    if (updated.kind === 'conflict') throw new Error(updated.message);
    expect(updated.candidate).toMatchObject({
      candidateId: createInput.candidateId,
      revision: 2,
    });

    expect(
      saveWorkspaceSchemaEditCandidate(updated.candidate, {
        ...createInput,
        expectedRevision: 1,
        retryKey: 'retry-stale',
      })
    ).toMatchObject({ kind: 'conflict', reason: 'stale_revision', currentRevision: 2 });
    expect(
      saveWorkspaceSchemaEditCandidate(updated.candidate, {
        ...createInput,
        expectedRevision: 1,
        retryKey: 'retry-update',
        intent: 'Different request using the same key',
      })
    ).toMatchObject({ kind: 'conflict', reason: 'idempotency_mismatch' });
  });

  it('parses a recovered candidate without sharing caller-owned content', () => {
    const created = saveWorkspaceSchemaEditCandidate(null, createInput);
    if (created.kind === 'conflict') throw new Error(created.message);
    const recovered = parseWorkspaceSchemaEditCandidate(created.candidate);
    (createInput.localContribution.nodes as Record<string, unknown>).lateMutation = true;
    expect(recovered.localContribution).toEqual({ nodes: {} });
  });
});
