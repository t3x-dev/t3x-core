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
import type { FlatNode } from '../../semantic/types';
import { flattenTrees } from '../../semantic/tree';
import type { MeaningAgent, PipelineContext } from '../meaningPipeline';

export const sourceTraceValidatorAgent: MeaningAgent = {
  name: 'source_trace_validator',
  description: 'Validate that frame source references point to real conversation turns',
  usesLLM: false,

  shouldRun(ctx: PipelineContext): boolean {
    return ctx.content.trees.length > 0;
  },

  async run(ctx: PipelineContext, _provider: LLMProvider): Promise<PipelineContext> {
    // Build a set of known turn tags and hashes for fast lookup
    const knownTurnTags = new Set<string>();
    const knownTurnHashes = new Set<string>();

    for (let i = 0; i < ctx.turns.length; i++) {
      knownTurnTags.add(`T${i + 1}`);
      const turn = ctx.turns[i];
      if ('turn_hash' in turn && typeof turn.turn_hash === 'string') {
        knownTurnHashes.add(turn.turn_hash);
      }
    }

    const frames: FlatNode[] = flattenTrees(ctx.content.trees);
    for (const frame of frames) {
      // 1. Check frame-level source field
      if (frame.source) {
        if (!knownTurnTags.has(frame.source) && !knownTurnHashes.has(frame.source)) {
          ctx.meta.agentErrors.push({
            agent: 'source_trace_validator',
            error: `Frame "${frame.id}" source "${frame.source}" does not match any known turn`,
          });
        }
      } else {
        // Frame has no source — no traceability
        ctx.meta.agentErrors.push({
          agent: 'source_trace_validator',
          error: `WARNING: Frame "${frame.id}" (${frame.type}) has no source references`,
        });
      }
    }

    return ctx;
  },
};
