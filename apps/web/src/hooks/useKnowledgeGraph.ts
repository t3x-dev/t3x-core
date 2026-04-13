/**
 * useKnowledgeGraph — view-facing API for the knowledge-graph domain.
 *
 * Owns I/O previously in `knowledgeGraphStore` async actions. Store is
 * passive per v2 §2.5.
 */

import { useCallback } from 'react';
import {
  type BuildResult,
  buildKnowledgeGraphFor,
  deleteKnowledgeGraphFor,
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
  const building = useKnowledgeGraphStore((s) => s.building);
  const error = useKnowledgeGraphStore((s) => s.error);
  const buildResult = useKnowledgeGraphStore((s) => s.buildResult);
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

  const buildGraph = useCallback(
    async (projectId: string): Promise<BuildResult | null> => {
      const store = useKnowledgeGraphStore.getState();
      store.setBuilding(true);
      store.setError(null);
      try {
        const result = await buildKnowledgeGraphFor(projectId);
        store.setBuildResult(result);
        store.setBuilding(false);
        await fetchNodes(projectId);
        return result;
      } catch (err) {
        store.setError(err instanceof Error ? err : new Error(String(err)));
        store.setBuilding(false);
        return null;
      }
    },
    [fetchNodes]
  );

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
      await deleteKnowledgeGraphFor(projectId);
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
    building,
    error,
    buildResult,
    fetchNodes,
    buildGraph,
    selectNode,
    searchNodes,
    deleteGraph,
    clearSelection,
  };
}
