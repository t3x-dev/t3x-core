import { createHash } from 'node:crypto';
import {
  type CommitV2,
  canonicalizeProtocolValue,
  describeProtocolObject,
  type State,
} from '@t3x-dev/transition';
import { dump, JSON_SCHEMA } from 'js-yaml';

export class StateExportIntegrityError extends Error {}
export class StateExportFormatError extends Error {}

/** Export a verified commit's complete value. Never resolve a mutable ref here. */
export function exportCommittedState(input: {
  commitDigest: string;
  commit: CommitV2;
  state: State;
  format: string;
  expectedStateDigest?: string;
}) {
  const sourceCommit = describeProtocolObject(input.commit);
  const sourceState = describeProtocolObject(input.state);
  if (
    sourceCommit.digest !== input.commitDigest ||
    input.commit.result.digest !== sourceState.digest ||
    (input.expectedStateDigest && input.expectedStateDigest !== sourceState.digest)
  ) {
    throw new StateExportIntegrityError('The requested commit and State do not match');
  }
  if (input.format !== 'json' && input.format !== 'yaml') {
    throw new StateExportFormatError('This export supports JSON and YAML only');
  }
  // Canonicalization validates the protocol value and orders keys before serialization.
  // JSON.parse also removes prototypes without changing the committed value.
  const value = JSON.parse(canonicalizeProtocolValue(input.state.value));
  const content =
    input.format === 'json'
      ? `${JSON.stringify(value, null, 2)}\n`
      : dump(value, {
          schema: JSON_SCHEMA,
          sortKeys: true,
          noRefs: true,
          lineWidth: -1,
          noCompatMode: false,
          forceQuotes: true,
          quotingType: '"',
        });
  return {
    format: input.format,
    scope: 'full-state-value' as const,
    mimeType: input.format === 'json' ? 'application/json' : 'application/yaml',
    filename: `state-${sourceCommit.digest.slice(7, 19)}.${input.format}`,
    content,
    byteLength: Buffer.byteLength(content, 'utf8'),
    byteDigest: `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`,
    sourceCommit,
    sourceState,
    codec: input.state.codec,
    serialization: input.format === 'json' ? 't3x.json-value/v1' : 't3x.yaml-value/v1',
  };
}
