import { createHash } from 'node:crypto';
import type { LLMPrompt, LLMProvider } from '@t3x-dev/core';
import { executeMeteredInference } from '../../inference';
import type { AssistantCapabilities } from '../capabilities';
import type { AssistantInference } from '../contracts';
import { assistantProviderCapabilities } from '../policy';

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
  | { type: 'done'; reason: 'completed' | 'step_limit' | 'cancelled' };

/** Bounded loop. Each upstream call is separately admitted and metered through the existing runtime. */
export async function runAssistantProvider(input: {
  provider: LLMProvider;
  model: string;
  prompt: LLMPrompt;
  capabilities: AssistantCapabilities;
  inference: AssistantInference;
  operationNamespace: string;
  assertCurrent: () => Promise<void>;
  emit: (event: AssistantEvent) => Promise<void>;
  signal?: AbortSignal;
  maxSteps?: number;
  initialToolCall?: { name: string; input: unknown };
}) {
  const hasTools = assistantProviderCapabilities(input.provider).tools;
  await input.emit({
    type: 'capabilities',
    tools: hasTools,
    proposal: hasTools && Boolean(input.capabilities.requestProposal),
  });
  const prompt = structuredClone(input.prompt);
  const maxSteps = Math.min(8, Math.max(1, input.maxSteps ?? 5));
  let callIndex = 0;
  const seen = new Set<string>();
  if (input.initialToolCall) {
    const capability = Object.hasOwn(input.capabilities, input.initialToolCall.name)
      ? input.capabilities[input.initialToolCall.name]
      : undefined;
    if (!capability)
      throw new TypeError(`Capability ${input.initialToolCall.name} is not available`);
    const toolUseId = 'server-required-0';
    const operationId = `assistant:${createHash('sha256').update(`${input.operationNamespace}:${callIndex++}`).digest('hex')}`;
    await input.emit({
      type: 'operation',
      name: input.initialToolCall.name,
      operationId,
      status: 'started',
    });
    const result = await capability.execute(input.initialToolCall.input, operationId);
    await input.emit({
      type: 'operation',
      name: input.initialToolCall.name,
      operationId,
      status: 'completed',
      result,
    });
    prompt.messages.push({
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: toolUseId,
          name: input.initialToolCall.name,
          input: input.initialToolCall.input,
        },
      ],
    });
    prompt.messages.push({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content: JSON.stringify(result) }],
    });
  }
  for (let step = 0; step < maxSteps; step++) {
    if (input.signal?.aborted) {
      await input.emit({ type: 'done', reason: 'cancelled' });
      return;
    }
    await input.assertCurrent();
    if (JSON.stringify(prompt).length > 128_000)
      throw new TypeError('Assistant continuation exceeds context budget');
    const execution = await executeMeteredInference({
      runtime: input.inference.runtime,
      input: {
        runId: input.inference.runId,
        attemptIndex: step,
        feature: 'workspace.assistant.chat',
        requestedModel: input.model,
        scope: input.inference.scope,
      },
      resolvedProvider: input.provider.id,
      resolvedModel: input.model,
      invoke: async () => {
        if (hasTools) {
          const result = await input.provider.generateWithTools!(
            prompt,
            Object.values(input.capabilities).map((capability) => capability.definition),
            { model: input.model, maxTokens: 4096 }
          );
          return { value: result, usage: result.usage };
        }
        const result = input.provider.generateFromPrompt
          ? await input.provider.generateFromPrompt(prompt, { model: input.model, maxTokens: 4096 })
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
      await input.emit({ type: 'done', reason: 'completed' });
      return;
    }
    if (!hasTools || response.tool_calls.length > 8)
      throw new TypeError('Invalid Assistant tool response');
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
      const result = await capability.execute(call.input, operationId);
      await input.emit({
        type: 'operation',
        name: call.name,
        operationId,
        status: 'completed',
        result,
      });
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
