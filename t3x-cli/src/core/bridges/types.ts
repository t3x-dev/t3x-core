/**
 * Bridge Template Types
 *
 * Bridge templates define prompt configurations for draft generation.
 */

/**
 * Bridge template configuration
 */
export interface BridgeTemplate {
  /** Bridge ID (e.g., "plan", "explain") */
  bridge: string;
  /** Prompt template text */
  prompt: string;
  /** Human-readable label */
  label?: string;
  /** Version number */
  version?: number;
  /** Locale (e.g., "en", "zh") */
  locale?: string;
  /** Similarity threshold (default: 0.60) */
  threshold: number;
  /** Description */
  description?: string;
}

/**
 * Default similarity threshold
 */
export const DEFAULT_THRESHOLD = 0.60;
