import { BaseEdge, type EdgeProps, getSmoothStepPath } from '@xyflow/react';
import { useState, useEffect } from 'react';

/**
 * AnimatedEdge - A smooth step edge with subtle flow animation
 * Uses CSS keyframes to show data flowing between nodes
 * Features:
 * - Distinct hover vs selected visual states
 * - Glow effect on hover/select
 * - Animated gradient flow
 * - Respects prefers-reduced-motion
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
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

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

  // Differentiate selected vs hovered appearance
  const getStrokeWidth = () => {
    if (selected) return 3;
    if (isHovered) return 2.5;
    return 2;
  };

  const getGlowWidth = () => {
    if (selected) return 12;
    if (isHovered) return 8;
    return 0;
  };

  const getGlowOpacity = () => {
    if (selected) return 0.25;
    if (isHovered) return 0.15;
    return 0;
  };

  // Selected uses blue, hovered uses a softer slate-blue
  const getStrokeColor = () => {
    if (selected) return 'var(--edge-selected-color, #2563eb)';
    if (isHovered) return 'var(--edge-active-color, #3b82f6)';
    return 'var(--edge-color, #94a3b8)';
  };

  const transitionStyle = prefersReducedMotion
    ? {}
    : { transition: 'opacity 0.2s ease, stroke-width 0.2s ease, stroke 0.2s ease' };

  return (
    <g
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ cursor: 'pointer' }}
    >
      {/* Selection ring (visible when selected) */}
      {selected && (
        <path
          d={edgePath}
          fill="none"
          strokeWidth={16}
          stroke="var(--edge-selected-color, #2563eb)"
          strokeLinecap="round"
          style={{
            opacity: 0.08,
            filter: prefersReducedMotion ? 'none' : 'blur(4px)',
            ...transitionStyle,
          }}
        />
      )}

      {/* Glow effect (visible on hover/select) */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={getGlowWidth()}
        stroke={getStrokeColor()}
        strokeLinecap="round"
        style={{
          opacity: getGlowOpacity(),
          filter: prefersReducedMotion ? 'none' : 'blur(3px)',
          ...transitionStyle,
        }}
      />

      {/* Base edge (static background) */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          strokeWidth: getStrokeWidth(),
          stroke: getStrokeColor(),
          ...transitionStyle,
        }}
      />

      {/* Animated overlay for flow effect (disabled for reduced motion) */}
      {!prefersReducedMotion && (
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
            ...transitionStyle,
          }}
        />
      )}

      {/* SVG gradient definition - unique per edge */}
      <defs>
        <linearGradient id={`edge-gradient-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="transparent" />
          <stop offset="50%" stopColor={getStrokeColor()} stopOpacity={isActive ? 0.8 : 0.4} />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>
    </g>
  );
}

export default AnimatedEdge;
