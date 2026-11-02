import { BaseEdge, type EdgeProps, getSmoothStepPath, useStore } from '@xyflow/react';
import { useState } from 'react';
import { getBranchVisual, getCanvasNodeBranch } from '@/domain/canvas/branchVisuals';
import type { CanvasNodeData } from '@/types/nodes';

export type SemanticEdgeType = 'evolve' | 'merge' | 'pending';
export type EdgeRhythm = 'default' | 'selected' | 'dimmed';
export type EdgePathTone = 'commit' | 'branch';

// Color palettes per semantic edge type
const edgeColors: Record<
  SemanticEdgeType,
  { base: string; hover: string; selected: string; glow: string }
> = {
  evolve: {
    base: 'var(--edge-evolve-base)',
    hover: 'var(--edge-evolve-hover)',
    selected: 'var(--edge-evolve-selected)',
    glow: 'var(--edge-evolve-glow)',
  },
  merge: {
    base: 'var(--edge-merge-base)',
    hover: 'var(--edge-merge-hover)',
    selected: 'var(--edge-merge-selected)',
    glow: 'var(--edge-merge-glow)',
  },
  pending: {
    base: 'var(--accent-pending)',
    hover: 'color-mix(in srgb, var(--accent-pending) 86%, var(--text-primary))',
    selected: 'color-mix(in srgb, var(--accent-pending) 72%, var(--text-primary))',
    glow: 'color-mix(in srgb, var(--accent-pending) 34%, transparent)',
  },
};

const pathToneColors: Record<EdgePathTone, { selected: string; glow: string }> = {
  commit: {
    selected: 'var(--edge-commit-selected)',
    glow: 'var(--edge-commit-glow)',
  },
  branch: {
    selected: 'var(--edge-branch-selected)',
    glow: 'var(--edge-branch-glow)',
  },
};

/**
 * AnimatedEdge — Semantic edge with type-driven coloring.
 *
 * Edge types:
 * - evolve (blue): Single-parent commit lineage
 * - merge (purple): Multi-parent merge commit
 *
 * Supports hover, selected, and dragging states with color/width transitions.
 */
export function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  selected,
  source,
  target,
  data,
}: EdgeProps) {
  const [isHovered, setIsHovered] = useState(false);

  const edgeType: SemanticEdgeType = (data?.edgeType as SemanticEdgeType) || 'evolve';
  const edgeRhythm: EdgeRhythm = (data?.edgeRhythm as EdgeRhythm | undefined) ?? 'default';
  const edgePathTone: EdgePathTone = (data?.edgePathTone as EdgePathTone | undefined) ?? 'commit';
  const isRhythmSelected = selected || edgeRhythm === 'selected';
  const colors = edgeColors[edgeType];
  const pathColors = pathToneColors[edgePathTone];

  const targetBranchName = useStore((state) => {
    const targetNode = state.nodeLookup?.get(target);
    return targetNode ? getCanvasNodeBranch(targetNode.data as CanvasNodeData) : undefined;
  });
  const branchVisual =
    edgeType !== 'pending' && typeof targetBranchName === 'string'
      ? getBranchVisual(targetBranchName)
      : undefined;

  // Detect if connected node is being dragged
  const isDragging = useStore((s) => {
    const sourceNode = s.nodeLookup?.get(source);
    const targetNode = s.nodeLookup?.get(target);
    return !!(sourceNode?.dragging || targetNode?.dragging);
  });

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
  });

  const getStrokeWidth = () => {
    if (isRhythmSelected) return 3.6;
    if (isHovered) return 3.2;
    if (edgeRhythm === 'dimmed') return 1.8;
    return 2.8;
  };

  const getStrokeColor = () => {
    if (branchVisual) {
      return isRhythmSelected || isHovered ? branchVisual.strong : branchVisual.accent;
    }
    if (isRhythmSelected) return edgeRhythm === 'selected' ? pathColors.selected : colors.selected;
    if (isHovered) return colors.hover;
    return colors.base;
  };

  const getStrokeOpacity = () => {
    if (isRhythmSelected) return 'var(--edge-selected-opacity)';
    if (isHovered) return 'var(--edge-hover-opacity)';
    if (edgeRhythm === 'dimmed') return 'var(--edge-dim-opacity)';
    return 'var(--edge-default-opacity)';
  };

  // Merge edges use a dashed stroke.
  const dashOverride = isDragging
    ? '6 4'
    : edgeType === 'merge'
      ? '8 5'
      : edgeType === 'pending'
        ? '7 5'
        : undefined;
  const strokeColor = getStrokeColor();
  const branchMarkerId = `branch-arrow-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

  return (
    <g
      data-edge-branch={branchVisual?.key}
      data-edge-path-tone={edgePathTone}
      data-edge-rhythm={edgeRhythm}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ cursor: 'pointer' }}
    >
      {branchVisual && (
        <defs>
          <marker
            id={branchMarkerId}
            markerHeight="15"
            markerUnits="strokeWidth"
            markerWidth="15"
            orient="auto-start-reverse"
            refX="0"
            refY="0"
            viewBox="-10 -10 20 20"
          >
            <polyline
              fill={strokeColor}
              points="-7,-6 0,0 -7,6 -7,-6"
              stroke={strokeColor}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1"
            />
          </marker>
        </defs>
      )}

      {/* Selection glow ring */}
      {isRhythmSelected && (
        <path
          data-testid={`edge-glow-${id}`}
          d={edgePath}
          fill="none"
          strokeWidth={14}
          stroke={branchVisual?.glow ?? (edgeRhythm === 'selected' ? pathColors.glow : colors.glow)}
          strokeLinecap="round"
          style={{ opacity: 0.12, filter: 'blur(5px)' }}
        />
      )}

      {/* Hover glow */}
      {isHovered && !selected && (
        <path
          d={edgePath}
          fill="none"
          strokeWidth={8}
          stroke={branchVisual?.strong ?? colors.hover}
          strokeLinecap="round"
          style={{ opacity: 0.1, filter: 'blur(3px)' }}
        />
      )}

      {/* Base edge */}
      <BaseEdge
        id={id}
        markerEnd={branchVisual ? `url(#${branchMarkerId})` : markerEnd}
        path={edgePath}
        style={{
          ...style,
          strokeWidth: getStrokeWidth(),
          stroke: strokeColor,
          opacity: getStrokeOpacity(),
          ...(dashOverride ? { strokeDasharray: dashOverride } : {}),
          transition:
            'stroke-width var(--duration-normal) ease, stroke var(--duration-normal) ease, opacity var(--duration-normal) ease',
        }}
      />
    </g>
  );
}

export default AnimatedEdge;
