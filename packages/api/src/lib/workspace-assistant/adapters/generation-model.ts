import { isPromptImageBlock, type LLMPrompt, type LLMProvider } from '@t3x-dev/core';
import { z } from 'zod';
import type { InferenceAttempt, MeteredInferenceResult } from '../../inference';
import {
  type GenerationModel,
  type GenerationModelContentPart,
  GenerationModelError,
  type GenerationModelEvidence,
  type GenerationModelMessage,
  type GenerationModelRequest,
  type GenerationModelResult,
} from '../../model-runtime-contract';
import type { ProposalGenerationModel } from '../../proposal-generation';
import { createProposalGenerationModel } from '../../proposal-generation-model';

type ToolDefinition = Parameters<NonNullable<LLMProvider['generateWithTools']>>[1][number];
type ToolUseResult = Awaited<ReturnType<NonNullable<LLMProvider['generateWithTools']>>>;

function messagesFromPrompt(prompt: LLMPrompt, model: GenerationModel): GenerationModelMessage[] {
  const messages: GenerationModelMessage[] = [];
  const toolNames = new Map<string, string>();
  if (prompt.system) messages.push({ role: 'system', content: prompt.system });
  for (const message of prompt.messages) {
    if (typeof message.content === 'string') {
      messages.push({ ...message, content: message.content });
      continue;
    }
    const content = message.content.map((part): GenerationModelContentPart => {
      if (part.type === 'text' && typeof part.text === 'string')
        return { type: 'text', text: part.text };
      if (isPromptImageBlock(part) && model.capabilities.includes('image_input')) {
        return { type: 'image', mediaType: part.source.media_type, data: part.source.data };
      }
      if (
        part.type === 'tool_use' &&
        typeof part.id === 'string' &&
        typeof part.name === 'string'
      ) {
        toolNames.set(part.id, part.name);
        return { type: 'tool_call', id: part.id, name: part.name, input: part.input };
      }
      if (part.type === 'tool_result' && typeof part.tool_use_id === 'string') {
        const name = toolNames.get(part.tool_use_id);
        if (name) return { type: 'tool_result', id: part.tool_use_id, name, output: part.content };
      }
      throw new GenerationModelError('generation_content_unsupported', 'not_started');
    });
    messages.push({
      role: content.every((part) => part.type === 'tool_result') ? 'tool' : message.role,
      content,
    });
  }
  return messages;
}

function metering(evidence: GenerationModelEvidence) {
  return {
    resolvedProvider: evidence.provider,
    resolvedModel: evidence.model,
    usage: evidence.usage,
    finishStatus: evidence.finishReason,
    providerRequestId: evidence.providerRequestId,
    providerReportedCost: evidence.providerReportedCost,
  };
}

/** Called only inside an admitted inference attempt; never creates a second billing identity. */
async function invokeModel(input: {
  model: GenerationModel;
  attempt: InferenceAttempt;
  request: GenerationModelRequest;
  signal?: AbortSignal;
  emitText?: (text: string) => Promise<void>;
}): Promise<GenerationModelResult> {
  if (input.signal?.aborted) throw new GenerationModelError('generation_cancelled', 'not_started');
  const invocation = {
    generationId: input.attempt.generationId,
    runId: input.attempt.runId,
    attemptIndex: input.attempt.attemptIndex,
    feature: input.attempt.feature,
    request: input.request,
  };
  if (
    input.emitText &&
    input.model.stream &&
    input.model.capabilities.includes('streaming') &&
    !input.request.tools?.length
  ) {
    const stream = await input.model.stream(invocation, input.signal);
    for await (const chunk of stream.chunks) {
      if (chunk.type === 'text_delta' && !input.signal?.aborted) await input.emitText(chunk.delta);
      else if (chunk.type === 'tool_call')
        throw new GenerationModelError('unexpected_tool_call', 'unknown');
    }
    const terminal = await stream.terminal;
    if (terminal.kind === 'failed') throw terminal.error;
    if (terminal.kind === 'cancelled')
      throw new GenerationModelError('generation_cancelled', terminal.outcome);
    return { output: [], evidence: terminal.evidence };
  }
  return input.model.generate(invocation, input.signal);
}

export async function invokeWorkspaceGenerationModel(input: {
  model: GenerationModel;
  attempt: InferenceAttempt;
  prompt: LLMPrompt;
  tools?: ToolDefinition[];
  signal?: AbortSignal;
  emitText: (text: string) => Promise<void>;
}): Promise<MeteredInferenceResult<ToolUseResult>> {
  const result = await invokeModel({
    ...input,
    request: {
      messages: messagesFromPrompt(input.prompt, input.model),
      maxOutputTokens: 4096,
      ...(input.tools?.length
        ? {
            tools: input.tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.input_schema,
            })),
          }
        : {}),
    },
  });
  const calls = result.output.flatMap((part) =>
    part.type === 'tool_call' ? [{ id: part.id, name: part.name, input: part.input }] : []
  );
  return {
    ...metering(result.evidence),
    value: {
      usage: result.evidence.usage,
      tool_calls: calls,
      stop_reason: calls.length ? 'tool_use' : 'end_turn',
      _rawAssistantContent: result.output.flatMap(
        (part): NonNullable<ToolUseResult['_rawAssistantContent']> => {
          if (part.type === 'text') return [{ type: 'text', text: part.text }];
          if (part.type === 'tool_call')
            return [{ type: 'tool_use', id: part.id, name: part.name, input: part.input }];
          return [];
        }
      ),
    },
  };
}

/** Reuse Proposal validation and trial apply, with the same managed model and admitted attempt. */
export function createWorkspaceProposalModel(model: GenerationModel): ProposalGenerationModel {
  return {
    provider: model.provider,
    model: model.modelId,
    async generate(input, attempt) {
      if (!attempt || !model.capabilities.includes('structured_output')) {
        throw new GenerationModelError('generation_capability_unsupported', 'not_started');
      }
      let evidence: GenerationModelEvidence | undefined;
      const proposal = createProposalGenerationModel({
        providerId: model.provider,
        model: model.modelId,
        retry: false,
        provider: {
          async generateStructured(prompt, schema, options) {
            const result = await invokeModel({
              model,
              attempt,
              request: {
                messages: messagesFromPrompt(prompt, model),
                output: {
                  type: 'json',
                  name: 'ProposalGenerationDraft',
                  // Protocol refinements remain server-validated by schema.parse below.
                  schema: z.toJSONSchema(schema, { unrepresentable: 'any', io: 'input' }),
                },
                temperature: options.temperature,
                maxOutputTokens: options.maxTokens,
              },
            });
            evidence = result.evidence;
            const json = result.output.find((part) => part.type === 'json');
            const value =
              json?.type === 'json'
                ? json.value
                : JSON.parse(
                    result.output
                      .flatMap((part) => (part.type === 'text' ? [part.text] : []))
                      .join('')
                  );
            return { data: schema.parse(value), usage: result.evidence.usage };
          },
        },
      });
      const result = await proposal.generate(input);
      return { ...result, ...metering(evidence!) };
    },
  };
}
