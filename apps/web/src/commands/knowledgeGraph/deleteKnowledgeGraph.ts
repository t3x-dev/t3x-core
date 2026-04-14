/**
 * L3 command — delete the knowledge graph for a project.
 */

import { deleteKnowledgeGraph as deleteKnowledgeGraphInfra } from '@/infrastructure/knowledge-graph';
import { KnowledgeGraphPersistenceError } from './errors';

export async function deleteKnowledgeGraph(projectId: string): Promise<void> {
  try {
    return await deleteKnowledgeGraphInfra(projectId);
  } catch (cause) {
    throw new KnowledgeGraphPersistenceError(
      cause instanceof Error ? cause.message : 'deleteKnowledgeGraph failed',
      cause
    );
  }
}
