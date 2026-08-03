import { decodeRepositorySemanticState, type SemanticContent } from '@t3x-dev/core';
import { type AnyDB, getVerifiedTransitionCommitGraph } from '@t3x-dev/storage';

export interface McpRepositorySemanticCommit {
  digest: string;
  projectId: string;
  recordedAt: string;
  semanticContent: SemanticContent;
}

/** MCP task adapter for consumers that explicitly support the semantic State domain. */
export async function getMcpRepositorySemanticCommit(
  db: AnyDB,
  projectId: string,
  digest: string
): Promise<McpRepositorySemanticCommit | null> {
  const graph = await getVerifiedTransitionCommitGraph(db, projectId, digest);
  if (graph === null) return null;
  return {
    digest,
    projectId,
    recordedAt: graph.recordedAt,
    semanticContent: decodeRepositorySemanticState(graph.state),
  };
}
