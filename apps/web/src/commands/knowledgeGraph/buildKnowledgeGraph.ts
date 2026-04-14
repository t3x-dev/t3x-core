/**
 * L3 command — trigger a server-side knowledge-graph rebuild for a project.
 *
 * Long-running compute on the backend; the caller (hook) flips a
 * `building` flag and awaits the BuildResult before refreshing the
 * node list.
 */

import {
  type BuildResult,
  buildKnowledgeGraph as buildKnowledgeGraphInfra,
} from '@/infrastructure/knowledge-graph';
import { KnowledgeGraphPersistenceError } from './errors';

export async function buildKnowledgeGraph(projectId: string): Promise<BuildResult> {
  try {
    return await buildKnowledgeGraphInfra(projectId);
  } catch (cause) {
    throw new KnowledgeGraphPersistenceError(
      cause instanceof Error ? cause.message : 'buildKnowledgeGraph failed',
      cause
    );
  }
}

export type { BuildResult };
