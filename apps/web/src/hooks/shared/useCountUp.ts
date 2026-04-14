import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/hooks/shared/useReducedMotion';

/**
 * useCountUp — animates a number from 0 to target with ease-out curve.
 * Plays once on first render; subsequent target changes update immediately.
 *
 * @param target  The final number to display
 * @param duration  Animation duration in ms (default 300)
 * @param enabled  Set false to skip animation entirely (default true)
 */
export function useCountUp(target: number, duration = 300, enabled = true): number {
  const prefersReducedMotion = useReducedMotion();
  const [value, setValue] = useState(0);
  const hasAnimated = useRef(false);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    // Skip animation: reduced motion, disabled, zero target, or already animated
    if (prefersReducedMotion || !enabled || target === 0 || hasAnimated.current) {
      setValue(target);
      return;
    }

    hasAnimated.current = true;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // Cubic ease-out: 1 - (1-t)^3
      const eased = 1 - (1 - t) ** 3;
      setValue(Math.round(eased * target));

      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration, enabled, prefersReducedMotion]);

  return value;
}
