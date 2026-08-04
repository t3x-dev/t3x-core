export type PromptCompileResolutionStatus =
  | 'resolved'
  | 'defaulted'
  | 'empty'
  | 'missing'
  | 'invalid';

export interface PromptCompileIssue {
  code: string;
  path: string;
  message: string;
  source: 'yschema' | 'policy' | 'compile';
  blocking: boolean;
  details?: Record<string, unknown>;
}

export interface PromptCompiledMessage {
  key: string;
  path: string;
  sequence: number;
  role: string;
  content: string;
  variableKeys: string[];
  contextKeys: string[];
  resourceKeys: string[];
}

export interface PromptVariableResolution {
  key: string;
  path: string;
  source: string;
  required: boolean;
  sensitive: boolean;
  status: PromptCompileResolutionStatus;
  value?: unknown;
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

export interface PromptCompiledOutput {
  format: string;
  strict: boolean;
  onParseFailure: string;
  maxRetries: number;
  schemaResource?: string;
  schema?: unknown;
  schemaHash?: string;
}

export interface PromptCompilePreviewResponse {
  compiled: boolean;
  schemaName: 't3x/prompt';
  schemaVersion: 'v1';
  compilerVersion: string;
  compileHash?: string;
  inputSource: {
    kind: 'fixture' | 'workspace' | 'request';
    label: string;
    sourceCount: number;
  };
  adapter: {
    id: 'portable-preview';
    mode: string;
    responseFormat: string;
    streaming: boolean;
    toolPolicy: string;
    maxOutputTokens: number;
  };
  messages: PromptCompiledMessage[];
  variables: PromptVariableResolution[];
  contexts: PromptContextResolution[];
  contextBudget: {
    maxTokens: number;
    resolved: number;
    missing: number;
  };
  resources: PromptResourceResolution[];
  output: PromptCompiledOutput;
  issues: PromptCompileIssue[];
}

export interface PromptCompilePreviewRequest {
  schema_name: string;
  schema_version: string;
  candidate: Record<string, unknown>;
  relations: Array<{ type: string; from: string; to: string }>;
  provenance_by_path: Record<string, unknown[]>;
  variable_values?: Record<string, unknown>;
  context_contents?: Record<string, string>;
  resource_contents?: Record<string, string>;
  input_source: PromptCompilePreviewResponse['inputSource'];
}
