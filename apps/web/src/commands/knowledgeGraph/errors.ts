/**
 * L3 — typed errors for the knowledge-graph aggregate (v2 §2.4 contract).
 *
 * Source policy: NONE. The graph is a derived artefact of project
 * commits.
 *
 * Optimistic-update style: all-or-nothing.
 *   - deleteGraph: hook flips `loading=true`, awaits delete, clears
 *     graph state on success.
 * The command does not pre-mutate the local node list.
 */

import { CommandError } from '../CommandError';

export class KnowledgeGraphPersistenceError extends CommandError {
  constructor(message: string, cause?: unknown) {
    super('knowledge_graph_persistence', message, cause);
    this.name = 'KnowledgeGraphPersistenceError';
  }
}
