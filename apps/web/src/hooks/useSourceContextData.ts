/**
 * useSourceContextData — Fetches turn context and leaf data for commit source display.
 *
 * Extracted from CommitSourceContext to separate data fetching from rendering.
 */

import { useEffect, useState } from 'react';
import type {
  NodeWithHighlight,
  TurnWithHighlights,
} from '@/components/source-context/SourceConversationPanel';
import type { Leaf } from '@/lib/api';
import * as api from '@/lib/api';
import { checkContentIntegrity } from '@/lib/truncationUtils';
import type { ContentIntegrityStatus, NodeWithSource } from '@/types/sourceContext';

// ═══════════════════════════════════════════════════════════════════════════
// Leaf Cache (module-level, shared across instances)
// ═══════════════════════════════════════════════════════════════════════════

const leafCache = new Map<string, { data: Leaf; fetchedAt: number }>();
const LEAF_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchLeafCached(leafId: string): Promise<Leaf | null> {
  const cached = leafCache.get(leafId);
  if (cached && Date.now() - cached.fetchedAt < LEAF_CACHE_TTL) {
    return cached.data;
  }
  try {
    const leaf = await api.getLeaf(leafId);
    leafCache.set(leafId, { data: leaf, fetchedAt: Date.now() });
    return leaf;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface LeafContentNode {
  node: NodeWithSource;
  leafId: string;
}

export interface LeafWithNodes {
  leafId: string;
  leaf: Leaf | null;
  nodes: LeafContentNode[];
  loading: boolean;
  error: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Hook
// ═══════════════════════════════════════════════════════════════════════════

export function useSourceContextData(
  turnHashes: string[],
  leafIds: string[],
  byTurn: Map<string, NodeWithHighlight[]>,
  byLeaf: Map<string, LeafContentNode[]>,
  compact: boolean
) {
  const [turnData, setTurnData] = useState<Map<string, TurnWithHighlights>>(new Map());
  const [leafData, setLeafData] = useState<Map<string, LeafWithNodes>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (turnHashes.length === 0 && leafIds.length === 0) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const fetchAll = async () => {
      setIsLoading(true);

      // --- Fetch turns ---
      const newTurnData = new Map<string, TurnWithHighlights>();
      const hashesToFetch = compact ? turnHashes.slice(0, 2) : turnHashes;

      const turnPromises = hashesToFetch.map(async (turnHash) => {
        const nodeGroup = byTurn.get(turnHash) || [];
        const highlights = nodeGroup.map((s) => s.highlight);

        try {
          const context = await api.fetchTurnContextCached(turnHash, {
            before: 0,
            after: 0,
          });

          const integrityStatus = new Map<string, ContentIntegrityStatus>();
          if (context?.target_turn?.content) {
            for (const sg of nodeGroup) {
              const status = checkContentIntegrity(
                sg.node.text,
                context.target_turn.content,
                sg.highlight.start,
                sg.highlight.end,
                sg.node.anchor_type
              );
              integrityStatus.set(sg.node.id, status);
            }
          }

          if (!cancelled) {
            newTurnData.set(turnHash, {
              turnHash,
              context,
              highlights,
              nodes: nodeGroup,
              loading: false,
              error: null,
              integrityStatus,
            });
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to load context';
          if (!cancelled) {
            newTurnData.set(turnHash, {
              turnHash,
              context: null,
              highlights,
              nodes: nodeGroup,
              loading: false,
              error: errorMsg,
              integrityStatus: new Map(),
            });
          }
        }
      });

      // --- Fetch leaves ---
      const newLeafData = new Map<string, LeafWithNodes>();

      const leafPromises = leafIds.map(async (leafId) => {
        const nodeGroup = byLeaf.get(leafId) || [];

        try {
          const leaf = await fetchLeafCached(leafId);
          if (!cancelled) {
            newLeafData.set(leafId, {
              leafId,
              leaf,
              nodes: nodeGroup,
              loading: false,
              error: leaf ? null : 'Leaf not found',
            });
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to load leaf';
          if (!cancelled) {
            newLeafData.set(leafId, {
              leafId,
              leaf: null,
              nodes: nodeGroup,
              loading: false,
              error: errorMsg,
            });
          }
        }
      });

      await Promise.all([...turnPromises, ...leafPromises]);

      if (!cancelled) {
        setTurnData(newTurnData);
        setLeafData(newLeafData);
        setIsLoading(false);
      }
    };

    fetchAll();

    return () => {
      cancelled = true;
    };
  }, [turnHashes, leafIds, byTurn, byLeaf, compact]);

  return { turnData, leafData, isLoading };
}
