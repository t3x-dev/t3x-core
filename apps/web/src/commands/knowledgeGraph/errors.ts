/**
 * L3 — typed errors for the knowledge-graph aggregate (v2 §2.4 contract).
 *
 * Source policy: NONE. The graph is a derived artefact of project
 * commits; build inputs are server-side, no client-side source attached.
 *
 * Optimistic-update style: all-or-nothing.
 *   - buildGraph: hook flips `building=true`, awaits server compute,
 *     stores BuildResult + re-fetches nodes on success; on failure
 *     just records the error.
 *   - deleteGraph: hook flips `loading=true`, awaits delete, clears
 *     graph state on success.
 * Neither verb pre-mutates the local node list — the canvas is stale
 * during the operation, then refreshed atomically.
 */

import { CommandError } from '../CommandError';

export class KnowledgeGraphPersistenceError extends CommandError {
  constructor(message: string, cause?: unknown) {
    super('knowledge_graph_persistence', message, cause);
    this.name = 'KnowledgeGraphPersistenceError';
  }
}
