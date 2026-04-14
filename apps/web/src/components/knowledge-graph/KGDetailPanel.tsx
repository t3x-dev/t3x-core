'use client';

import { ArrowLeft, ArrowRight, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { glass } from '@/utils/theme';
import { cn } from '@/utils/cn';
import { useKnowledgeGraph } from '@/hooks/knowledge-graph/useKnowledgeGraph';

interface KGDetailPanelProps {
  projectId: string;
}

export function KGDetailPanel({ projectId }: KGDetailPanelProps) {
  const { selectedNodeId, detailNode, neighbors, clearSelection, selectNode } =
    useKnowledgeGraph();

  const isOpen = selectedNodeId !== null;

  return (
    <div
      className={cn(
        'fixed right-0 top-0 z-50 h-full w-[350px] transition-transform duration-300 ease-in-out',
        'border-l border-[var(--stroke-divider)]',
        glass.panelBase,
        isOpen ? 'translate-x-0' : 'translate-x-full'
      )}
    >
      {isOpen && (
        <div className="flex h-full flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--stroke-divider)] px-4 py-3">
            <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">
              {detailNode ? detailNode.label : 'Loading...'}
            </h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={clearSelection}
              className="h-7 w-7 rounded-lg text-[var(--text-secondary)] hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          {!detailNode ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Summary */}
              {detailNode.summary && (
                <div>
                  <p className="text-xs text-[var(--text-tertiary)] mb-1">Summary</p>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    {detailNode.summary}
                  </p>
                </div>
              )}

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-[var(--surface-card)] p-2">
                  <p className="text-xs text-[var(--text-tertiary)]">Type</p>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {detailNode.type}
                  </p>
                </div>
                <div className="rounded-lg bg-[var(--surface-card)] p-2">
                  <p className="text-xs text-[var(--text-tertiary)]">Members</p>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {detailNode.member_count}
                  </p>
                </div>
              </div>

              {/* Neighbors */}
              <div>
                <p className="text-xs text-[var(--text-tertiary)] mb-2">
                  Neighbors ({neighbors.length})
                </p>
                {neighbors.length === 0 ? (
                  <p className="text-xs text-[var(--text-tertiary)] italic">No neighbors found</p>
                ) : (
                  <div className="space-y-1.5">
                    {neighbors.map((nb) => (
                      <button
                        key={nb.edge.id}
                        type="button"
                        onClick={() => selectNode(projectId, nb.node.id)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors',
                          'bg-[var(--surface-card)] hover:bg-[var(--hover-bg)]',
                          'border border-transparent hover:border-[var(--stroke-default)]'
                        )}
                      >
                        {nb.direction === 'outgoing' ? (
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--accent-commit)]" />
                        ) : (
                          <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-[var(--accent-pending)]" />
                        )}
                        <span className="flex-1 truncate text-sm text-[var(--text-primary)]">
                          {nb.node.label}
                        </span>
                        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          {nb.edge.type}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
