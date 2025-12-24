/**
 * T3X Type Definitions
 */

export interface T3XMetadata {
  id?: string;
  created: string;
  modified?: string;
  name?: string;
  description?: string;
  tags?: string[];
  version?: string;
  branch?: string;
  signature?: SignatureMetadata;
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: string;
  api_call?: APICallMetadata;
}

export interface APICallMetadata {
  provider: string;
  model: string;
  request_id?: string;
  parameters?: {
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    [key: string]: any;
  };
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  cost?: {
    input_cost: number;
    output_cost: number;
    total_cost: number;
    currency?: string;
  };
  latency_ms?: number;
  finish_reason?: string;
}

export interface Conversation {
  id?: string;
  title?: string;
  created?: string;
  source?: string;
  messages: Message[];
  tags?: string[];
}

export interface Note {
  id?: string;
  title?: string;
  content: string;
  type?: 'text/plain' | 'text/markdown' | 'text/html';
  created?: string;
  modified?: string;
  tags?: string[];
}

export interface Preferences {
  languages?: string[];
  frameworks?: string[];
  style?: string;
  tone?: string;
  [key: string]: any;
}

export interface FileReference {
  id?: string;
  path: string;
  name?: string;
  type: string;
  content?: string;
  description?: string;
  tags?: string[];
}

export interface Prompt {
  id?: string;
  version?: number;
  name?: string;
  description?: string;
  content: string;
  target?: string;
  task?: string;
  created?: string;
  based_on?: string[];
  performance?: {
    used_count?: number;
    avg_rating?: number;
    feedback?: string[];
  };
  parent_version?: number;
  changes?: string;
}

export type SignatureStatus = 'verified' | 'pending' | 'missing' | 'invalid' | 'skipped';

export interface SignatureMetadata {
  status?: SignatureStatus;
  algorithm?: string;
  verified_at?: string;
  signer?: string;
  commit?: string;
  notes?: string;
  [key: string]: any;
}

export interface UsageSummaryDiff {
  from_commit?: string;
  to_commit?: string;
  generated_at?: string;
  summary?: string;
  aspect_changes?: number;
  stats?: Record<string, any>;
  [key: string]: any;
}

export interface UsageSummaryOperation {
  name: string;
  count?: number;
  last_used?: string;
  [key: string]: any;
}

export type ExtractorType = 'clustering' | 'spacy' | 'stanza' | 'spark_nlp' | 'custom';
export type ValidatorType = 'minilm' | 'bert' | 'custom';
export type IntentMode = 'knowledge' | 'decision' | 'analysis' | 'creative' | 'plan' | 'custom';
export type SemanticStatus = 'active' | 'disabled' | 'experimental';

export interface SemanticExtractorConfig {
  type: ExtractorType;
  model?: string;
  version?: string;
  language?: string;
  settings?: Record<string, any>;
  [key: string]: any;
}

export interface SemanticValidatorConfig {
  type?: ValidatorType;
  model?: string;
  threshold?: number;
  version?: string;
  settings?: Record<string, any>;
  [key: string]: any;
}

export interface SemanticPipelineConfig {
  extractor?: SemanticExtractorConfig;
  validator?: SemanticValidatorConfig;
  intent_mode?: IntentMode;
  status?: SemanticStatus;
  last_updated?: string;
  notes?: string;
  [key: string]: any;
}

export interface DerivedFromEntry {
  file_id?: string;
  context_type?: string;
  fields_used?: string[];
  [key: string]: any;
}

export interface TransformationMetadata {
  type?: string;
  tool?: string;
  timestamp?: string;
  provider?: string;
  config?: Record<string, any>;
  [key: string]: any;
}

export type MergeStrategy = 'fast-forward' | 'squash' | 'three-way' | 'manual' | 'rebase';
export type MergeStatus = 'pending' | 'completed' | 'failed';

export interface LineageBranch {
  head?: string;
  parent?: string;
  created_at?: string;
  updated_at?: string;
  description?: string;
  [key: string]: any;
}

export interface LineageMerge {
  source: string;
  target: string;
  strategy: MergeStrategy;
  commit?: string;
  timestamp?: string;
  status?: MergeStatus;
  conflicts?: string[];
  notes?: string;
  [key: string]: any;
}

export interface LineageMetadata {
  derived_from?: DerivedFromEntry[];
  transformation?: TransformationMetadata;
  current_branch?: string;
  branches?: Record<string, LineageBranch>;
  merges?: LineageMerge[];
  [key: string]: any;
}

export interface UsageSummary {
  total_conversations?: number;
  total_messages?: number;
  total_cost?: number;
  currency?: string;
  by_provider?: Record<string, {
    conversations?: number;
    total_tokens?: number;
    total_cost?: number;
  }>;
  by_model?: Record<string, {
    calls?: number;
    avg_latency_ms?: number;
    total_cost?: number;
  }>;
  last_diff?: UsageSummaryDiff;
  operations?: UsageSummaryOperation[];
}

export interface T3XFile {
  t3x_version: string;
  $schema?: string;
  metadata: T3XMetadata;
  conversations?: Conversation[];
  notes?: Note[];
  preferences?: Preferences;
  files?: FileReference[];
  prompts?: Prompt[];
  usage_summary?: UsageSummary;
  _tooling?: {
    context_type?: 'source' | 'derived' | 'materialized' | 'snapshot';
    lineage?: LineageMetadata;
    snapshot?: any;
    semantic?: SemanticPipelineConfig;
    [key: string]: any;
  };
}
