import { BaseEdge, type EdgeProps, getSmoothStepPath, useStore } from '@xyflow/react';
import { useState } from 'react';

export type SemanticEdgeType = 'evolve' | 'merge' | 'draft';

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
  const colors = edgeColors[edgeType];

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
    if (selected) return 3;
    if (isHovered) return 2.5;
    return edgeType === 'draft' ? 1.6 : 2;
  };

  const getStrokeColor = () => {
    if (selected) return colors.selected;
    if (isHovered) return colors.hover;
    return colors.base;
  };

  // Merge edges use dashed stroke; draft edges keep their own dashed style from edge.style
  const dashOverride = isDragging ? '6 4' : edgeType === 'merge' ? '8 5' : undefined;

  return (
    <g
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ cursor: 'pointer' }}
    >
      {/* Selection glow ring */}
      {selected && (
        <path
          d={edgePath}
          fill="none"
          strokeWidth={14}
          stroke={colors.glow}
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
          ...(dashOverride ? { strokeDasharray: dashOverride } : {}),
          transition:
            'stroke-width var(--duration-normal) ease, stroke var(--duration-normal) ease',
        }}
      />
    </g>
  );
}

export default AnimatedEdge;
