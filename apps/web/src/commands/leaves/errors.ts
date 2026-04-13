/**
 * L3 — typed errors for the leaves aggregate (v2 §2.4 contract).
 *
 * Source policy: WEAK. Leaves carry a `created_by` field
 * (`'user' | 'agent'`) recorded by the calling hook based on flow:
 *   - useCanvasLeafActions.add* (panel + template flows): `'user'`
 *   - useCreateLeaf (programmatic creation from chat workflow): `'user'`
 *   - LLM-generated leaves (deploy_agent regeneration): `'agent'`
 * No formal LLMSource / HumanSource enforcement at this layer; the
 * commit-time provenance is captured by the parent commit's
 * `provenance + sources` fields, not per-leaf.
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
