import { BaseEdge, type EdgeProps, getSmoothStepPath, useStore } from '@xyflow/react';
import { useState } from 'react';

export type SemanticEdgeType = 'evolve' | 'merge' | 'draft';

// Color palettes per semantic edge type
const edgeColors: Record<
  SemanticEdgeType,
  { base: string; hover: string; selected: string; glow: string }
> = {
  evolve: {
    base: 'oklch(0.55 0.08 250 / 50%)',
    hover: 'oklch(0.65 0.12 250)',
    selected: 'oklch(0.75 0.15 250)',
    glow: 'oklch(0.6 0.2 250)',
  },
  merge: {
    base: 'oklch(0.55 0.12 300 / 55%)',
    hover: 'oklch(0.65 0.16 300)',
    selected: 'oklch(0.75 0.18 300)',
    glow: 'oklch(0.6 0.22 300)',
  },
  draft: {
    base: 'oklch(0.55 0.02 250 / 45%)',
    hover: 'oklch(0.65 0.08 250)',
    selected: 'oklch(0.75 0.15 250)',
    glow: 'oklch(0.6 0.2 250)',
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
    if (selected) return 2.5;
    if (isHovered) return 2;
    return 1.5;
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
