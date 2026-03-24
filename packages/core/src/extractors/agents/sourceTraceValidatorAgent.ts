/**
 * Source Trace Validator Agent (Step 5)
 *
 * Checks that every frame has traceable source references back to
 * conversation turns. Catches LLM hallucinations where frames or
 * slots reference non-existent turns.
 *
 * Pure CODE, no LLM. Non-fatal: records issues in agentErrors.
 */

import type { LLMProvider } from '../../llm/types';
import type { MeaningAgent, PipelineContext } from '../meaningPipeline';

export const sourceTraceValidatorAgent: MeaningAgent = {
  name: 'source_trace_validator',
  description: 'Validate that frame source references point to real conversation turns',
  usesLLM: false,

  shouldRun(ctx: PipelineContext): boolean {
    return ctx.content.frames.length > 0;
  },

  async run(ctx: PipelineContext, _provider: LLMProvider): Promise<PipelineContext> {
    // Build a set of known turn tags and hashes for fast lookup
    const knownTurnTags = new Set<string>();
    const knownTurnHashes = new Set<string>();

    for (let i = 0; i < ctx.turns.length; i++) {
      // Turn tags are T1, T2, T3, ... (1-based)
      knownTurnTags.add(`T${i + 1}`);
      const turn = ctx.turns[i];
      if ('turn_hash' in turn && typeof turn.turn_hash === 'string') {
        knownTurnHashes.add(turn.turn_hash);
      }
    }

    for (const frame of ctx.content.frames) {
      // 1. Check frame-level source field
      if (frame.source) {
        if (!knownTurnTags.has(frame.source) && !knownTurnHashes.has(frame.source)) {
          ctx.meta.agentErrors.push({
            agent: 'source_trace_validator',
            error: `Frame "${frame.id}" source "${frame.source}" does not match any known turn`,
          });
        }
      }

      // 2. Check per-slot source references
      if (frame.slot_sources) {
        for (const [slotKey, ref] of Object.entries(frame.slot_sources)) {
          // Validate turn tag
          if (ref.turn && !knownTurnTags.has(ref.turn) && !knownTurnHashes.has(ref.turn)) {
            ctx.meta.agentErrors.push({
              agent: 'source_trace_validator',
              error: `Frame "${frame.id}" slot "${slotKey}" turn ref "${ref.turn}" does not match any known turn`,
            });
          }

          // Validate turn_hash if present
          if (ref.turn_hash && !knownTurnHashes.has(ref.turn_hash)) {
            ctx.meta.agentErrors.push({
              agent: 'source_trace_validator',
              error: `Frame "${frame.id}" slot "${slotKey}" turn_hash "${ref.turn_hash.slice(0, 16)}..." not found in conversation`,
            });
          }

          // Validate char range
          if (ref.start_char >= ref.end_char) {
            ctx.meta.agentErrors.push({
              agent: 'source_trace_validator',
              error: `WARNING: Frame "${frame.id}" slot "${slotKey}" has invalid char range: start=${ref.start_char} >= end=${ref.end_char}`,
            });
          }
        }
      }

      // 3. Frame has neither source nor slot_sources — no traceability
      if (!frame.source && !frame.slot_sources) {
        ctx.meta.agentErrors.push({
          agent: 'source_trace_validator',
          error: `WARNING: Frame "${frame.id}" (${frame.type}) has no source references`,
        });
      }
    }

    return ctx;
  },
};
