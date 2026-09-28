'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatUserFacingError } from '@/domain/format/errors';
import { useKnowledgeGraph } from '@/hooks/knowledge-graph/useKnowledgeGraph';
import { KGCanvas } from './KGCanvas';
import { KGDetailPanel } from './KGDetailPanel';
import { KGToolbar } from './KGToolbar';

interface KnowledgeGraphPageProps {
  projectId: string;
}

export function KnowledgeGraphPage({ projectId }: KnowledgeGraphPageProps) {
  const { nodes, loading, error, fetchNodes, buildKnowledgeGraph } = useKnowledgeGraph();
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<Error | null>(null);
  const buildInFlight = useRef(false);
  const activeProjectId = useRef(projectId);
  activeProjectId.current = projectId;

  useEffect(() => {
    fetchNodes(projectId);
    setBuildError(null);
  }, [projectId, fetchNodes]);

  async function buildGraph() {
    if (buildInFlight.current) return;
    buildInFlight.current = true;
    setBuilding(true);
    setBuildError(null);
    try {
      await buildKnowledgeGraph(projectId);
      if (activeProjectId.current === projectId) await fetchNodes(projectId);
    } catch (cause) {
      if (activeProjectId.current === projectId)
        setBuildError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      buildInFlight.current = false;
      setBuilding(false);
    }
  }

  const isEmpty = !loading && nodes.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <KGToolbar projectId={projectId} />

      <div className="relative flex-1 overflow-hidden">
        {/* Error banner */}
        {(error || buildError) && (
          <div className="absolute inset-x-0 top-0 z-40 bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
            {formatUserFacingError(buildError ?? error, 'Failed to load graph.')}
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
              <p className="text-lg font-medium text-[var(--text-primary)]">No state graph data</p>
              <p className="mt-1 text-sm text-[var(--text-tertiary)]">
                Build the graph from committed project state. An empty project has no nodes to
                index.
              </p>
              <button
                className="mt-4 rounded-md border border-[var(--stroke-default)] px-4 py-2 text-sm disabled:opacity-50"
                disabled={building}
                onClick={buildGraph}
                type="button"
              >
                {building ? 'Building graph…' : 'Build graph'}
              </button>
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
