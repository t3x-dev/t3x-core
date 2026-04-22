import type { LLMProvider } from '../../llm/types';
import type { YOp } from '../../t3x-yops/types';
import { buildCompressPrompt, type CompressInput, type NodeWithSignals } from '../compressPrompt';

const TEMPERATURE = 0.1;
const MAX_TOKENS = 4096;

export interface CompressionV2Metadata {
  compress_summary: string;
  nodes_before: number;
  nodes_after: number;
  merged_count: number;
  removed_count: number;
  removed_node_ids: string[];
}

export interface CompressionV2Usage {
  inputTokens: number;
  outputTokens: number;
}

export type CompressionV2Result =
  | {
      ok: true;
      yops: YOp[];
      metadata: CompressionV2Metadata;
      usage: CompressionV2Usage;
    }
  | {
      ok: false;
      error: string;
      usage: CompressionV2Usage;
    };

export interface CompressionV2PipelineInput {
  provider: Pick<LLMProvider, 'generate'>;
  frames: NodeWithSignals[];
  relations: CompressInput['relations'];
}

export async function runCompressionV2Pipeline(
  input: CompressionV2PipelineInput
): Promise<CompressionV2Result> {
  const { systemPrompt, userPrompt } = buildCompressPrompt({
    frames: input.frames,
    relations: input.relations,
  });
  const combinedPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

  let raw: string;
  let usage: CompressionV2Usage = { inputTokens: 0, outputTokens: 0 };
  try {
    const genResult = await input.provider.generate(combinedPrompt, {
      temperature: TEMPERATURE,
      maxTokens: MAX_TOKENS,
    });
    raw = genResult.text;
    usage = genResult.usage;
  } catch (err) {
    return {
      ok: false,
      error: `LLM error: ${err instanceof Error ? err.message : String(err)}`,
      usage,
    };
  }

  let parsed: Record<string, unknown>;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { ok: false, error: 'No JSON found in LLM output', usage };
    }
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return { ok: false, error: 'Invalid JSON in LLM output', usage };
  }

  const changes = parsed.changes;
  if (!Array.isArray(changes)) {
    return { ok: false, error: 'Missing or invalid changes array', usage };
  }

  const yops: YOp[] = [];
  for (const change of changes as Array<Record<string, unknown>>) {
    if (change.action === 'add' || change.action === 'define' || change.action === 'populate') {
      return {
        ok: false,
        error: 'Compress output must not contain add/define/populate actions',
        usage,
      };
    }
    if (change.action === 'remove') {
      yops.push({ drop: { path: change.target as string } });
    } else if (change.action === 'update') {
      const target = change.target as string;
      const slots = change.slots as Record<string, unknown> | undefined;
      if (slots) {
        for (const [key, value] of Object.entries(slots)) {
          yops.push({
            set: {
              path: `${target}/${key}`,
              value: value as string | number | boolean,
            },
          });
        }
      }
    }
  }

  const stats = (parsed.stats ?? {}) as Record<string, number>;
  const removedNodeIds = (changes as Array<Record<string, unknown>>)
    .filter((c) => c.action === 'remove')
    .map((c) => c.target as string);

  const metadata: CompressionV2Metadata = {
    compress_summary: (parsed.summary as string) ?? 'Compressed nodes',
    nodes_before: stats.before ?? input.frames.length,
    nodes_after: stats.after ?? input.frames.length - removedNodeIds.length,
    merged_count: stats.merged ?? 0,
    removed_count: stats.removed ?? removedNodeIds.length,
    removed_node_ids: removedNodeIds,
  };

  return { ok: true, yops, metadata, usage };
}
