/**
 * Common utility types for T3X
 */

/**
 * Hash types
 */
export type TurnHash = string;
export type CommitHash = string;
export type ContentHash = string;

/**
 * ID types
 */
export type ProjectId = string;
export type ConversationId = string;
export type BranchId = string;
export type DraftId = string;
export type MergeId = string;

/**
 * Semantic extraction types
 */
export interface SemanticSegment {
  id: string;
  content: string;
  embedding?: number[];
  metadata?: Record<string, unknown>;
}

export interface SemanticFacet {
  id: string;
  name: string;
  value: unknown;
  confidence: number;
  sourceSegments: string[];
}

/**
 * Extractor configuration
 */
export interface ExtractorConfig {
  ring1?: {
    keywords?: boolean;
    entities?: boolean;
    temporal?: boolean;
    preferences?: boolean;
  };
  ring2?: {
    intents?: boolean;
    relations?: boolean;
    facets?: boolean;
  };
  ring3?: {
    segments?: boolean;
    embeddings?: boolean;
  };
}

/**
 * Pipeline configuration
 */
export interface PipelineConfig {
  extractors: ExtractorConfig;
  embeddingProvider?: string;
  llmProvider?: string;
  thresholds?: {
    similarity?: number;
    confidence?: number;
  };
}

/**
 * LLM provider types
 */
export type LLMProvider = 'anthropic' | 'openai' | 'google';

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  apiKey?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Embedding provider types
 */
export type EmbeddingProvider = 'google' | 'openai' | 'local';

export interface EmbeddingConfig {
  provider: EmbeddingProvider;
  model: string;
  dimensions?: number;
}

/**
 * Bridge types (for semantic transforms)
 */
export type BridgeType = 'summary' | 'clarify' | 'explain' | 'plan';

export interface BridgeConfig {
  type: BridgeType;
  prompt?: string;
  maxTokens?: number;
}

/**
 * Event types for real-time updates
 */
export type T3XEventType =
  | 'turn:created'
  | 'commit:created'
  | 'branch:created'
  | 'draft:created'
  | 'draft:updated'
  | 'merge:started'
  | 'merge:completed'
  | 'merge:conflict';

export interface T3XEvent<T = unknown> {
  type: T3XEventType;
  timestamp: string;
  projectId: string;
  data: T;
}
