/**
 * Regression Checker Agent (Step 5)
 *
 * Compares current extraction result against the previous snapshot.
 * Flags when significant content is lost (>30% frames disappeared),
 * which likely indicates an extraction regression rather than
 * intentional removal.
 *
 * Pure CODE, no LLM. Non-fatal: records issues in agentErrors.
 */

import type { LLMProvider } from '../../llm/types';
import type { MeaningAgent, PipelineContext } from '../meaningPipeline';

/** If more than this fraction of frames are lost, flag as regression */
const REGRESSION_THRESHOLD = 0.3;

export const regressionCheckerAgent: MeaningAgent = {
  name: 'regression_checker',
  description: 'Detect significant content loss compared to previous snapshot',
  usesLLM: false,

  shouldRun(ctx: PipelineContext): boolean {
    // Only meaningful when there's a previous snapshot with content
    return !!ctx.previousSnapshot && ctx.previousSnapshot.frames.length > 0;
  },

  async run(ctx: PipelineContext, _provider: LLMProvider): Promise<PipelineContext> {
    const prev = ctx.previousSnapshot!;
    const prevCount = prev.frames.length;
    const currCount = ctx.content.frames.length;

    // 1. Check frame count drop
    if (currCount < prevCount) {
      const lossRatio = (prevCount - currCount) / prevCount;
      if (lossRatio > REGRESSION_THRESHOLD) {
        ctx.meta.agentErrors.push({
          agent: 'regression_checker',
          error: `WARNING: Frame count dropped ${prevCount}→${currCount} (${Math.round(lossRatio * 100)}% loss, threshold ${REGRESSION_THRESHOLD * 100}%)`,
        });
      }
    }

    // 2. Check for disappeared frame types
    const prevTypes = new Set(prev.frames.map((f) => f.type));
    const currTypes = new Set(ctx.content.frames.map((f) => f.type));
    const disappeared: string[] = [];

    for (const t of prevTypes) {
      if (!currTypes.has(t)) {
        disappeared.push(t);
      }
    }

    if (disappeared.length > 0) {
      ctx.meta.agentErrors.push({
        agent: 'regression_checker',
        error: `WARNING: Frame types disappeared: ${disappeared.join(', ')}`,
      });
    }

    return ctx;
  },
};
