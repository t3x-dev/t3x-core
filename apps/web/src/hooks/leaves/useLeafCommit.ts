'use client';

/**
 * useLeafCommit — loads the leaf's parent commit, derives
 * SemanticContent + nodes + node-to-output coverage. Pure-derivation
 * memos only; no writes.
 *
 * Extracted from useLeafPageData (PR22).
 */

import type { SemanticContent } from '@t3x-dev/core';
import { useEffect, useMemo, useState } from 'react';
import type { ApiCommit, Leaf } from '@/infrastructure';
import { getApiCommit, getSemanticContent } from '@/infrastructure';
import type { NodeWithSource } from '@/types/sourceContext';

export interface NodeCoverageEntry {
  reflected: boolean;
  matchStart?: number;
  matchEnd?: number;
  snippet?: string;
}

/**
 * Pure: map each node to its best output-substring match (5→3 word
 * ngram search). Exported for tests / future extraction to domain/.
 */
export function computeNodeCoverage(
  nodes: NodeWithSource[],
  output: string | null
): Map<string, NodeCoverageEntry> {
  const result = new Map<string, NodeCoverageEntry>();
  if (!output || nodes.length === 0) {
    for (const s of nodes) {
      result.set(s.id, { reflected: false });
    }
    return result;
  }

  const lowerOutput = output.toLowerCase();

  for (const s of nodes) {
    const words = s.text.split(/\s+/).filter((w) => w.length > 0);
    let bestMatch: { start: number; end: number; snippet: string } | null = null;

    for (let n = Math.min(5, words.length); n >= 3; n--) {
      if (bestMatch) break;
      for (let i = 0; i <= words.length - n; i++) {
        const phrase = words
          .slice(i, i + n)
          .join(' ')
          .toLowerCase();
        const idx = lowerOutput.indexOf(phrase);
        if (idx !== -1) {
          const snippetStart = Math.max(0, idx - 10);
          const snippetEnd = Math.min(output.length, idx + phrase.length + 10);
          bestMatch = {
            start: idx,
            end: idx + phrase.length,
            snippet: output.slice(snippetStart, snippetEnd),
          };
          break;
        }
      }
    }

    if (bestMatch) {
      result.set(s.id, {
        reflected: true,
        matchStart: bestMatch.start,
        matchEnd: bestMatch.end,
        snippet: bestMatch.snippet,
      });
    } else {
      result.set(s.id, { reflected: false });
    }
  }

  return result;
}

export interface UseLeafCommitReturn {
  commitData: ApiCommit | null;
  commitLoadError: boolean;
  semanticContent: SemanticContent | null;
  nodes: NodeWithSource[];
  nodeCoverage: Map<string, NodeCoverageEntry>;
}

export function useLeafCommit(leaf: Leaf | null): UseLeafCommitReturn {
  const [commitData, setCommitData] = useState<ApiCommit | null>(null);
  const [commitLoadError, setCommitLoadError] = useState(false);

  useEffect(() => {
    if (!leaf?.commit_hash) return;
    getApiCommit(leaf.commit_hash)
      .then(setCommitData)
      .catch(() => {
        setCommitLoadError(true);
      });
  }, [leaf?.commit_hash]);

  const semanticContent = useMemo(
    () => (commitData ? getSemanticContent(commitData) : null),
    [commitData]
  );

  const nodes = useMemo((): NodeWithSource[] => {
    if (!semanticContent) return [];
    // Dynamic require used to avoid pulling the tree-compat module into
    // the initial bundle; behaviour preserved from useLeafPageData.
    const { treesToNodes } = require('@/domain/tree/treeCompat');
    const raw = treesToNodes(semanticContent.trees);
    return raw.map((f: { id: string; type: string; slots: Record<string, unknown> }) => ({
      id: f.id,
      text: `[${f.type}] ${Object.entries(f.slots)
        .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join('; ')}`,
      source: undefined,
    }));
  }, [semanticContent]);

  const nodeCoverage = useMemo(
    () => computeNodeCoverage(nodes, leaf?.output ?? null),
    [nodes, leaf?.output]
  );

  return { commitData, commitLoadError, semanticContent, nodes, nodeCoverage };
}
