import { create } from 'zustand';
import type {
  BuildResult,
  KnowledgeNode,
  NeighborNode,
  NodeMember,
} from '@/lib/api/knowledge-graph';
import * as kgApi from '@/lib/api/knowledge-graph';

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

  fetchNodes: (projectId: string) => Promise<void>;
  buildGraph: (projectId: string) => Promise<BuildResult | null>;
  selectNode: (projectId: string, nodeId: string) => Promise<void>;
  searchNodes: (projectId: string, query: string) => Promise<void>;
  deleteGraph: (projectId: string) => Promise<void>;
  clearSelection: () => void;
}

let fetchGeneration = 0;

export const useKnowledgeGraphStore = create<KnowledgeGraphState>((set, get) => ({
  nodes: [],
  selectedNodeId: null,
  detailNode: null,
  detailMembers: [],
  neighbors: [],
  loading: false,
  building: false,
  error: null,
  buildResult: null,

  fetchNodes: async (projectId) => {
    const gen = ++fetchGeneration;
    set({ loading: true, error: null });
    try {
      const nodes = await kgApi.listKnowledgeNodes(projectId, 200);
      if (gen !== fetchGeneration) return; // stale request — discard
      set({ nodes, loading: false });
    } catch (err) {
      if (gen !== fetchGeneration) return;
      set({ error: err instanceof Error ? err : new Error(String(err)), loading: false });
    }
  },

  buildGraph: async (projectId) => {
    set({ building: true, error: null });
    try {
      const result = await kgApi.buildKnowledgeGraph(projectId);
      set({ buildResult: result, building: false });
      await get().fetchNodes(projectId);
      return result;
    } catch (err) {
      set({ error: err instanceof Error ? err : new Error(String(err)), building: false });
      return null;
    }
  },

  selectNode: async (projectId, nodeId) => {
    set({ selectedNodeId: nodeId });
    try {
      const [node, neighbors] = await Promise.all([
        kgApi.getKnowledgeNode(projectId, nodeId),
        kgApi.getNodeNeighbors(projectId, nodeId),
      ]);
      set({
        detailNode: node,
        detailMembers: [],
        neighbors,
      });
    } catch (err) {
      set({ error: err instanceof Error ? err : new Error(String(err)) });
    }
  },

  searchNodes: async (projectId, query) => {
    set({ loading: true, error: null });
    try {
      const nodes = await kgApi.searchKnowledgeNodes(projectId, query);
      set({ nodes, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err : new Error(String(err)), loading: false });
    }
  },

  deleteGraph: async (projectId) => {
    set({ loading: true, error: null });
    try {
      await kgApi.deleteKnowledgeGraph(projectId);
      set({
        nodes: [],
        selectedNodeId: null,
        detailNode: null,
        detailMembers: [],
        neighbors: [],
        loading: false,
      });
    } catch (err) {
      set({ error: err instanceof Error ? err : new Error(String(err)), loading: false });
    }
  },

  clearSelection: () =>
    set({ selectedNodeId: null, detailNode: null, detailMembers: [], neighbors: [] }),
}));
