import { applyYOps } from '../../t3x-yops/engine';
import type { SemanticContent } from '../../semantic/types';
import {
  createExtractionFailure,
  type ExtractionFailure,
} from './failures';
import {
  runExtractionV2Pipeline,
  type ExtractionV2PipelineInput,
} from './pipeline';

export interface ExtractAndApplyInput extends ExtractionV2PipelineInput {}

export type ExtractAndApplyResult =
  | ({
      ok: true;
      snapshot: SemanticContent;
    } & Awaited<ReturnType<typeof runExtractionV2Pipeline>> & { ok: true })
  | {
      ok: false;
      failure: ExtractionFailure;
      turnHashByTag: Record<string, string>;
    };

export async function extractAndApply(
  input: ExtractAndApplyInput
): Promise<ExtractAndApplyResult> {
  const result = await runExtractionV2Pipeline(input);
  if (!result.ok) {
    return result;
  }

  const baseSnapshot: SemanticContent = input.snapshot ?? { trees: [], relations: [] };
  const applied = applyYOps(baseSnapshot, result.compiled.ops);
  if (!applied.ok) {
    return {
      ok: false,
      turnHashByTag: result.turnHashByTag,
      failure: createExtractionFailure(
        'executable_structure',
        applied.error?.message ?? 'Failed to apply compiled YOps'
      ),
    };
  }

  return {
    ...result,
    ok: true,
    snapshot: {
      trees: applied.trees,
      relations: applied.relations,
    },
  };
}
