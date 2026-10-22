import type { AssistantSchemaSettingsInput } from '@t3x-dev/api-client';
import { compileConfirmedSchemaChange } from './schema-change-contract';

export interface SchemaProposalGenerationInput {
  target: 'schema';
  baseSchema: unknown;
  confirmedSettings: AssistantSchemaSettingsInput;
  assertCurrent?(): Promise<void>;
}

/** Human-confirmed parameters compile to guarded, replay-verified YOps without model inference. */
export async function generateSchemaTransitionProposal(input: SchemaProposalGenerationInput) {
  await input.assertCurrent?.();
  const compiled = await compileConfirmedSchemaChange(input.baseSchema, input.confirmedSettings);
  await input.assertCurrent?.();
  return { kind: 'schema' as const, ...compiled };
}
