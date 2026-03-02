/**
 * Proposal Router
 *
 * Routes an ExtractionProposal to 'ready' or 'review' zone based on:
 * 1. Proposal type (modify → review)
 * 2. Inference type (implicit → review)
 * 3. Evidence presence (no evidence → review)
 * 4. Confidence thresholds (per inference_type, configurable)
 * 5. Project config (auto_landing_enabled toggle)
 */

import type { ExtractionProposal, ProjectExtractionConfig } from '../types/v4';

const DEFAULT_THRESHOLDS = {
  direct: 0.85,
  paraphrase: 0.8,
  cross_turn: 0.75,
  implicit: Infinity, // always review
} as const;

export interface RouteResult {
  zone: 'ready' | 'review';
  reason: string;
}

export function routeProposal(
  proposal: ExtractionProposal,
  config?: ProjectExtractionConfig
): RouteResult {
  // Rule 0: Auto-landing disabled → all to review
  if (config && config.auto_landing_enabled === false) {
    return { zone: 'review', reason: 'auto_landing_disabled' };
  }

  // Rule 1: modify/reinforce proposals → review
  if (proposal.type === 'modify' || proposal.type === 'reinforce') {
    return { zone: 'review', reason: `${proposal.type}_proposal_requires_review` };
  }

  // Rule 2: implicit inference → review
  if (proposal.inference_type === 'implicit') {
    return { zone: 'review', reason: 'implicit_inference_requires_review' };
  }

  // Rule 3: No evidence → review
  if (!proposal.evidence || proposal.evidence.length === 0) {
    return { zone: 'review', reason: 'no_evidence_anchors' };
  }

  // Rule 4: Confidence threshold check
  const thresholds = {
    ...DEFAULT_THRESHOLDS,
    ...config?.confidence_thresholds,
  };

  const threshold = thresholds[proposal.inference_type] ?? DEFAULT_THRESHOLDS.direct;
  if (proposal.confidence < threshold) {
    return {
      zone: 'review',
      reason: `confidence_${proposal.confidence.toFixed(2)}_below_threshold_${threshold}`,
    };
  }

  return { zone: 'ready', reason: 'auto_landed' };
}
