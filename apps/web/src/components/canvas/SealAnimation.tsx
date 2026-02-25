'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface SealAnimationProps {
  width: number;
  height: number;
  borderRadius: number;
  isActive: boolean;
  onComplete?: () => void;
}

export function SealAnimation({
  width,
  height,
  borderRadius: r,
  isActive,
  onComplete,
}: SealAnimationProps) {
  const [phase, setPhase] = useState<'idle' | 'tracing' | 'filling' | 'ripple' | 'done'>('idle');
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
    const t1 = setTimeout(() => setPhase('filling'), 400);
    const t2 = setTimeout(() => setPhase('ripple'), 600);
    const t3 = setTimeout(() => {
      setPhase('done');
      onComplete?.();
    }, 800);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
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
      {/* Phase 1: Blue light arc traces border */}
      {(phase === 'tracing' || phase === 'filling' || phase === 'ripple') && (
        <svg
          width={width}
          height={height}
          className="absolute inset-0"
          style={{ overflow: 'visible' }}
        >
          <motion.path
            d={path}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={perimeter}
            initial={{ strokeDashoffset: perimeter }}
            animate={{ strokeDashoffset: 0 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            style={{ filter: 'drop-shadow(0 0 4px rgba(59,130,246,0.6))' }}
          />
        </svg>
      )}

      {/* Phase 2: Background radial fill */}
      {(phase === 'filling' || phase === 'ripple') && (
        <motion.div
          className="absolute inset-0"
          style={{
            borderRadius: r,
            background:
              'radial-gradient(circle at center, rgba(239,246,255,0.9) 0%, rgba(239,246,255,0) 70%)',
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1.2, opacity: 1 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        />
      )}

      {/* Phase 3: Ripple glow outward */}
      {phase === 'ripple' && (
        <motion.div
          className="absolute inset-0"
          style={{ borderRadius: r }}
          initial={{ boxShadow: '0 0 0 0px rgba(59,130,246,0.4)' }}
          animate={{ boxShadow: '0 0 0 20px rgba(59,130,246,0)' }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      )}
    </div>
  );
}
