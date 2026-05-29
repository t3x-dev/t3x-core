'use client';

import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useKnowledgeGraph } from '@/hooks/knowledge-graph/useKnowledgeGraph';
import { KGCanvas } from './KGCanvas';
import { KGDetailPanel } from './KGDetailPanel';
import { KGToolbar } from './KGToolbar';

interface KnowledgeGraphPageProps {
  projectId: string;
}

export function KnowledgeGraphPage({ projectId }: KnowledgeGraphPageProps) {
  const { nodes, loading, error, fetchNodes } = useKnowledgeGraph();

  useEffect(() => {
    fetchNodes(projectId);
  }, [projectId, fetchNodes]);

  const isEmpty = !loading && nodes.length === 0;

  return (
    <div className="flex h-screen flex-col">
      <KGToolbar projectId={projectId} />

      <div className="relative flex-1 overflow-hidden">
        {/* Error banner */}
        {error && (
          <div className="absolute inset-x-0 top-0 z-40 bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
            {error.message}
          </div>
        )}

        {/* Loading state */}
        {loading && nodes.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
          </div>
        )}

        {/* Empty state */}
        {isEmpty && !error && (
          <div className="flex h-full flex-col items-center justify-center">
            <div className="text-center">
              <p className="text-lg font-medium text-[var(--text-primary)]">
                No knowledge graph data
              </p>
              <p className="mt-1 text-sm text-[var(--text-tertiary)]">
                Saved graph nodes will appear here when the graph backend is enabled.
              </p>
            </div>
          </div>
        )}

        {/* Canvas */}
        {!isEmpty && !loading && <KGCanvas projectId={projectId} />}

        {/* Detail panel */}
        <KGDetailPanel projectId={projectId} />
      </div>
    </div>
  );
}
