/**
 * Shared merge types — extracted from the removed FrameConflictCard.
 */

export interface FrameResolution {
  type: 'source' | 'target' | 'both' | 'per-slot';
  /** Per-slot overrides when type === 'per-slot' */
  slotOverrides?: Record<string, 'source' | 'target'>;
}
