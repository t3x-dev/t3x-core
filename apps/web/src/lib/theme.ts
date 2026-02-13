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
// SPACING — Semantic layout rhythm helpers
// =============================================================================

export const spacing = {
  /** Page-level padding — 24px */
  page: 'p-[var(--space-page)]',
  pagePx: 'px-[var(--space-page)]',
  pagePy: 'py-[var(--space-page)]',
  /** Between major sections — 24px */
  section: 'gap-[var(--space-section)]',
  sectionMb: 'mb-[var(--space-section)]',
  sectionMt: 'mt-[var(--space-section)]',
  /** Between related items — 16px */
  group: 'gap-[var(--space-group)]',
  groupMb: 'mb-[var(--space-group)]',
  /** Between tightly coupled elements — 8px */
  item: 'gap-[var(--space-item)]',
  itemMb: 'mb-[var(--space-item)]',
} as const;

// =============================================================================
// ELEVATION — Interactive shadow states
// =============================================================================

export const elevation = {
  /** Flat — no shadow */
  flat: 'elevation-0',
  /** Resting card — subtle shadow */
  card: 'elevation-1',
  /** Raised — hovered/active card */
  raised: 'elevation-2',
  /** Floating — popovers, dropdowns */
  floating: 'elevation-3',
  /** Hover lift pattern — card goes from 1 → 2 on hover */
  cardHover: 'elevation-1 elevation-hover',
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
