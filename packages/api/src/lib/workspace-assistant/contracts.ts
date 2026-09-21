import type { DraftActionLedger, DraftDocument } from '@t3x-dev/application';
import type { LLMPrompt } from '@t3x-dev/core';
import type { InferenceScope } from '../inference';
import type { ProposalGenerationSourceInput } from '../proposal-generation';
import type { WorkspaceAuthoringBasis } from '../workspace-authoring';

/** Attention is not a write constraint or a filter on canonical replay. */
export interface AssistantAttention {
  selectedActionId?: string;
  selectedNodeId?: string;
}
export interface AssistantContextInput extends AssistantAttention {
  projectId: string;
  workspaceId: string;
  conversationId?: string;
  userTurnHash?: string;
  sourceMaterialIds?: string[];
  expectedWorkspaceRevision?: number;
  maxContextChars?: number;
}
export interface AssistantTurn {
  hash: string;
  role: 'user' | 'assistant';
  content: string;
}
/** Server-only preparation. Never serialize this object as a prompt. */
export interface PreparedAssistantContext {
  input: AssistantContextInput;
  workspaceRevision: number;
  compositionRevision: number;
  basis: WorkspaceAuthoringBasis;
  ledger: DraftActionLedger;
  current: DraftDocument;
  manifestDigest: string;
  sources: ProposalGenerationSourceInput[];
  schema?: {
    canonicalName: string;
    version: string | null;
    resource: { uri: string; digest: string; mediaType: string };
    value: unknown;
  };
  candidates?: {
    pendingCandidates: Array<{
      transitionId: string;
      status: 'candidate' | 'stale';
      workspaceRevision: number;
    }>;
    candidateWindowTruncated: boolean;
  };
  turns: AssistantTurn[];
  olderTurnsAvailable: boolean;
  prompt: LLMPrompt;
  disclosure: { partial: boolean; omitted: string[]; characters: number };
}
export interface AssistantInference {
  runtime: import('../inference').InferenceRuntime;
  runId: string;
  scope: InferenceScope;
}
