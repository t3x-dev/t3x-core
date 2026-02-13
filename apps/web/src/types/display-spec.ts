/**
 * Canvas Node Display Specification
 *
 * This file defines the strict rules for what information displays on each
 * canvas node type. These rules ensure visual consistency and information
 * hierarchy across the application.
 *
 * Design Principles:
 * 1. Progressive Disclosure - Show summary first, details on expand/click
 * 2. Visual Hierarchy - Most important info is largest/boldest
 * 3. Consistent Patterns - Same data type = same visual treatment
 * 4. Scannability - Users can quickly scan cards without reading
 */

// ============================================
// UNIT NODE (Conversation + Commit)
// ============================================

/**
 * Unit Node Display Specification
 *
 * Layout: Two-section card (Conversation top, Commit bottom)
 * Width: Fixed 288px (w-72)
 * States: staging | committed
 *
 * Visual Hierarchy:
 * 1. Title (largest, bold) - What this is
 * 2. Status badge (colored) - Current state
 * 3. Branch indicator - Context
 * 4. Timestamps/metadata - Least prominent
 */
export interface UnitNodeDisplaySpec {
  // ========== CONVERSATION SECTION (Top) ==========
  conversation: {
    /** Section icon: MessageSquare, always visible */
    icon: 'MessageSquare';

    /** Section label: "Conversation", uppercase, small */
    label: 'Conversation';

    /**
     * Title: Primary display text
     * @source data.title
     * @format Truncate at 50 chars with ellipsis
     * @style text-[0.95rem] font-semibold text-[var(--color-text)]
     */
    title: {
      source: 'data.title';
      maxLength: 50;
      required: true;
    };

    /**
     * Timestamp: When created
     * @source data.timestamp
     * @format Relative time (e.g., "2h ago") or date
     * @style text-[0.7rem] text-[var(--color-text-muted)] bg-slate-100 rounded
     */
    timestamp: {
      source: 'data.timestamp';
      required: true;
    };

    /**
     * Status: Brief status text
     * @source data.status
     * @format Short text (e.g., "Active", "3 turns")
     * @style text-[0.7rem] text-[var(--color-text-muted)]
     */
    status: {
      source: 'data.status';
      required: true;
    };
  };

  // ========== COMMIT SECTION (Bottom) ==========
  commit: {
    /** Section icon: GitCommit (committed) or PenSquare (staging) */
    icon: 'GitCommit' | 'PenSquare';

    /**
     * Commit ID / Entry ID
     * @source data.commitHash (first 8 chars) OR data.entryId
     * @format Uppercase, monospace-style
     * @style Badge with gradient background (committed) or dashed border (staging)
     */
    id: {
      source: 'data.commitHash?.slice(0, 8) || data.entryId';
      required: true;
    };

    /**
     * Branch Type Badge
     * @source data.branchType
     * @values "MAIN" | branchName
     * @style Blue (main) or Amber (branch) badge
     */
    branch: {
      source: 'data.branchType';
      mainLabel: 'MAIN';
      branchLabel: 'data.branchName || "branch"';
      required: true;
    };

    /**
     * Staging indicator (only for staging commits)
     * @source data.commitStatus === 'staging'
     * @style Small uppercase label, muted
     */
    stagingBadge: {
      source: 'data.commitStatus';
      showWhen: 'staging';
    };

    /**
     * Merge indicator (only for merge commits)
     * @source data.isMergeCommit
     * @style Purple badge
     */
    mergeBadge: {
      source: 'data.isMergeCommit';
      showWhen: true;
    };

    /**
     * Commit status text
     * @source "Staging" | "Committed"
     * @style With Sparkles icon, text-xs
     */
    statusText: {
      staging: 'Staging';
      committed: 'Committed';
    };

    /**
     * Secondary info
     * @staging: Constraint count (e.g., "3✓ 2✗")
     * @committed: Summary or timestamp
     * @style text-[0.7rem] text-[var(--color-text-muted)]
     */
    secondaryInfo: {
      staging: {
        source: 'mustHave.length + mustntHave.length';
        format: '${mustHave.length}✓ ${mustntHave.length}✗';
        fallback: 'No constraints';
      };
      committed: {
        source: 'data.summary || data.timestamp';
        maxLength: 20;
      };
    };
  };

  // ========== EXPANDED STATE ==========
  expanded: {
    /**
     * Summary text (only shown when chevron clicked)
     * @source data.summary
     * @format Multi-line text, max 3 lines before scroll
     * @style text-[0.82rem] text-[var(--color-text-secondary)]
     */
    summary: {
      source: 'data.summary';
      fallback: {
        staging: 'Staging - click to edit';
        committed: 'No summary recorded.';
      };
    };
  };

  // ========== TOOLBAR ACTIONS ==========
  toolbar: {
    /** Right side: Continue conversation, Merge (branch only) */
    right: ['MessageSquarePlus', 'GitMerge'];
    /** Top side (committed only): Add leaf output */
    top: ['Plus'];
  };
}

// ============================================
// LEAF NODE (Output Destination)
// ============================================

/**
 * Leaf Node Display Specification
 *
 * Layout: Compact single-section card
 * Width: Fixed 160px (w-40)
 * Types: deploy, eval, twitter, weibo, wechat, article, email, slack
 *
 * Visual Hierarchy:
 * 1. Icon (colored, prominent) - Type indicator
 * 2. Type label (uppercase, colored) - What kind
 * 3. Title (bold) - Name
 * 4. Status (for runner types) - Current state
 */
export interface LeafNodeDisplaySpec {
  /**
   * Icon container
   * @style 32x32, rounded-lg, gradient background
   * @runner: emerald-to-teal gradient
   * @output: indigo-to-violet gradient
   */
  icon: {
    size: 32;
    runnerGradient: 'from-emerald-500 to-teal-600';
    outputGradient: 'from-indigo-500 to-violet-600';
  };

  /**
   * Type label
   * @source LEAF_TYPES[leafType].label
   * @style text-[0.6rem] font-semibold uppercase tracking-wider
   * @color: emerald-600 (runner) or indigo-600 (output)
   */
  typeLabel: {
    source: 'LEAF_TYPES';
    required: true;
  };

  /**
   * Title
   * @source data.title
   * @format Truncate with ellipsis
   * @style text-xs font-medium text-[var(--color-text-secondary)]
   */
  title: {
    source: 'data.title';
    fallback: 'Untitled';
    required: true;
  };

  /**
   * Status indicator (runner types only: deploy, eval)
   * @source data.leafConfig.status
   * @format Badge with icon + text
   */
  status: {
    deploy: {
      idle: { label: 'Ready'; color: 'green' };
      deploying: { label: 'Deploying'; color: 'blue'; icon: 'Loader2'; animate: true };
      running: { label: 'Running'; color: 'blue'; icon: 'Loader2'; animate: true };
      stopped: { label: 'Stopped'; color: 'slate' };
      error: { label: 'Error'; color: 'red'; icon: 'XCircle' };
    };
    eval: {
      pending: { label: 'Pending'; color: 'amber' };
      running: { label: 'Running'; color: 'blue'; icon: 'Loader2'; animate: true };
      passed: { label: '${passedCount} passed'; color: 'green'; icon: 'CheckCircle' };
      failed: { label: '${failedCount} failed'; color: 'red'; icon: 'XCircle' };
      skipped: { label: 'Skipped'; color: 'slate' };
    };
  };
}

// ============================================
// TONE STYLES (Visual States)
// ============================================

/**
 * Node visual states based on position in commit graph
 */
export interface ToneStyleSpec {
  /**
   * main-latest: HEAD of main branch
   * - Most prominent: stronger gradient, larger shadow
   */
  'main-latest': {
    prominence: 'highest';
    color: 'blue';
    zIndex: 4;
  };

  /**
   * main-history: Previous commits on main
   * - Subtle: lighter gradient, smaller shadow
   */
  'main-history': {
    prominence: 'medium';
    color: 'blue-muted';
    zIndex: 2;
  };

  /**
   * branch-latest: HEAD of a branch
   * - Prominent: orange gradient
   */
  'branch-latest': {
    prominence: 'highest';
    color: 'amber';
    zIndex: 4;
  };

  /**
   * branch-history: Previous commits on branch
   * - Subtle: lighter orange
   */
  'branch-history': {
    prominence: 'medium';
    color: 'amber-muted';
    zIndex: 2;
  };

  /**
   * staging: Uncommitted draft
   * - Dashed border, no gradient
   */
  staging: {
    prominence: 'low';
    color: 'slate';
    border: 'dashed';
    zIndex: 3;
  };
}

// ============================================
// SELECTION STATES
// ============================================

/**
 * Visual feedback for selection
 */
export interface SelectionSpec {
  /**
   * Selected node
   * @style box-shadow (NOT ring) for proper rounded corners
   * @color indigo with glow
   */
  selected: {
    shadow: '0 0 0 3px rgba(79,70,229,0.4), 0 0 20px rgba(79,70,229,0.15)';
  };

  /**
   * Highlighted nodes (during merge, etc.)
   * @style Same as selected but with branch color
   */
  highlighted: {
    main: {
      shadow: '0 0 0 3px rgba(59,130,246,0.5), 0 0 20px rgba(59,130,246,0.15)';
    };
    branch: {
      shadow: '0 0 0 3px rgba(245,158,11,0.5), 0 0 20px rgba(245,158,11,0.15)';
    };
  };
}

// ============================================
// TYPOGRAPHY SCALE (for cards)
// ============================================

/**
 * Text sizes used in canvas nodes
 * Based on globals.css --text-* variables
 */
export const CARD_TYPOGRAPHY = {
  /** Title text */
  title: 'text-[0.95rem] font-semibold leading-snug tracking-tight',

  /** Section labels */
  sectionLabel: 'text-[0.65rem] font-semibold uppercase tracking-wider',

  /** Badges and chips */
  badge: 'text-[0.65rem] font-bold uppercase tracking-wide',

  /** Secondary info */
  secondary: 'text-[0.7rem] text-[var(--color-text-muted)]',

  /** Expanded content */
  body: 'text-[0.82rem] text-[var(--color-text-secondary)] leading-relaxed',
} as const;

// ============================================
// COLOR RULES
// ============================================

/**
 * Semantic color assignments
 */
export const NODE_COLORS = {
  /** Main branch = Blue family */
  main: {
    primary: 'blue-600',
    light: 'blue-50',
    border: 'blue-400',
    badge: 'from-blue-600 to-indigo-600',
  },

  /** Branch = Amber/Orange family */
  branch: {
    primary: 'amber-600',
    light: 'amber-50',
    border: 'amber-400',
    badge: 'from-amber-500 to-orange-500',
  },

  /** Staging = Slate/Gray family */
  staging: {
    primary: 'slate-500',
    light: 'slate-50',
    border: 'slate-300',
    badge: 'bg-transparent border-dashed border-slate-400',
  },

  /** Merge = Purple family */
  merge: {
    primary: 'purple-500',
    light: 'purple-50',
  },

  /** Selection = Indigo */
  selection: {
    primary: 'indigo-500',
    glow: 'rgba(79,70,229,0.4)',
  },
} as const;
