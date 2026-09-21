import type { DraftActionActor, DraftYOp } from '@t3x-dev/application';
import type { LLMProvider } from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import { type AssistantEvent, runAssistantProvider } from './adapters/provider-tools';
import { createAssistantCapabilities } from './capabilities';
import { assertAssistantContextCurrent, prepareAssistantContext } from './context';
import type { AssistantContextInput, AssistantInference } from './contracts';

export async function chatWithWorkspace(input: {
  db: AnyDB;
  context: AssistantContextInput;
  actor: DraftActionActor;
  provider: LLMProvider;
  model: string;
  inference: AssistantInference;
  operationNamespace: string;
  authorize: (capability: 'read' | 'propose') => Promise<void>;
  exactEdit?: { operations: DraftYOp[]; reason?: string };
  proposal?: {
    posture: 'source_only' | 'guided' | 'recommend';
    requestedProvider?: string;
    requestedModel?: string;
  };
  signal?: AbortSignal;
  emit: (
    event:
      | AssistantEvent
      | {
          type: 'context';
          workspaceRevision: number;
          compositionRevision: number;
          disclosure: unknown;
        }
  ) => Promise<void>;
}) {
  const prepared = await prepareAssistantContext(input.db, input.context, () =>
    input.authorize('read')
  );
  await input.emit({
    type: 'context',
    workspaceRevision: prepared.workspaceRevision,
    compositionRevision: prepared.compositionRevision,
    disclosure: prepared.disclosure,
  });
  const capabilities = createAssistantCapabilities({ ...input, prepared });
  const latestUserTurn = prepared.turns.at(-1);
  await runAssistantProvider({
    ...input,
    prompt: prepared.prompt,
    capabilities,
    initialToolCall:
      input.proposal && !input.exactEdit && latestUserTurn?.role === 'user'
        ? { name: 'requestProposal', input: { instruction: latestUserTurn.content } }
        : undefined,
    assertCurrent: () =>
      assertAssistantContextCurrent(input.db, prepared, () => input.authorize('read')),
  });
}
