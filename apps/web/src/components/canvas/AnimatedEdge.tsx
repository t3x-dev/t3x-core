import { BaseEdge, type EdgeProps, getSmoothStepPath } from '@xyflow/react';
import { useState } from 'react';

/**
 * AnimatedEdge - A smooth step edge with subtle flow animation
 * Uses CSS keyframes to show data flowing between nodes
 * Features:
 * - Glow effect on hover
 * - Animated gradient flow
 * - Smooth opacity transitions
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
  markerEnd: _markerEnd,
  selected,
}: EdgeProps) {
  const [isHovered, setIsHovered] = useState(false);

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
  });

  const isActive = selected || isHovered;

  return (
    <g
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ cursor: 'pointer' }}
    >
      {/* Glow effect (visible on hover/select) */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={isActive ? 8 : 0}
        stroke="var(--edge-active-color, #3b82f6)"
        strokeLinecap="round"
        style={{
          opacity: isActive ? 0.15 : 0,
          transition: 'opacity 0.2s ease, stroke-width 0.2s ease',
          filter: 'blur(3px)',
        }}
      />

      {/* Base edge (static background) */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          strokeWidth: isActive ? 2.5 : 2,
          stroke: isActive ? 'var(--edge-active-color, #3b82f6)' : 'var(--edge-color, #94a3b8)',
          transition: 'stroke 0.2s ease, stroke-width 0.2s ease',
        }}
      />

      {/* Animated overlay for flow effect */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={2}
        stroke={`url(#edge-gradient-${id})`}
        strokeLinecap="round"
        style={{
          strokeDasharray: 8,
          animation: 'edge-flow 1.5s linear infinite',
          opacity: isActive ? 1 : 0.5,
          transition: 'opacity 0.2s ease',
        }}
      />

      {/* SVG gradient definition - unique per edge */}
      <defs>
        <linearGradient id={`edge-gradient-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="transparent" />
          <stop offset="50%" stopColor="var(--edge-active-color, #3b82f6)" stopOpacity={isActive ? 0.8 : 0.4} />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>
    </g>
  );
}

export default AnimatedEdge;
