import type { YValue } from '@t3x-dev/yops';
import type { ProvenanceIndex } from '@t3x-dev/yschema';

export type PromptCompileIssueSource = 'yschema' | 'policy' | 'compile';

export interface PromptCompileIssue {
  code: string;
  path: string;
  message: string;
  source: PromptCompileIssueSource;
  blocking: boolean;
  details?: Record<string, unknown>;
}

export interface PromptPolicyResult {
  valid: boolean;
  ready: boolean;
  errors: PromptCompileIssue[];
  gaps: PromptCompileIssue[];
}

export interface PromptPolicyRelation {
  type: string;
  from: string;
  to: string;
}

export interface PromptPlaceholder {
  key: string;
  raw: string;
  start: number;
  end: number;
}

export interface PromptPlaceholderSyntaxIssue {
  offset: number;
  raw: string;
  message: string;
}

export interface PromptPlaceholderParseResult {
  placeholders: PromptPlaceholder[];
  issues: PromptPlaceholderSyntaxIssue[];
}

export interface PromptTemplateRenderResult {
  content: string;
  placeholders: PromptPlaceholder[];
  unresolvedKeys: string[];
  issues: PromptPlaceholderSyntaxIssue[];
}

export type PromptResolutionStatus = 'resolved' | 'defaulted' | 'empty' | 'missing' | 'invalid';

export interface PromptVariableResolution {
  key: string;
  path: string;
  source: string;
  required: boolean;
  sensitive: boolean;
  status: PromptResolutionStatus;
  value?: YValue;
}

export interface PromptContextResolution {
  key: string;
  path: string;
  kind: string;
  loadPolicy: string;
  placement: string;
  required: boolean;
  status: 'resolved' | 'missing';
  targetMessageKeys: string[];
  resourceKey?: string;
  content?: string;
  contentHash?: string;
}

export interface PromptResourceResolution {
  key: string;
  path: string;
  kind: string;
  bundlePath: string;
  referenced: boolean;
  available: boolean;
  contentHash?: string;
}

export interface CompiledPromptMessage {
  key: string;
  path: string;
  sequence: number;
  role: string;
  content: string;
  variableKeys: string[];
  contextKeys: string[];
  resourceKeys: string[];
}

export interface CompiledPromptOutput {
  format: string;
  strict: boolean;
  onParseFailure: string;
  maxRetries: number;
  schemaResource?: string;
  schema?: YValue;
  schemaHash?: string;
}

export interface PromptCompileResult {
  compilerVersion: string;
  compiled: boolean;
  schemaName: 't3x/prompt';
  schemaVersion: 'v1';
  messages: CompiledPromptMessage[];
  variables: PromptVariableResolution[];
  contexts: PromptContextResolution[];
  resources: PromptResourceResolution[];
  output: CompiledPromptOutput;
  issues: PromptCompileIssue[];
  compileHash?: string;
}

export interface CompilePromptInput {
  tree: Record<string, unknown>;
  relations?: readonly PromptPolicyRelation[];
  provenanceByPath?: ProvenanceIndex;
  variableValues?: Record<string, YValue>;
  contextContents?: Record<string, string>;
  resourceContents?: Record<string, string>;
}
