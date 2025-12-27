import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react'

/**
 * AnimatedEdge - A smooth step edge with subtle flow animation
 * Uses CSS keyframes to show data flowing between nodes
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
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
  })

  return (
    <>
      {/* Base edge (static background) */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          strokeWidth: 2,
          stroke: 'var(--edge-color, #94a3b8)',
        }}
      />
      {/* Animated overlay for flow effect */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={2}
        stroke="url(#edge-gradient)"
        strokeLinecap="round"
        style={{
          strokeDasharray: 8,
          animation: 'edge-flow 1.5s linear infinite',
        }}
      />
      {/* SVG gradient definition */}
      <defs>
        <linearGradient id="edge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="transparent" />
          <stop offset="50%" stopColor="var(--edge-active-color, #3b82f6)" stopOpacity="0.6" />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>
    </>
  )
}

export default AnimatedEdge
