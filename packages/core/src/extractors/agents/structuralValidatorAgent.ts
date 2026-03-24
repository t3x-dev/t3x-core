/**
 * Structural Validator Agent (Step 5)
 *
 * Wraps existing validateIntegrity() as a pipeline agent.
 * Runs after all other agents to catch structural issues introduced
 * by LLM-based agents (broken refs, cycles, duplicate IDs, etc.).
 *
 * Pure CODE, no LLM. Non-fatal: records issues in agentErrors.
 *
 * @see https://github.com/t3x-dev/t3x-core/issues/619
 */

import type { LLMProvider } from '../../llm/types';
import { validateIntegrity } from '../../semantic/validate';
import type { MeaningAgent, PipelineContext } from '../meaningPipeline';

export const structuralValidatorAgent: MeaningAgent = {
  name: 'structural_validator',
  description: 'Validate structural integrity of frames and relations after agent processing',
  usesLLM: false,

  shouldRun(ctx: PipelineContext): boolean {
    return ctx.content.frames.length > 0;
  },

  async run(ctx: PipelineContext, _provider: LLMProvider): Promise<PipelineContext> {
    const result = validateIntegrity(ctx.content);

    if (!result.valid) {
      for (const error of result.errors) {
        ctx.meta.agentErrors.push({
          agent: 'structural_validator',
          error: `${error.type}: ${error.message} (${error.location})`,
        });
      }
    }

    for (const warning of result.warnings) {
      ctx.meta.agentErrors.push({
        agent: 'structural_validator',
        error: `WARNING ${warning.type}: ${warning.message} (${warning.location})`,
      });
    }

    return ctx;
  },
};
