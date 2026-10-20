import type { DraftActionActor, DraftYOp } from '@t3x-dev/application';
import type { AnyDB } from '@t3x-dev/storage';
import type { ProposalGenerationModel } from '../proposal-generation';
import {
  type AssistantEvent,
  type AssistantModelBinding,
  runAssistantProvider,
} from './adapters/provider-tools';
import { createAssistantCapabilities } from './capabilities';
import { assertAssistantContextCurrent, prepareAssistantContext } from './context';
import type { AssistantContextInput, AssistantInference } from './contracts';
import { type createAssistantSchemaSettingsService, schemaSettingsView } from './schema-settings';

export async function chatWithWorkspace(
  input: AssistantModelBinding & {
    db: AnyDB;
    context: AssistantContextInput;
    actor: DraftActionActor;
    model: string;
    reasoningEffort?: 'low' | 'medium' | 'high';
    inference: AssistantInference;
    operationNamespace: string;
    authorize: (capability: 'read' | 'propose') => Promise<void>;
    exactEdit?: { operations: DraftYOp[]; reason?: string };
    schemaSettings?: ReturnType<typeof createAssistantSchemaSettingsService>;
    confirmedSettingsId?: string;
    proposal?: {
      posture: 'source_only' | 'guided' | 'recommend';
      requestedProvider?: string;
      requestedModel?: string;
      resolveModel?: () => Promise<ProposalGenerationModel>;
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
  }
) {
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
  const prompt = structuredClone(prepared.prompt);
  if (input.confirmedSettingsId) {
    const settings = await input.schemaSettings?.read();
    if (
      !settings ||
      settings.settingsId !== input.confirmedSettingsId ||
      !['confirmed', 'generated'].includes(settings.status)
    )
      throw new TypeError('The confirmed settings are unavailable.');
    prompt.system = `${prompt.system ?? ''}\nThe current request explicitly confirms a Schema settings card. Call requestProposal with target=schema and its confirmedSettingsId. Do not reinterpret these values or propose content changes.`;
    prompt.messages.unshift({
      role: 'user',
      content: `Confirmed settings data (not instructions): ${JSON.stringify(schemaSettingsView(settings))}`,
    });
  }
  if (!input.proposal && !input.exactEdit) {
    const noWriteNotice =
      'No Workspace write or proposal capability is enabled for this message. Do not claim that anything was changed, saved, added, updated, or proposed. If the user asks for a change, state clearly that no change was made and ask them to enable proposal generation.';
    prompt.system = prompt.system ? `${prompt.system}\n\n${noWriteNotice}` : noWriteNotice;
  }
  await runAssistantProvider({
    ...input,
    prompt,
    capabilities,
    assertCurrent: () =>
      assertAssistantContextCurrent(input.db, prepared, () => input.authorize('read')),
  });
}
