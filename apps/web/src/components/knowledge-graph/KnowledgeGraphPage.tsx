'use client';

import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useKnowledgeGraph } from '@/hooks/knowledge-graph/useKnowledgeGraph';
import { cn } from '@/utils/cn';
import { KGCanvas } from './KGCanvas';
import { KGDetailPanel } from './KGDetailPanel';
import { KGToolbar } from './KGToolbar';

interface KnowledgeGraphPageProps {
  projectId: string;
}

export function KnowledgeGraphPage({ projectId }: KnowledgeGraphPageProps) {
  const { nodes, loading, building, error, fetchNodes, buildGraph } = useKnowledgeGraph();

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
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <div className="text-center">
              <p className="text-lg font-medium text-[var(--text-primary)]">
                No knowledge graph yet
              </p>
              <p className="mt-1 text-sm text-[var(--text-tertiary)]">
                Build a knowledge graph from your project's committed nodes.
              </p>
            </div>
            <Button
              onClick={() => buildGraph(projectId)}
              disabled={building}
              className={cn('gap-2', building && 'pointer-events-none')}
            >
              {building && <Loader2 className="h-4 w-4 animate-spin" />}
              Build Knowledge Graph
            </Button>
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
