/**
 * Compressor Orchestrator
 *
 * buildPrompt → LLM generate → parse JSON → validate (no 'add' YOps) → return yops + metadata
 */

import type { LLMProvider } from '../llm/types';
import type { YOp } from '../yops/types';
import type { CompressInput } from './compressPrompt';
import { buildCompressPrompt } from './compressPrompt';

const TEMPERATURE = 0.1;
const MAX_TOKENS = 4096;

export interface CompressMetadata {
  compress_summary: string;
  nodes_before: number;
  nodes_after: number;
  merged_count: number;
  removed_count: number;
  removed_node_ids: string[];
  /** @deprecated Use nodes_before */
  frames_before?: number;
  /** @deprecated Use nodes_after */
  frames_after?: number;
  /** @deprecated Use removed_node_ids */
  removed_frame_ids?: string[];
}

export type CompressResult =
  | {
      ok: true;
      yops: YOp[];
      metadata: CompressMetadata;
      usage: { inputTokens: number; outputTokens: number };
    }
  | { ok: false; error: string; usage: { inputTokens: number; outputTokens: number } };

export class Compressor {
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

    // Convert legacy delta changes to YOps
    // Compress only allows: update → set, remove → drop (reject 'add')
    const yops: YOp[] = [];
    for (const change of changes as Array<Record<string, unknown>>) {
      if (change.action === 'add') {
        return { ok: false, error: 'Compress output must not contain add actions', usage };
      }
      if (change.action === 'remove') {
        yops.push({ drop: { path: change.target as string, reason: (change.reason as string) ?? 'compressed' } });
      } else if (change.action === 'update') {
        const target = change.target as string;
        const slots = change.slots as Record<string, unknown> | undefined;
        if (slots) {
          for (const [key, value] of Object.entries(slots)) {
            yops.push({ set: { path: `${target}/${key}`, value: value as string | number | boolean, source: 'compress', from: 'system' } });
          }
        }
      }
    }

    // Build metadata from stats
    const stats = (parsed.stats ?? {}) as Record<string, number>;
    const removedNodeIds = (changes as Array<Record<string, unknown>>)
      .filter((c) => c.action === 'remove')
      .map((c) => c.target as string);

    const metadata: CompressMetadata = {
      compress_summary: (parsed.summary as string) ?? 'Compressed nodes',
      nodes_before: stats.before ?? input.frames.length,
      nodes_after: stats.after ?? input.frames.length - removedNodeIds.length,
      merged_count: stats.merged ?? 0,
      removed_count: stats.removed ?? removedNodeIds.length,
      removed_node_ids: removedNodeIds,
      // Backward compatibility
      frames_before: stats.before ?? input.frames.length,
      frames_after: stats.after ?? input.frames.length - removedNodeIds.length,
      removed_frame_ids: removedNodeIds,
    };

    return { ok: true, yops, metadata, usage };
  }
}
