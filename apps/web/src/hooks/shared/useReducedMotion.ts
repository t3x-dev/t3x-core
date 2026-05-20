/**
 * Hook to detect user's reduced motion preference
 *
 * Usage:
 *   const prefersReducedMotion = useReducedMotion()
 *
 *   <motion.div
 *     animate={{ x: prefersReducedMotion ? 0 : 100 }}
 *     transition={prefersReducedMotion ? { duration: 0 } : springConfig.gentle}
 *   />
 */

import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Returns true if the user prefers reduced motion
 * Automatically updates when the preference changes
 */
export function useReducedMotion(): boolean {
  // Default to false on server, will be updated on client
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mediaQuery = window.matchMedia(QUERY);

    // Set initial value
    setPrefersReducedMotion(mediaQuery.matches);

    // Listen for changes
    const handler = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return prefersReducedMotion;
}

/**
 * Get the initial reduced motion preference (for SSR-safe defaults)
 * Can be used in getServerSideProps or static props
 */
export function getReducedMotionPreference(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(QUERY).matches;
}
