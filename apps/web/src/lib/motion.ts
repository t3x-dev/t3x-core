/**
 * Framer Motion Animation Presets
 * Reusable animation variants and spring configs for consistent motion design
 *
 * Usage:
 *   import { fadeIn, scaleIn, springConfig } from '@/lib/motion'
 *   <motion.div variants={fadeIn} initial="initial" animate="animate" />
 */

import type { Variants, Transition } from 'framer-motion'

// ============================================
// Spring Configurations
// ============================================

export const springConfig = {
  /** Snappy spring for micro-interactions (buttons, toggles) */
  snappy: { type: 'spring', stiffness: 400, damping: 25 } as const,

  /** Gentle spring for larger elements (modals, panels) */
  gentle: { type: 'spring', stiffness: 200, damping: 20 } as const,

  /** Bouncy spring for playful animations (notifications, badges) */
  bouncy: { type: 'spring', stiffness: 300, damping: 15 } as const,

  /** Smooth spring for subtle movements (hover states) */
  smooth: { type: 'spring', stiffness: 150, damping: 20 } as const,
} satisfies Record<string, Transition>

// ============================================
// Duration Presets (for tween animations)
// ============================================

export const duration = {
  instant: 0.1,
  fast: 0.15,
  normal: 0.25,
  slow: 0.4,
} as const

// ============================================
// Easing Curves
// ============================================

export const easing = {
  /** Standard ease for most animations */
  smooth: [0.4, 0, 0.2, 1] as const,
  /** Ease out for entrances */
  out: [0, 0, 0.2, 1] as const,
  /** Ease in for exits */
  in: [0.4, 0, 1, 1] as const,
  /** Overshoot for playful effects */
  spring: [0.34, 1.56, 0.64, 1] as const,
}

// ============================================
// Animation Variants
// ============================================

/** Fade in with opacity */
export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: duration.normal, ease: easing.out }
  },
  exit: {
    opacity: 0,
    transition: { duration: duration.fast, ease: easing.in }
  },
}

/** Scale in from smaller size (good for modals, tooltips) */
export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: springConfig.snappy
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: duration.fast, ease: easing.in }
  },
}

/** Slide up from below (good for toasts, panels) */
export const slideUp: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: springConfig.gentle
  },
  exit: {
    opacity: 0,
    y: 8,
    transition: { duration: duration.fast, ease: easing.in }
  },
}

/** Slide down from above */
export const slideDown: Variants = {
  initial: { opacity: 0, y: -8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: springConfig.gentle
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: duration.fast, ease: easing.in }
  },
}

// ============================================
// Canvas Node Animations
// ============================================

/** Node entry animation (scale + fade) */
export const nodeEnter: Variants = {
  initial: { opacity: 0, scale: 0.9 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: springConfig.bouncy
  },
  exit: {
    opacity: 0,
    scale: 0.9,
    transition: { duration: duration.fast }
  },
}

/** Node hover state */
export const nodeHover = {
  scale: 1.02,
  transition: springConfig.smooth,
}

/** Node selected state */
export const nodeSelected = {
  scale: 1.01,
  transition: springConfig.snappy,
}

/** Error shake animation */
export const shake: Variants = {
  initial: { x: 0 },
  shake: {
    x: [-4, 4, -4, 4, 0],
    transition: { duration: 0.4, ease: 'easeInOut' }
  },
}

// ============================================
// Interactive States
// ============================================

/** Button tap animation */
export const buttonTap = {
  scale: 0.97,
  transition: { duration: 0.1 }
}

/** Button hover animation */
export const buttonHover = {
  scale: 1.02,
  transition: springConfig.smooth,
}

// ============================================
// Stagger Helpers
// ============================================

/** Stagger children animations */
export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    }
  },
  exit: {
    transition: {
      staggerChildren: 0.03,
      staggerDirection: -1,
    }
  },
}

/** Item variant for stagger container */
export const staggerItem: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: springConfig.gentle
  },
  exit: {
    opacity: 0,
    y: 8,
    transition: { duration: duration.fast }
  },
}

// ============================================
// Utility Functions
// ============================================

/** Create a delayed variant */
export function withDelay(variants: Variants, delay: number): Variants {
  const result = { ...variants }
  const animate = result.animate
  if (animate && typeof animate === 'object' && !Array.isArray(animate)) {
    result.animate = {
      ...animate,
      transition: {
        ...((animate as { transition?: object }).transition || {}),
        delay,
      }
    }
  }
  return result
}

/** Create a custom spring config */
export function createSpring(stiffness: number, damping: number): Transition {
  return { type: 'spring', stiffness, damping }
}
