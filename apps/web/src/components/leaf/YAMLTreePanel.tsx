'use client';

/**
 * YAMLTreePanel — Renders commit frames as a structured YAML tree.
 *
 * Used in Leaf detail page left panel. Serves both Generate and Display modes:
 * - Generate: each frame shows Require/Exclude buttons for constraint creation
 * - Display: each frame shows assertion pass/fail badges, highlighted on hover
 */

import type { SemanticContent } from '@t3x-dev/core';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useMemo, type ReactNode } from 'react';
import { FrameYAMLRenderer } from '@/components/shared/FrameYAMLRenderer';
import type { WorkspaceMode } from '@/hooks/useLeafPageData';
import type { Assertion, Constraint } from '@/lib/api/leaves';
import { nestFrames } from '@/lib/frameNesting';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface YAMLTreePanelProps {
  content: SemanticContent;
  mode: WorkspaceMode;
  constraints: Constraint[];
  assertions?: Assertion[];
  saving: boolean;
  commitHash?: string;
  projectId?: string;
  onAddConstraintFromSource: (
    type: 'require' | 'exclude',
    value: string,
    sourceFrameId: string
  ) => void;
  /** ID of constraint/frame being hovered in QualityPanel */
  highlightedConstraintId?: string | null;
  onHoverFrame?: (frameId: string | null) => void;
}

// ============================================================================
// YAMLTreePanel
// ============================================================================

export function YAMLTreePanel({
  content,
  mode,
  constraints,
  assertions,
  saving,
  commitHash,
  projectId,
  onAddConstraintFromSource,
  highlightedConstraintId,
  onHoverFrame,
}: YAMLTreePanelProps) {
  const nested = useMemo(() => nestFrames(content), [content]);

  // Determine which frame is highlighted based on hovered constraint
  const highlightedFrameId = useMemo(() => {
    if (!highlightedConstraintId || !constraints) return null;
    const constraint = constraints.find((c) => c.id === highlightedConstraintId);
    if (!constraint) return null;
    if ('source_frame' in constraint && constraint.source_frame) {
      // Find frame by type match
      const frame = content.frames.find(
        (f) => f.type === (constraint as { source_frame?: { frame_type?: string } }).source_frame?.frame_type
      );
      return frame?.id ?? null;
    }
    return null;
  }, [highlightedConstraintId, constraints, content.frames]);

  const renderFrameActions = useCallback(
    (frameId: string, frameType: string): ReactNode => {
      if (mode === 'generate') {
        const frame = content.frames.find((f) => f.id === frameId);
        const frameValue = frame
          ? Object.entries(frame.slots)
              .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
              .join('; ')
          : '';
        return (
          <div className="mt-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              className="px-1.5 py-0.5 text-[10px] font-medium rounded border border-transparent hover:border-[var(--status-success)]/30 hover:bg-[var(--status-success-muted)] text-[var(--status-success)] transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onAddConstraintFromSource('require', frameValue, frameId);
              }}
              disabled={saving}
            >
              Require
            </button>
            <button
              type="button"
              className="px-1.5 py-0.5 text-[10px] font-medium rounded border border-transparent hover:border-[var(--status-error)]/30 hover:bg-[var(--status-error-muted)] text-[var(--status-error)] transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onAddConstraintFromSource('exclude', frameValue, frameId);
              }}
              disabled={saving}
            >
              Exclude
            </button>
          </div>
        );
      }

      if (mode === 'display') {
        const frameAssertions =
          assertions?.filter((a) => {
            const c = constraints.find((c) => c.id === a.constraint_id);
            return (
              c &&
              'source_frame' in c &&
              (c as { source_frame?: { frame_type?: string } }).source_frame?.frame_type ===
                frameType
            );
          }) ?? [];
        if (frameAssertions.length > 0) {
          const allPassed = frameAssertions.every((a) => a.passed);
          return allPassed ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--status-success-muted)] text-[var(--status-success)]">
              &#10003; {frameAssertions.length} passed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--status-error)]/10 text-[var(--status-error)]">
              &#10007; {frameAssertions.filter((a) => !a.passed).length} failed
            </span>
          );
        }
      }

      return null;
    },
    [mode, content.frames, constraints, assertions, saving, onAddConstraintFromSource]
  );

  const getFrameMeta = useCallback(
    (frameId: string) => {
      const frame = content.frames.find((f) => f.id === frameId);
      return frame?.confidence != null ? { confidence: frame.confidence } : undefined;
    },
    [content.frames]
  );

  return (
    <aside
      className={cn(
        'hidden md:flex w-[320px] min-w-[320px] shrink-0 flex-col overflow-y-auto border-r',
        'bg-[color-mix(in_srgb,var(--surface-panel)_88%,transparent)]',
        'backdrop-blur-[var(--fx-blur-panel)]'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--stroke-divider)] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
            Source YAML
          </span>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--surface-elevated)] text-[var(--text-tertiary)]">
            {nested.length}
          </span>
        </div>
        {commitHash && projectId && (
          <Link
            href={`/project/${projectId}/commit/${encodeURIComponent(commitHash)}`}
            className="text-xs text-[var(--accent-leaf)] hover:underline flex items-center gap-1"
          >
            <ExternalLink className="h-3 w-3" />
            View Commit
          </Link>
        )}
      </div>

      {/* Frame YAML tree */}
      <div className="flex-1 overflow-y-auto p-3">
        <FrameYAMLRenderer
          frames={nested}
          renderFrameActions={renderFrameActions}
          highlightFrameId={highlightedFrameId}
          getFrameMeta={getFrameMeta}
          onHoverFrame={onHoverFrame}
        />
        {nested.length === 0 && (
          <p className="py-8 text-center text-xs text-[var(--text-tertiary)]">
            No content in this commit.
          </p>
        )}
      </div>
    </aside>
  );
}
