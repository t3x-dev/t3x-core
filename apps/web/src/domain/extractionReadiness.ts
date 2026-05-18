export interface ExtractReadinessInput {
  activeProjectId: string | null | undefined;
  workspaceConversationId: string | null | undefined;
  routeConversationId: string | null | undefined;
  turnCount: number;
  workspaceMode: string;
  isCommitted: boolean;
  hasDraft: boolean;
  isChatLoading: boolean;
  isChatStreaming: boolean;
  modelsLoading: boolean;
  selectedProvider: string | null | undefined;
  selectedModel: string | null | undefined;
  lastError: string | null | undefined;
}

export function getExtractDisabledReason(input: ExtractReadinessInput): string | null {
  if (input.isCommitted) return 'This conversation is already committed.';
  if (input.hasDraft) return 'Apply or discard the staged draft before extracting again.';
  if (input.workspaceMode === 'streaming') return 'Extraction is already running.';
  if (input.workspaceMode === 'committing') return 'Commit is in progress.';
  if (input.isChatStreaming) return 'Wait for the assistant response to finish.';
  if (input.isChatLoading) return 'Loading conversation messages.';
  if (input.modelsLoading) return 'Loading model options.';
  if (!input.selectedProvider || !input.selectedModel) return 'Select a model before extracting.';
  if (
    !input.activeProjectId ||
    !input.workspaceConversationId ||
    input.routeConversationId === 'new'
  ) {
    return 'Loading conversation context.';
  }
  if (input.lastError) return 'Resolve the workspace error before extracting.';
  if (input.turnCount === 0) return 'No saved conversation turns to extract.';
  return null;
}
