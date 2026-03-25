/**
 * Frame Compressor Orchestrator
 *
 * buildPrompt → LLM generate → parse JSON → validate (no 'add' actions) → return delta + metadata
 */

import type { LLMProvider } from '../llm/types';
import type { Delta } from '../semantic/types';
import type { CompressInput } from './compressPrompt';
import { buildCompressPrompt } from './compressPrompt';

const TEMPERATURE = 0.1;
const MAX_TOKENS = 4096;

export interface CompressMetadata {
  compress_summary: string;
  frames_before: number;
  frames_after: number;
  merged_count: number;
  removed_count: number;
  removed_frame_ids: string[];
}

export type CompressResult =
  | {
      ok: true;
      delta: Delta;
      metadata: CompressMetadata;
      usage: { inputTokens: number; outputTokens: number };
    }
  | { ok: false; error: string; usage: { inputTokens: number; outputTokens: number } };

export class FrameCompressor {
  constructor(private readonly provider: LLMProvider) {}

  async compress(input: CompressInput): Promise<CompressResult> {
    const { systemPrompt, userPrompt } = buildCompressPrompt(input);
    const combinedPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

    let raw: string;
    let usage = { inputTokens: 0, outputTokens: 0 };
    try {
      const genResult = await this.provider.generate(combinedPrompt, {
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

    // Parse JSON from response
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

    // Extract and validate changes
    const changes = parsed.changes;
    if (!Array.isArray(changes)) {
      return { ok: false, error: 'Missing or invalid changes array', usage };
    }

    // Reject any 'add' actions — compress should only remove/update
    if (changes.some((c: Record<string, unknown>) => c.action === 'add')) {
      return { ok: false, error: 'Compress delta must not contain add actions', usage };
    }

    // Build delta
    const delta: Delta = {
      changes: changes as Delta['changes'],
      remove_relations: Array.isArray(parsed.remove_relations)
        ? (parsed.remove_relations as Delta['remove_relations'])
        : undefined,
    };

    // Build metadata from stats
    const stats = (parsed.stats ?? {}) as Record<string, number>;
    const removedFrameIds = changes
      .filter((c: Record<string, unknown>) => c.action === 'remove')
      .map((c: Record<string, unknown>) => c.target as string);

    const metadata: CompressMetadata = {
      compress_summary: (parsed.summary as string) ?? 'Compressed frames',
      frames_before: stats.before ?? input.frames.length,
      frames_after: stats.after ?? input.frames.length - removedFrameIds.length,
      merged_count: stats.merged ?? 0,
      removed_count: stats.removed ?? removedFrameIds.length,
      removed_frame_ids: removedFrameIds,
    };

    return { ok: true, delta, metadata, usage };
  }
}
