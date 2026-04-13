/**
 * knowledgeGraphStore — pure Zustand state container per
 * docs/frontend-architecture-v2-zh.md §2.5. No I/O.
 *
 * Async actions live in `hooks/useKnowledgeGraph`.
 */

import { create } from 'zustand';
import type { BuildResult, KnowledgeNode, NeighborNode } from '@/queries/knowledgeGraph';
import type { NodeMember } from '@/types/api';

interface KnowledgeGraphState {
  nodes: KnowledgeNode[];
  selectedNodeId: string | null;
  detailNode: KnowledgeNode | null;
  detailMembers: NodeMember[];
  neighbors: NeighborNode[];
  loading: boolean;
  building: boolean;
  error: Error | null;
  buildResult: BuildResult | null;

  setNodes: (nodes: KnowledgeNode[]) => void;
  setSelectedNodeId: (id: string | null) => void;
  setDetail: (input: {
    detailNode: KnowledgeNode | null;
    detailMembers: NodeMember[];
    neighbors: NeighborNode[];
  }) => void;
  setLoading: (loading: boolean) => void;
  setBuilding: (building: boolean) => void;
  setError: (error: Error | null) => void;
  setBuildResult: (result: BuildResult | null) => void;
  clearGraph: () => void;
  clearSelection: () => void;
}

export const useKnowledgeGraphStore = create<KnowledgeGraphState>((set) => ({
  nodes: [],
  selectedNodeId: null,
  detailNode: null,
  detailMembers: [],
  neighbors: [],
  loading: false,
  building: false,
  error: null,
  buildResult: null,

  setNodes: (nodes) => set({ nodes }),
  setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
  setDetail: ({ detailNode, detailMembers, neighbors }) =>
    set({ detailNode, detailMembers, neighbors }),
  setLoading: (loading) => set({ loading }),
  setBuilding: (building) => set({ building }),
  setError: (error) => set({ error }),
  setBuildResult: (buildResult) => set({ buildResult }),

  clearGraph: () =>
    set({
      nodes: [],
      selectedNodeId: null,
      detailNode: null,
      detailMembers: [],
      neighbors: [],
    }),
  clearSelection: () =>
    set({ selectedNodeId: null, detailNode: null, detailMembers: [], neighbors: [] }),
}));
