/**
 * useKnowledgeGraph — view-facing API for the knowledge-graph domain.
 *
 * Owns I/O previously in `knowledgeGraphStore` async actions. Store is
 * passive per v2 §2.5.
 */

import { useCallback } from 'react';
import { deleteKnowledgeGraph } from '@/commands/knowledgeGraph';
import {
  fetchKnowledgeNode,
  fetchKnowledgeNodes,
  fetchNodeNeighbors,
  searchKnowledgeNodesByQuery,
} from '@/queries/knowledgeGraph';
import { useKnowledgeGraphStore } from '@/store/knowledgeGraphStore';

// Module-scoped so stale requests are discarded even across remounts.
let fetchGeneration = 0;

export function useKnowledgeGraph() {
  const nodes = useKnowledgeGraphStore((s) => s.nodes);
  const selectedNodeId = useKnowledgeGraphStore((s) => s.selectedNodeId);
  const detailNode = useKnowledgeGraphStore((s) => s.detailNode);
  const detailMembers = useKnowledgeGraphStore((s) => s.detailMembers);
  const neighbors = useKnowledgeGraphStore((s) => s.neighbors);
  const loading = useKnowledgeGraphStore((s) => s.loading);
  const error = useKnowledgeGraphStore((s) => s.error);
  const clearSelection = useKnowledgeGraphStore((s) => s.clearSelection);

  const fetchNodes = useCallback(async (projectId: string): Promise<void> => {
    const gen = ++fetchGeneration;
    const store = useKnowledgeGraphStore.getState();
    store.setLoading(true);
    store.setError(null);
    try {
      const data = await fetchKnowledgeNodes(projectId, 200);
      if (gen !== fetchGeneration) return;
      store.setNodes(data);
      store.setLoading(false);
    } catch (err) {
      if (gen !== fetchGeneration) return;
      store.setError(err instanceof Error ? err : new Error(String(err)));
      store.setLoading(false);
    }
  }, []);

  const selectNode = useCallback(async (projectId: string, nodeId: string): Promise<void> => {
    const store = useKnowledgeGraphStore.getState();
    store.setSelectedNodeId(nodeId);
    try {
      const [node, nextNeighbors] = await Promise.all([
        fetchKnowledgeNode(projectId, nodeId),
        fetchNodeNeighbors(projectId, nodeId),
      ]);
      store.setDetail({
        detailNode: node,
        detailMembers: [],
        neighbors: nextNeighbors,
      });
    } catch (err) {
      store.setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  const searchNodes = useCallback(async (projectId: string, query: string): Promise<void> => {
    const store = useKnowledgeGraphStore.getState();
    store.setLoading(true);
    store.setError(null);
    try {
      const data = await searchKnowledgeNodesByQuery(projectId, query);
      store.setNodes(data);
      store.setLoading(false);
    } catch (err) {
      store.setError(err instanceof Error ? err : new Error(String(err)));
      store.setLoading(false);
    }
  }, []);

  const deleteGraph = useCallback(async (projectId: string): Promise<void> => {
    const store = useKnowledgeGraphStore.getState();
    store.setLoading(true);
    store.setError(null);
    try {
      await deleteKnowledgeGraph(projectId);
      store.clearGraph();
      store.setLoading(false);
    } catch (err) {
      store.setError(err instanceof Error ? err : new Error(String(err)));
      store.setLoading(false);
    }
  }, []);

  return {
    nodes,
    selectedNodeId,
    detailNode,
    detailMembers,
    neighbors,
    loading,
    error,
    fetchNodes,
    selectNode,
    searchNodes,
    deleteGraph,
    clearSelection,
  };
}
