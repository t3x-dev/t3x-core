/**
 * Draft Workflow Types
 *
 * Types for the 6-step draft generation workflow.
 */

/**
 * Draft configuration
 */
export interface DraftConfig {
  /** Project ID */
  projectId: string;
  /** Base commit hash (optional) */
  baseCommitHash?: string;
  /** Turn anchor hash (optional) */
  turnAnchorHash?: string;
  /** Bridge ID (default: "plan") */
  bridgeId: string;
  /** Similarity threshold override (optional) */
  similarityThreshold?: number;
}

/**
 * Turn data in the conversation window
 */
export interface Turn {
  /** Turn hash */
  turnHash: string;
  /** Role (user/assistant) */
  role: string;
  /** Content text */
  content: string;
}

/**
 * Evidence sentence (after embedding filtering)
 */
export interface EvidenceSentence {
  /** Segment ID */
  segmentId: string;
  /** Sentence text */
  text: string;
  /** Turn hash this sentence came from */
  turnHash: string;
  /** Similarity score to query */
  similarityScore: number;
  /** Ring 1 keywords (normalized) */
  keywords: string[];
  /** Polarity keywords map {keyword: polarity} */
  polarityKeywords: Record<string, number>;
}

/**
 * Draft result
 */
export interface DraftResult {
  /** Draft ID */
  draftId: string;
  /** Project ID */
  projectId: string;
  /** Base commit hash (if any) */
  baseCommitHash?: string;
  /** Turn anchor hash (if any) */
  turnAnchorHash?: string;
  /** Bridge ID used */
  bridgeId: string;
  /** Bridge configuration snapshot */
  bridgePayload: Record<string, unknown>;
  /** Must-Have keyword list */
  mustHave: string[];
  /** Mustn't-Have keyword list */
  mustntHave: string[];
  /** Generated draft text */
  text: string;
  /** Draft status */
  status: "ephemeral" | "adopted" | "superseded";
  /** Creation timestamp (ISO 8601) */
  createdAt: string;
  /** Schema version */
  schemaVersion: string;
  /** Evidence sentences used (for debugging) */
  evidenceSentences: EvidenceSentence[];
  /** Number of validation iterations */
  validationIterations: number;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  passed: boolean;
  /** Missing must-have keywords */
  missingMustHave: string[];
  /** Violated mustn't-have keywords */
  violatedMustntHave: string[];
}
