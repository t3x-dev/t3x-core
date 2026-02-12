/**
 * T3X Design System - Theme Tokens
 *
 * Token Authority: This file is Priority 2 (Mapping Layer).
 * It MUST only reference CSS variables, Tailwind tokens, or the `brand` palette below.
 * Final truth for runtime values lives in globals.css (Priority 1).
 * See: frontend-art-template.md §1.0
 *
 * Brand Philosophy:
 * - Orange (Pending/Draft) → Blue (Committed) represents the flow from WIP to stable
 * - Matches the T3X bowtie logo gradient
 * - Clean, professional, Linear/Vercel-inspired aesthetics
 */

// =============================================================================
// BRAND COLORS
// =============================================================================

export const brand = {
  // Primary Blue - Represents committed/stable state
  blue: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb', // Logo blue
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
    950: '#172554',
  },

  // Accent Orange - Represents pending/draft state
  orange: {
    50: '#fff7ed',
    100: '#ffedd5',
    200: '#fed7aa',
    300: '#fdba74',
    400: '#fb923c', // Logo orange
    500: '#f97316',
    600: '#ea580c',
    700: '#c2410c',
    800: '#9a3412',
    900: '#7c2d12',
    950: '#431407',
  },

  // Neutral - For text, backgrounds, borders
  slate: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617', // Logo background
  },

  // Extended palettes — Tailwind colors used by semantic states
  // These exist so semantic/badge/shadow values reference brand.* instead of raw hex

  amber: {
    50: '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    400: '#fbbf24',
    500: '#f59e0b',
    800: '#92400e',
    900: '#78350f',
  },

  indigo: {
    50: '#eef2ff',
    200: '#c7d2fe',
    400: '#818cf8',
    500: '#6366f1',
    700: '#4338ca',
  },

  emerald: {
    50: '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0',
    400: '#34d399',
    500: '#10b981',
    800: '#065f46',
  },

  red: {
    50: '#fef2f2',
    200: '#fecaca',
    500: '#ef4444',
    800: '#991b1b',
  },
} as const;

// =============================================================================
// SEMANTIC COLORS - Canvas State Mapping
// =============================================================================

export const semantic = {
  // Commit states (Blue spectrum)
  commit: {
    bg: brand.blue[50],
    bgHover: brand.blue[100],
    border: brand.blue[200],
    borderHover: brand.blue[400],
    text: brand.blue[700],
    accent: brand.blue[600],
    badge: {
      bg: `linear-gradient(135deg, ${brand.blue[500]} 0%, ${brand.blue[600]} 100%)`,
      text: '#ffffff',
    },
  },

  // Pending/Draft states (Orange spectrum)
  pending: {
    bg: brand.orange[50],
    bgHover: brand.orange[100],
    border: brand.orange[200],
    borderHover: brand.orange[400],
    text: brand.orange[700],
    accent: brand.orange[500],
    badge: {
      bg: `linear-gradient(135deg, ${brand.orange[400]} 0%, ${brand.orange[500]} 100%)`,
      text: '#ffffff',
    },
  },

  // Branch states (Amber spectrum)
  branch: {
    bg: brand.amber[50],
    bgHover: brand.amber[100],
    border: brand.amber[200],
    borderHover: brand.amber[400],
    text: brand.amber[800],
    accent: brand.amber[500],
    badge: {
      bg: `linear-gradient(135deg, ${brand.amber[400]} 0%, ${brand.amber[500]} 100%)`,
      text: brand.amber[900],
    },
  },

  // Conversation states (Indigo spectrum)
  conversation: {
    bg: brand.blue[50],
    bgHover: brand.indigo[50],
    border: brand.indigo[200],
    borderHover: brand.indigo[400],
    text: brand.indigo[700],
    accent: brand.indigo[500],
    badge: {
      bg: `linear-gradient(135deg, ${brand.indigo[400]} 0%, ${brand.indigo[500]} 100%)`,
      text: '#ffffff',
    },
  },

  // Leaf states (Emerald spectrum)
  leaf: {
    bg: brand.emerald[50],
    bgHover: brand.emerald[100],
    border: brand.emerald[200],
    borderHover: brand.emerald[400],
    text: brand.emerald[800],
    accent: brand.emerald[500],
    badge: {
      bg: `linear-gradient(135deg, ${brand.emerald[400]} 0%, ${brand.emerald[500]} 100%)`,
      text: '#ffffff',
    },
  },

  // Success states (Emerald palette)
  success: {
    bg: brand.emerald[50],
    border: brand.emerald[200],
    text: brand.emerald[800],
    accent: brand.emerald[500],
  },

  // Error states (Red palette)
  error: {
    bg: brand.red[50],
    border: brand.red[200],
    text: brand.red[800],
    accent: brand.red[500],
  },

  // Warning states (Amber palette)
  warning: {
    bg: brand.amber[50],
    border: brand.amber[200],
    text: brand.amber[800],
    accent: brand.amber[500],
  },
} as const;

// =============================================================================
// TYPOGRAPHY SCALE
// =============================================================================

export const typography = {
  // Font sizes with line heights
  size: {
    xs: { fontSize: '0.75rem', lineHeight: '1rem' }, // 12px
    sm: { fontSize: '0.8125rem', lineHeight: '1.25rem' }, // 13px
    base: { fontSize: '0.875rem', lineHeight: '1.375rem' }, // 14px
    md: { fontSize: '0.9375rem', lineHeight: '1.5rem' }, // 15px
    lg: { fontSize: '1rem', lineHeight: '1.5rem' }, // 16px
    xl: { fontSize: '1.125rem', lineHeight: '1.75rem' }, // 18px
    '2xl': { fontSize: '1.25rem', lineHeight: '1.875rem' }, // 20px
    '3xl': { fontSize: '1.5rem', lineHeight: '2rem' }, // 24px
  },

  // Font weights
  weight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  // Letter spacing
  tracking: {
    tighter: '-0.02em',
    tight: '-0.01em',
    normal: '0',
    wide: '0.01em',
    wider: '0.02em',
  },
} as const;

// =============================================================================
// SPACING SCALE (4px base)
// =============================================================================

export const spacing = {
  px: '1px',
  0: '0',
  0.5: '2px',
  1: '4px',
  1.5: '6px',
  2: '8px',
  2.5: '10px',
  3: '12px',
  3.5: '14px',
  4: '16px',
  5: '20px',
  6: '24px',
  7: '28px',
  8: '32px',
  9: '36px',
  10: '40px',
  12: '48px',
  14: '56px',
  16: '64px',
} as const;

// =============================================================================
// SHADOWS & ELEVATION
// =============================================================================

export const shadows = {
  none: 'none',
  xs: '0 1px 2px rgba(0, 0, 0, 0.04)',
  sm: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
  lg: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
  xl: '0 20px 40px -10px rgba(0, 0, 0, 0.1), 0 10px 20px -10px rgba(0, 0, 0, 0.04)',

  // Colored glows for interactive states
  glow: {
    blue: '0 0 0 1px rgba(59, 130, 246, 0.1), 0 4px 16px rgba(59, 130, 246, 0.12)',
    orange: '0 0 0 1px rgba(249, 115, 22, 0.1), 0 4px 16px rgba(249, 115, 22, 0.12)',
    indigo: '0 0 0 1px rgba(99, 102, 241, 0.1), 0 4px 16px rgba(99, 102, 241, 0.12)',
  },

  // Focus rings
  ring: {
    default: '0 0 0 2px var(--color-primary), 0 0 0 4px rgba(59, 130, 246, 0.2)',
    orange: `0 0 0 2px ${brand.orange[500]}, 0 0 0 4px rgba(249, 115, 22, 0.2)`,
    error: `0 0 0 2px ${brand.red[500]}, 0 0 0 4px rgba(239, 68, 68, 0.2)`,
  },
} as const;

// =============================================================================
// ANIMATION TOKENS
// =============================================================================

export const animation = {
  // Durations
  duration: {
    instant: 100,
    fast: 150,
    normal: 250,
    slow: 400,
  },

  // Easing curves
  easing: {
    smooth: [0.4, 0, 0.2, 1],
    out: [0, 0, 0.2, 1],
    in: [0.4, 0, 1, 1],
    spring: [0.34, 1.56, 0.64, 1],
  },

  // Spring configs for Framer Motion
  spring: {
    snappy: { stiffness: 400, damping: 25 },
    gentle: { stiffness: 200, damping: 20 },
    bouncy: { stiffness: 300, damping: 15 },
    smooth: { stiffness: 150, damping: 20 },
  },
} as const;

// =============================================================================
// CANVAS-SPECIFIC TOKENS
// =============================================================================

export const canvas = {
  grid: 16,
  node: {
    minWidth: 224, // 14 * 16
    conversation: { height: 128 }, // 8 * 16
    draft: { height: 160 }, // 10 * 16
    commit: { height: 160 }, // 10 * 16
    leaf: { height: 64, width: 149 }, // 4 * 16, 2/3 of minWidth
  },
  edge: {
    color: {
      light: brand.slate[400], // = --edge-color in globals.css
      dark: brand.slate[600], // = --edge-color .dark in globals.css
    },
    activeColor: {
      light: brand.blue[500], // = --edge-active-color in globals.css
      dark: brand.indigo[400], // = --edge-active-color .dark in globals.css
    },
  },
} as const;

// =============================================================================
// GLASS COMPOSABLE CLASSES (Dark Mode)
// =============================================================================

/**
 * Glass-morphism class helpers for dark mode.
 * Consume CSS variables from the four-layer surface system.
 */
export const glass = {
  /** Panel layer — semi-transparent + blur + border */
  panelBase:
    'bg-[var(--surface-panel)] backdrop-blur-[var(--fx-blur-panel)] border border-[var(--stroke-default)]',
  /** Card layer — semi-transparent + blur + border */
  cardBase:
    'bg-[var(--surface-card)] backdrop-blur-[var(--fx-blur-card)] border border-[var(--stroke-default)]',
  /** Node-specific card — no blur (performance), alpha + shadow only */
  cardNode: 'bg-[var(--surface-card)] border border-[var(--stroke-default)]',
  /** Elevated layer — popovers, dropdowns */
  elevatedBase: 'bg-[var(--surface-elevated)] border border-[var(--stroke-strong)]',
  /** Inset highlight — top bright / bottom dark edge */
  highlight: 'shadow-[var(--fx-highlight-inset)]',
  /** Hover effect — shadow lift + background brighten */
  hover: 'hover:shadow-[var(--fx-shadow-hover)] hover:bg-[var(--hover-bg)]',
  /** Focus ring */
  focus: 'focus-visible:ring-1 focus-visible:ring-[var(--ring)]/50',
  /** Reading surface — reduced blur, higher opacity, for text-dense areas (Diff, Output) */
  reading:
    'bg-[var(--glass-bg-reading)] backdrop-blur-[var(--glass-blur-reading)] border border-[var(--stroke-strong)] shadow-[var(--shadow-reading)]',
  /** Reading surface soft — slightly more transparent, for secondary text areas */
  readingSoft:
    'bg-[var(--glass-bg-reading-soft)] backdrop-blur-[var(--glass-blur-reading)] border border-[var(--stroke-default)] shadow-[var(--shadow-reading)]',
} as const;

// =============================================================================
// TONE ACCENT CLASSES (Dark Mode — text / border / ring only, never bg)
// =============================================================================

export const toneAccent = {
  commit: {
    text: 'text-[var(--accent-commit)]',
    border: 'border-[var(--accent-commit)]/40',
    ring: 'ring-[var(--accent-commit)]/30',
  },
  pending: {
    text: 'text-[var(--accent-pending)]',
    border: 'border-[var(--accent-pending)]/40',
    ring: 'ring-[var(--accent-pending)]/30',
  },
  branch: {
    text: 'text-[var(--accent-branch)]',
    border: 'border-[var(--accent-branch)]/40',
    ring: 'ring-[var(--accent-branch)]/30',
  },
  leaf: {
    text: 'text-[var(--accent-leaf)]',
    border: 'border-[var(--accent-leaf)]/40',
    ring: 'ring-[var(--accent-leaf)]/30',
  },
  conversation: {
    text: 'text-[var(--accent-conversation)]',
    border: 'border-[var(--accent-conversation)]/40',
    ring: 'ring-[var(--accent-conversation)]/30',
  },
} as const;

// =============================================================================
// TONE GLOW (Dark Mode — shadow only, never bg)
// =============================================================================

export const toneGlow = {
  commit: '0 0 12px oklch(0.65 0.15 260 / 10%)',
  pending: '0 0 12px oklch(0.70 0.14 55 / 10%)',
  branch: '0 0 12px oklch(0.70 0.12 80 / 10%)',
  leaf: '0 0 12px oklch(0.65 0.14 155 / 10%)',
} as const;

// =============================================================================
// TAILWIND CLASS HELPERS
// =============================================================================

/**
 * Generate Tailwind classes for semantic node styling
 */
export function getNodeClasses(
  type: 'commit' | 'pending' | 'branch' | 'conversation' | 'leaf',
  state: 'default' | 'hover' | 'selected' = 'default'
) {
  const baseClasses = 'rounded-2xl border-2 transition-all duration-200';

  const typeClasses = {
    commit: {
      default: 'bg-blue-50 border-blue-200 text-blue-700',
      hover: 'bg-blue-100 border-blue-400 shadow-md',
      selected: 'border-blue-500 ring-2 ring-blue-500/20 ring-offset-2',
    },
    pending: {
      default: 'bg-orange-50 border-orange-200 text-orange-700',
      hover: 'bg-orange-100 border-orange-400 shadow-md',
      selected: 'border-orange-500 ring-2 ring-orange-500/20 ring-offset-2',
    },
    branch: {
      default: 'bg-amber-50 border-amber-200 text-amber-700',
      hover: 'bg-amber-100 border-amber-400 shadow-md',
      selected: 'border-amber-500 ring-2 ring-amber-500/20 ring-offset-2',
    },
    conversation: {
      default: 'bg-indigo-50 border-indigo-200 text-indigo-700',
      hover: 'bg-indigo-100 border-indigo-400 shadow-md',
      selected: 'border-indigo-500 ring-2 ring-indigo-500/20 ring-offset-2',
    },
    leaf: {
      default: 'bg-emerald-50 border-emerald-200 text-emerald-700',
      hover: 'bg-emerald-100 border-emerald-400 shadow-md',
      selected: 'border-emerald-500 ring-2 ring-emerald-500/20 ring-offset-2',
    },
  };

  return `${baseClasses} ${typeClasses[type][state]}`;
}

/**
 * Generate Tailwind classes for badge variants
 */
export function getBadgeClasses(variant: 'commit' | 'pending' | 'branch' | 'main' | 'leaf') {
  const variants = {
    commit: 'bg-gradient-to-r from-blue-500 to-blue-600 text-white',
    pending: 'bg-gradient-to-r from-orange-400 to-orange-500 text-white',
    branch: 'bg-gradient-to-r from-amber-400 to-amber-500 text-amber-900',
    main: 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white',
    leaf: 'bg-gradient-to-r from-emerald-400 to-emerald-500 text-white',
  };

  return `inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${variants[variant]}`;
}

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type BrandColor = keyof typeof brand;
export type SemanticColor = keyof typeof semantic;
export type NodeType = 'commit' | 'pending' | 'branch' | 'conversation' | 'leaf';
export type BadgeVariant = 'commit' | 'pending' | 'branch' | 'main' | 'leaf';
