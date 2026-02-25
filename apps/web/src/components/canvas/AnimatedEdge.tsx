import { BaseEdge, type EdgeProps, getSmoothStepPath } from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';

/**
 * AnimatedEdge - A smooth step edge with subtle flow animation
 * Uses CSS keyframes to show data flowing between nodes
 * Features:
 * - Distinct hover vs selected visual states
 * - Glow effect on hover/select
 * - Animated gradient flow
 * - Pulse glow on newly created edges
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  markerEnd: _markerEnd,
  selected,
  data: rawData,
}: EdgeProps) {
  const data = rawData as { createdAt?: number } | undefined;
  const [isHovered, setIsHovered] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const hasAnimatedRef = useRef(false);

  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Detect newly created edges and trigger one-shot pulse
  useEffect(() => {
    if (hasAnimatedRef.current || prefersReducedMotion) return;
    if (data?.createdAt && Date.now() - data.createdAt < 2000) {
      hasAnimatedRef.current = true;
      setIsNew(true);
      const timer = setTimeout(() => setIsNew(false), 1200);
      return () => clearTimeout(timer);
    }
  }, [data?.createdAt, prefersReducedMotion]);

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
    if (selected) return 10;
    if (isHovered) return 6;
    return 0;
  };

  const getGlowOpacity = () => {
    if (selected) return 0.15;
    if (isHovered) return 0.1;
    return 0;
  };

  // oklch-based stroke colors for dark mode consistency
  const getStrokeColor = () => {
    if (selected) return 'oklch(1 0 0 / 30%)';
    if (isHovered) return 'oklch(1 0 0 / 20%)';
    return 'oklch(1 0 0 / 16%)';
  };

  const transitionStyle = prefersReducedMotion
    ? {}
    : {
        transition:
          'opacity var(--duration-normal) ease, stroke-width var(--duration-normal) ease, stroke var(--duration-normal) ease',
      };

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

      {/* Pulse glow on newly created edges — CSS stroke-dashoffset animation */}
      {isNew && (
        <path
          d={edgePath}
          fill="none"
          strokeWidth={6}
          stroke="#3b82f6"
          strokeLinecap="round"
          className="edge-birth-pulse"
          style={{
            filter: 'blur(2px) drop-shadow(0 0 6px rgba(59,130,246,0.8))',
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
