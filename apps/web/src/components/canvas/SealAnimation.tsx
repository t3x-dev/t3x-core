'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useReducedMotion } from '@/hooks/shared/useReducedMotion';

interface SealAnimationProps {
  width: number;
  height: number;
  borderRadius: number;
  isActive: boolean;
  onComplete?: () => void;
}

/**
 * SealAnimation — 2-phase commit seal: trace border → done.
 *
 * Provides meaningful "knowledge committed" feedback without excessive
 * decoration. No fill gradient, no ripple — just a clean border trace.
 */
export function SealAnimation({
  width,
  height,
  borderRadius: r,
  isActive,
  onComplete,
}: SealAnimationProps) {
  const [phase, setPhase] = useState<'idle' | 'tracing' | 'done'>('idle');
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!isActive) {
      setPhase('idle');
      return;
    }

    if (prefersReducedMotion) {
      setPhase('done');
      onComplete?.();
      return;
    }

    setPhase('tracing');
    const timer = setTimeout(() => {
      setPhase('done');
      onComplete?.();
    }, 300);

    return () => clearTimeout(timer);
  }, [isActive, onComplete, prefersReducedMotion]);

  if (phase === 'idle' || phase === 'done') return null;

  // Rounded-rect perimeter calculation
  const straightH = width - 2 * r;
  const straightV = height - 2 * r;
  const cornerArc = (2 * Math.PI * r) / 4;
  const perimeter = 2 * straightH + 2 * straightV + 4 * cornerArc;

  // SVG path: clockwise rounded-rect starting from top-left
  const path = [
    `M ${r} 0`,
    `H ${width - r}`,
    `A ${r} ${r} 0 0 1 ${width} ${r}`,
    `V ${height - r}`,
    `A ${r} ${r} 0 0 1 ${width - r} ${height}`,
    `H ${r}`,
    `A ${r} ${r} 0 0 1 0 ${height - r}`,
    `V ${r}`,
    `A ${r} ${r} 0 0 1 ${r} 0`,
    'Z',
  ].join(' ');

  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: 10 }}>
      <svg
        width={width}
        height={height}
        className="absolute inset-0"
        style={{ overflow: 'visible' }}
      >
        <title>Seal animation border</title>
        <motion.path
          d={path}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={perimeter}
          initial={{ strokeDashoffset: perimeter }}
          animate={{ strokeDashoffset: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        />
      </svg>
    </div>
  );
}
