import { BaseEdge, type EdgeProps, getSmoothStepPath, useStore } from '@xyflow/react';
import { useState } from 'react';

/**
 * AnimatedEdge — Clean static bezier edge.
 *
 * Supports hover, selected, and dragging states with color/width transitions.
 * No particles or ambient animations.
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
}: EdgeProps) {
  const [isHovered, setIsHovered] = useState(false);

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
    if (selected) return 'oklch(0.75 0.15 250)';
    if (isHovered) return 'oklch(0.65 0.08 250)';
    return 'oklch(0.55 0.02 250 / 45%)';
  };

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
          stroke="oklch(0.6 0.2 250)"
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
          stroke="oklch(0.7 0.1 250)"
          strokeLinecap="round"
          style={{ opacity: 0.1, filter: 'blur(3px)' }}
        />
      )}

      {/* Base edge — solid line, dashed when connected node is dragging */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          strokeWidth: getStrokeWidth(),
          stroke: getStrokeColor(),
          ...(isDragging ? { strokeDasharray: '6 4' } : {}),
          transition:
            'stroke-width var(--duration-normal) ease, stroke var(--duration-normal) ease',
        }}
      />
    </g>
  );
}

export default AnimatedEdge;
