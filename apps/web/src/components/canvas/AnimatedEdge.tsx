import { BaseEdge, type EdgeProps, getSmoothStepPath, useStore } from '@xyflow/react';
import { useState } from 'react';

export type SemanticEdgeType = 'evolve' | 'merge' | 'draft';
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
  draft: {
    base: 'var(--edge-draft-base)',
    hover: 'var(--edge-draft-hover)',
    selected: 'var(--edge-draft-selected)',
    glow: 'var(--edge-draft-glow)',
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
 * - draft (gray, dashed+animated): Draft/staging edges
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  markerEnd: _markerEnd,
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
    if (isRhythmSelected) return 2.5;
    if (isHovered) return 2.25;
    if (edgeRhythm === 'dimmed') return 1.25;
    return edgeType === 'draft' ? 1.35 : 2;
  };

  const getStrokeColor = () => {
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

  // Merge edges use dashed stroke; draft edges keep their own dashed style from edge.style
  const dashOverride = isDragging ? '6 4' : edgeType === 'merge' ? '8 5' : undefined;

  return (
    <g
      data-edge-path-tone={edgePathTone}
      data-edge-rhythm={edgeRhythm}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ cursor: 'pointer' }}
    >
      {/* Selection glow ring */}
      {isRhythmSelected && (
        <path
          data-testid={`edge-glow-${id}`}
          d={edgePath}
          fill="none"
          strokeWidth={14}
          stroke={edgeRhythm === 'selected' ? pathColors.glow : colors.glow}
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
          stroke={colors.hover}
          strokeLinecap="round"
          style={{ opacity: 0.1, filter: 'blur(3px)' }}
        />
      )}

      {/* Base edge */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          strokeWidth: getStrokeWidth(),
          stroke: getStrokeColor(),
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
