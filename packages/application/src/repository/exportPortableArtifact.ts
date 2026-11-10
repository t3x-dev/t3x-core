import { createHash } from 'node:crypto';
import { hashWorkspaceSchemaDefinition } from '@t3x-dev/core';
import type { CommitV2, ProtocolValue, State } from '@t3x-dev/transition';
import { canonicalizeProtocolValue } from '@t3x-dev/transition';
import { exportCommittedState, StateExportIntegrityError } from './exportState';

export class PortableArtifactIntegrityError extends StateExportIntegrityError {}

export async function exportPortableArtifact(input: {
  commitDigest: string;
  commit: CommitV2;
  state: State;
  schema: {
    status: 'bound' | 'unbound' | 'unknown';
    schemaHash: string | null;
    definition: Record<string, unknown> | null;
    bindings: Record<string, unknown>[];
  };
}) {
  let state: ReturnType<typeof exportCommittedState>;
  try {
    state = exportCommittedState({ ...input, format: 'json' });
  } catch (error) {
    if (error instanceof StateExportIntegrityError) {
      throw new PortableArtifactIntegrityError(error.message);
    }
    throw error;
  }
  if (
    input.schema.status !== 'bound' ||
    !input.schema.schemaHash ||
    !input.schema.definition ||
    input.schema.bindings.length === 0 ||
    (await hashWorkspaceSchemaDefinition(input.schema.definition)) !== input.schema.schemaHash
  ) {
    throw new PortableArtifactIntegrityError(
      'The exact committed Schema binding is unavailable or invalid'
    );
  }

  const bundle = JSON.parse(
    canonicalizeProtocolValue({
      schema: 't3x.application/portable-artifact/v1',
      sourceCommit: state.sourceCommit,
      sourceState: state.sourceState,
      state: {
        codec: state.codec,
        value: input.state.value,
      },
      schemaSnapshot: {
        schemaHash: input.schema.schemaHash,
        definition: input.schema.definition,
        bindings: input.schema.bindings,
      },
      dependencies: {
        schemaBindings: input.schema.bindings,
        runtimeResources: [],
      },
    } as unknown as ProtocolValue)
  );
  const content = `${JSON.stringify(bundle, null, 2)}\n`;
  return {
    format: 'bundle' as const,
    scope: 'portable-commit' as const,
    mimeType: 'application/json' as const,
    filename: `artifact-${state.sourceCommit.digest.slice(7, 19)}.t3x.json`,
    content,
    byteLength: Buffer.byteLength(content, 'utf8'),
    byteDigest: `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`,
    sourceCommit: state.sourceCommit,
    sourceState: state.sourceState,
    schemaDigest: input.schema.schemaHash,
    serialization: 't3x.portable-artifact/v1' as const,
  };
}
