import { describe, expect, it } from 'vitest';
import { type ExtractReadinessInput, getExtractDisabledReason } from '@/domain/extractionReadiness';

const READY: ExtractReadinessInput = {
  activeProjectId: 'proj_1',
  workspaceConversationId: 'conv_1',
  routeConversationId: 'conv_1',
  turnCount: 1,
  workspaceMode: 'idle',
  isCommitted: false,
  hasDraft: false,
  isChatLoading: false,
  isChatStreaming: false,
  modelsLoading: false,
  selectedProvider: 'openai',
  selectedModel: 'gpt-5.4',
  lastError: null,
};

describe('getExtractDisabledReason', () => {
  it('allows extraction when conversation context, model, and saved turns are ready', () => {
    expect(getExtractDisabledReason(READY)).toBeNull();
  });

  it('blocks extraction while the assistant is streaming', () => {
    expect(getExtractDisabledReason({ ...READY, isChatStreaming: true })).toBe(
      'Wait for the assistant response to finish.'
    );
  });

  it('blocks extraction while a draft is staged', () => {
    expect(getExtractDisabledReason({ ...READY, hasDraft: true })).toBe(
      'Apply or discard the staged draft before extracting again.'
    );
  });

  it('blocks extraction when there are no saved turns', () => {
    expect(getExtractDisabledReason({ ...READY, turnCount: 0 })).toBe(
      'No saved conversation turns to extract.'
    );
  });

  it('blocks extraction when model selection is incomplete', () => {
    expect(getExtractDisabledReason({ ...READY, selectedModel: null })).toBe(
      'Select a model before extracting.'
    );
  });
});
