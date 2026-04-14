/**
 * L3 — typed errors for the leaves aggregate (v2 §2.4 contract).
 *
 * Source policy: MEDIUM. createLeaf accepts a LeafSource
 * (`UserSource | AgentSource`) and asserts the shape at entry via
 * assertLeafSource (see leafSource.ts). `AgentSource` must carry both
 * `model` and `timestamp`; missing or malformed input throws
 * LeafSourceValidationError before any infrastructure write.
 *
 * Optimistic-update style: all-or-nothing. The hook embeds the leaf
 * into canvas state only after the API resolves. On failure the panel
 * stays open so the user can retry.
 */

import { CommandError } from '../CommandError';

export class LeafPersistenceError extends CommandError {
  constructor(message: string, cause?: unknown) {
    super('leaf_persistence', message, cause);
    this.name = 'LeafPersistenceError';
  }
}

export class LeafSourceValidationError extends CommandError {
  constructor(
    public readonly missingField: string,
    message?: string
  ) {
    super(
      'leaf_source_validation',
      message ?? `LeafSource rejected: ${missingField}`
    );
    this.name = 'LeafSourceValidationError';
  }
}
