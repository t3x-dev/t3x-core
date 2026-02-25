import { BaseEdge, type EdgeProps, getSmoothStepPath, useStore } from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';

// Particle system config
const PARTICLE_COUNT = 2;
const TRAIL_LENGTH = 6;
const TRAIL_SPACING = 0.018; // spacing between trail dots (as fraction of path)
const CYCLE_MS = 3500; // ms for one particle to traverse the full path

/**
 * AnimatedEdge - Energy pulse trail effect
 *
 * Bright glowing particles fly along the edge path with fading comet tails.
 * Uses requestAnimationFrame + path.getPointAtLength() for true particle motion.
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
  data: rawData,
}: EdgeProps) {
  const data = rawData as { createdAt?: number } | undefined;
  const [isHovered, setIsHovered] = useState(false);

  // Detect if connected node is being dragged
  const isDragging = useStore((s) => {
    const sourceNode = s.nodeLookup?.get(source);
    const targetNode = s.nodeLookup?.get(target);
    return !!(sourceNode?.dragging || targetNode?.dragging);
  });
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const hasAnimatedRef = useRef(false);
  const pathRef = useRef<SVGPathElement>(null);
  const particlesRef = useRef<SVGGElement>(null);
  const animFrameRef = useRef<number>(0);
  const isActiveRef = useRef(false);

  // Keep isActive ref in sync for the animation loop
  const isActive = selected || isHovered;
  isActiveRef.current = isActive;

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

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

  // Particle animation loop — direct DOM manipulation for performance
  useEffect(() => {
    if (prefersReducedMotion || !pathRef.current || !particlesRef.current) return;

    const path = pathRef.current;
    const totalLength = path.getTotalLength();
    const container = particlesRef.current;

    // Create DOM elements: for each particle → 1 glow + 1 head + TRAIL_LENGTH trail
    const allElements: SVGCircleElement[][] = [];
    for (let p = 0; p < PARTICLE_COUNT; p++) {
      const els: SVGCircleElement[] = [];

      // [0] = outer glow (large, blurry)
      const glow = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      glow.setAttribute('r', '6');
      glow.setAttribute('fill', '#38bdf8');
      glow.setAttribute('opacity', '0.35');
      glow.style.filter = 'blur(4px)';
      container.appendChild(glow);
      els.push(glow);

      // [1] = head (bright core)
      const head = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      head.setAttribute('r', '2.5');
      head.setAttribute('fill', '#7dd3fc');
      head.setAttribute('opacity', '1');
      container.appendChild(head);
      els.push(head);

      // [2..] = trail circles (fading, shrinking)
      for (let t = 0; t < TRAIL_LENGTH; t++) {
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        const ratio = t / TRAIL_LENGTH;
        const r = 2 - ratio * 1.5; // 2px → 0.5px
        const opacity = 0.6 - ratio * 0.55; // 0.6 → 0.05
        dot.setAttribute('r', String(Math.max(r, 0.3)));
        dot.setAttribute('fill', '#22d3ee');
        dot.setAttribute('opacity', String(Math.max(opacity, 0.03)));
        container.appendChild(dot);
        els.push(dot);
      }

      allElements.push(els);
    }

    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const active = isActiveRef.current;

      for (let p = 0; p < PARTICLE_COUNT; p++) {
        // Each particle is offset evenly along the path
        const basePhase = ((elapsed / CYCLE_MS) + p / PARTICLE_COUNT) % 1;
        const els = allElements[p];

        // Update glow
        const glowPos = path.getPointAtLength(basePhase * totalLength);
        els[0].setAttribute('cx', String(glowPos.x));
        els[0].setAttribute('cy', String(glowPos.y));
        els[0].setAttribute('r', active ? '8' : '6');
        els[0].setAttribute('opacity', active ? '0.5' : '0.35');

        // Update head
        els[1].setAttribute('cx', String(glowPos.x));
        els[1].setAttribute('cy', String(glowPos.y));
        els[1].setAttribute('r', active ? '3' : '2.5');

        // Update trail dots
        for (let t = 0; t < TRAIL_LENGTH; t++) {
          const trailPhase = basePhase - (t + 1) * TRAIL_SPACING;
          // Wrap around: if trailPhase < 0, particle hasn't reached this part yet
          const clamped = ((trailPhase % 1) + 1) % 1;
          const pos = path.getPointAtLength(clamped * totalLength);
          els[t + 2].setAttribute('cx', String(pos.x));
          els[t + 2].setAttribute('cy', String(pos.y));
        }
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    };
  }, [edgePath, prefersReducedMotion]);

  const getStrokeWidth = () => {
    if (selected) return 2.5;
    if (isHovered) return 2;
    return 1.5;
  };

  const getStrokeColor = () => {
    if (selected) return 'oklch(0.75 0.15 250)';
    if (isHovered) return 'oklch(0.65 0.08 250)';
    return 'oklch(1 0 0 / 14%)';
  };

  const transitionStyle = prefersReducedMotion
    ? {}
    : {
        transition:
          'stroke-width var(--duration-normal) ease, stroke var(--duration-normal) ease',
      };

  return (
    <g
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ cursor: 'pointer' }}
    >
      {/* Hidden path for getPointAtLength() */}
      <path ref={pathRef} d={edgePath} fill="none" stroke="none" />

      {/* Selection glow ring */}
      {selected && (
        <path
          d={edgePath}
          fill="none"
          strokeWidth={14}
          stroke="oklch(0.6 0.2 250)"
          strokeLinecap="round"
          style={{
            opacity: 0.12,
            filter: prefersReducedMotion ? 'none' : 'blur(5px)',
          }}
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

      {/* Base edge — solid subtle line, dashed when connected node is dragging */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          strokeWidth: getStrokeWidth(),
          stroke: getStrokeColor(),
          ...(isDragging ? { strokeDasharray: '6 4' } : {}),
          ...transitionStyle,
        }}
      />

      {/* Particle container — filled by requestAnimationFrame */}
      <g ref={particlesRef} />

      {/* Birth glow on newly created edges */}
      {isNew && (
        <>
          <path
            d={edgePath}
            fill="none"
            strokeWidth={14}
            stroke="#3b82f6"
            strokeLinecap="round"
            className="edge-birth-glow"
            style={{ filter: 'blur(6px)' }}
          />
          <path
            d={edgePath}
            fill="none"
            strokeWidth={4}
            stroke="#60a5fa"
            strokeLinecap="round"
            className="edge-birth-glow"
          />
        </>
      )}
    </g>
  );
}

export default AnimatedEdge;
