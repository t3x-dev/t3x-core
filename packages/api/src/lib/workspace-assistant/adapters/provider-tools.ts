import { createHash } from 'node:crypto';
import { type LLMPrompt, type LLMProvider, promptTextLength } from '@t3x-dev/core';
import { executeMeteredInference } from '../../inference';
import type { GenerationModel } from '../../model-runtime-contract';
import type { AssistantCapabilities } from '../capabilities';
import type { AssistantInference } from '../contracts';
import { assistantProviderCapabilities } from '../policy';
import { invokeWorkspaceGenerationModel } from './generation-model';

export type AssistantModelBinding =
  | { provider: LLMProvider; generationModel?: never }
  | { provider?: never; generationModel: GenerationModel };

export type AssistantEvent =
  | { type: 'capabilities'; tools: boolean; proposal: boolean }
  | { type: 'text'; content: string }
  | {
      type: 'operation';
      name: string;
      operationId: string;
      status: 'started' | 'completed';
      result?: unknown;
    }
  | { type: 'done'; reason: 'completed' | 'step_limit' | 'cancelled' | 'awaiting_confirmation' };

/** Bounded loop. Each upstream call is separately admitted and metered through the existing runtime. */
export async function runAssistantProvider(
  input: AssistantModelBinding & {
    model: string;
    reasoningEffort?: 'low' | 'medium' | 'high';
    prompt: LLMPrompt;
    capabilities: AssistantCapabilities;
    inference: AssistantInference;
    operationNamespace: string;
    assertCurrent: () => Promise<void>;
    authorizeContinuation?: () => Promise<void>;
    emit: (event: AssistantEvent) => Promise<void>;
    signal?: AbortSignal;
    maxSteps?: number;
  }
) {
  let hasTools =
    Object.keys(input.capabilities).length > 0 &&
    (input.generationModel
      ? input.generationModel.capabilities.includes('tool_use')
      : assistantProviderCapabilities(input.provider).tools);
  let terminalReason: 'completed' | 'awaiting_confirmation' = 'completed';
  let explainingResult = false;
  await input.emit({
    type: 'capabilities',
    tools: hasTools,
    proposal: hasTools && Boolean(input.capabilities.requestProposal),
  });
  const prompt = structuredClone(input.prompt);
  const maxSteps = Math.min(8, Math.max(1, input.maxSteps ?? 5));
  let callIndex = 0;
  let cardCorrections = 0;
  const seen = new Set<string>();
  const canStreamPlainResponse =
    typeof input.provider?.streamFromPrompt === 'function' && !hasTools;
  for (let step = 0; step < maxSteps; step++) {
    if (input.signal?.aborted) {
      await input.emit({ type: 'done', reason: 'cancelled' });
      return;
    }
    await (explainingResult && input.authorizeContinuation
      ? input.authorizeContinuation()
      : input.assertCurrent());
    if (promptTextLength(prompt) > 128_000)
      throw new TypeError('Assistant continuation exceeds context budget');
    if (canStreamPlainResponse) {
      await executeMeteredInference({
        runtime: input.inference.runtime,
        input: {
          runId: input.inference.runId,
          attemptIndex: step,
          feature: 'workspace.assistant.chat',
          requestedModel: input.model,
          scope: input.inference.scope,
        },
        resolvedProvider: input.provider!.id,
        resolvedModel: input.model,
        invoke: async () => {
          let usage = { inputTokens: 0, outputTokens: 0 };
          for await (const event of input.provider!.streamFromPrompt!(
            prompt,
            { model: input.model, maxTokens: 4096, reasoningEffort: input.reasoningEffort },
            input.signal
          )) {
            if (input.signal?.aborted) break;
            if (event.type === 'text' && event.text) {
              await input.emit({ type: 'text', content: event.text });
            } else if (event.type === 'done') {
              usage = event.usage;
            }
          }
          return { value: undefined, usage };
        },
      });
      await input.emit({
        type: 'done',
        reason: input.signal?.aborted ? 'cancelled' : 'completed',
      });
      return;
    }
    const execution = await executeMeteredInference({
      runtime: input.inference.runtime,
      input: {
        runId: input.inference.runId,
        attemptIndex: step,
        feature: 'workspace.assistant.chat',
        requestedModel: input.model,
        scope: input.inference.scope,
      },
      resolvedProvider: input.generationModel?.provider ?? input.provider!.id,
      resolvedModel: input.model,
      invoke: async (attempt) => {
        if (input.generationModel) {
          return invokeWorkspaceGenerationModel({
            model: input.generationModel,
            attempt,
            prompt,
            tools: hasTools
              ? Object.values(input.capabilities).map((capability) => capability.definition)
              : undefined,
            signal: input.signal,
            emitText: (content) => input.emit({ type: 'text', content }),
          });
        }
        if (hasTools) {
          const result = await input.provider.generateWithTools!(
            prompt,
            Object.values(input.capabilities).map((capability) => capability.definition),
            { model: input.model, maxTokens: 4096, reasoningEffort: input.reasoningEffort }
          );
          return { value: result, usage: result.usage };
        }
        const result = input.provider.generateFromPrompt
          ? await input.provider.generateFromPrompt(prompt, {
              model: input.model,
              maxTokens: 4096,
              reasoningEffort: input.reasoningEffort,
            })
          : await input.provider.generate(JSON.stringify(prompt), { maxTokens: 4096 });
        return {
          value: {
            tool_calls: [],
            stop_reason: 'end_turn' as const,
            usage: result.usage,
            _rawAssistantContent: [{ type: 'text', text: result.text }],
          },
          usage: result.usage,
        };
      },
    });
    if (input.signal?.aborted) {
      await input.emit({ type: 'done', reason: 'cancelled' });
      return;
    }
    const response = execution.value;
    const blocks = response._rawAssistantContent ?? [];
    for (const block of blocks)
      if (block.type === 'text' && typeof block.text === 'string')
        await input.emit({ type: 'text', content: block.text });
    if (response.tool_calls.length === 0) {
      await input.emit({ type: 'done', reason: terminalReason });
      return;
    }
    if (!hasTools || response.tool_calls.length > 8)
      throw new TypeError('Invalid Assistant tool response');
    if (
      response.tool_calls.some((call) => call.name === 'showSchemaChangeCard') &&
      response.tool_calls.length !== 1
    ) {
      if (
        cardCorrections >= 1 ||
        response.tool_calls.some((call) => call.name === 'requestProposal')
      )
        throw new TypeError('Show settings in a separate tool step before any other action.');
      ++cardCorrections;
      prompt.messages.push({
        role: 'assistant',
        content: response.tool_calls.map((call) => ({
          type: 'tool_use' as const,
          id: call.id,
          name: call.name,
          input: call.input,
        })),
      });
      prompt.messages.push({
        role: 'user',
        content: response.tool_calls.map((call) => ({
          type: 'tool_result' as const,
          tool_use_id: call.id,
          content: JSON.stringify({
            status: 'invalid_tool_batch',
            error:
              'No tools in this batch were executed. Read Schema in a separate step, then call showSchemaChangeCard once with the complete requested Node subtree. The server splits additions into individually confirmed timeline cards.',
          }),
        })),
      });
      continue;
    }
    prompt.messages.push({
      role: 'assistant',
      content: blocks.length
        ? blocks
        : response.tool_calls.map((call) => ({
            type: 'tool_use',
            id: call.id,
            name: call.name,
            input: call.input,
          })),
    });
    const results: Exclude<LLMPrompt['messages'][number]['content'], string> = [];
    for (const call of response.tool_calls) {
      if (input.signal?.aborted) {
        await input.emit({ type: 'done', reason: 'cancelled' });
        return;
      }
      if (seen.has(call.id)) throw new TypeError('Repeated provider tool call identity');
      seen.add(call.id);
      const capability = Object.hasOwn(input.capabilities, call.name)
        ? input.capabilities[call.name]
        : undefined;
      if (!capability) throw new TypeError(`Capability ${call.name} is not available`);
      // Allocated by the server from the business operation namespace, never from model-supplied IDs.
      const operationId = `assistant:${createHash('sha256').update(`${input.operationNamespace}:${callIndex++}`).digest('hex')}`;
      await input.emit({ type: 'operation', name: call.name, operationId, status: 'started' });
      let result: unknown;
      let invalidDefinition = false;
      try {
        result = await capability.execute(call.input, operationId);
      } catch (failure) {
        if (
          call.name !== 'showSchemaChangeCard' ||
          !(failure instanceof Error) ||
          !failure.message.startsWith('INVALID_SCHEMA:') ||
          cardCorrections >= 1
        )
          throw failure;
        ++cardCorrections;
        invalidDefinition = true;
        result = {
          status: 'invalid_definition',
          error: failure.message,
          guidance:
            'No card was saved. Correct only the definition representation using native slots and children, keeping the requested action and target unchanged; otherwise ask the user for clarification.',
        };
      }
      await input.emit({
        type: 'operation',
        name: call.name,
        operationId,
        status: 'completed',
        result,
      });
      if (call.name === 'showSchemaChangeCard' && !invalidDefinition) {
        hasTools = false;
        explainingResult = true;
        terminalReason = 'awaiting_confirmation';
        prompt.system = `${prompt.system ?? ''}\nGive one brief reply in the user's language after the tool has created the editable Schema cards in the Workspace timeline: summarize the requested changes and tell the user to adjust parameters, then Confirm each card to generate, validate and apply its snapshot to Draft. A child card waits only for its parent Node; sibling Slots can be confirmed in either order. Nothing has been applied yet. Mention a blocker only if the tool actually reports one. Do not enumerate internal statuses, routine checks, unrelated content gaps or claim readiness to publish. Confirm updates the cards without another chat reply. This continuation is text-only; do not request tools or claim a completed edit.`;
      }
      if (
        call.name === 'requestProposal' &&
        result &&
        typeof result === 'object' &&
        'kind' in result &&
        result.kind === 'schema'
      ) {
        hasTools = false;
        explainingResult = true;
        prompt.system = `${prompt.system ?? ''}\nExplain the actual Schema tool result in the user's language. A candidate is not an applied change. This continuation is text-only; do not request tools or claim content or Commit changes.`;
      }
      if (call.name === 'applyUserEdit') {
        await input.emit({ type: 'done', reason: 'completed' });
        return;
      }
      results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(result) });
    }
    prompt.messages.push({ role: 'user', content: results });
  }
  await input.emit({ type: 'done', reason: 'step_limit' });
}
