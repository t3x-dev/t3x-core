/**
 * knowledgeGraphStore — pure Zustand state container per
 * docs/frontend-architecture-v2-zh.md §2.5. No I/O.
 *
 * Async actions live in `hooks/useKnowledgeGraph`.
 */

import { create } from 'zustand';
import type { NodeMember } from '@/types/api';
import type { KnowledgeNode, NeighborNode } from '@/types/knowledgeGraph';

interface KnowledgeGraphState {
  nodes: KnowledgeNode[];
  selectedNodeId: string | null;
  detailNode: KnowledgeNode | null;
  detailMembers: NodeMember[];
  neighbors: NeighborNode[];
  loading: boolean;
  error: Error | null;

  setNodes: (nodes: KnowledgeNode[]) => void;
  setSelectedNodeId: (id: string | null) => void;
  setDetail: (input: {
    detailNode: KnowledgeNode | null;
    detailMembers: NodeMember[];
    neighbors: NeighborNode[];
  }) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: Error | null) => void;
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
  error: null,

  setNodes: (nodes) => set({ nodes }),
  setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
  setDetail: ({ detailNode, detailMembers, neighbors }) =>
    set({ detailNode, detailMembers, neighbors }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

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
