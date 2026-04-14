/**
 * commands/yops — v2 §2.4 aggregate command module (SemanticContent).
 *
 * Source policy: STRICT. Every YOp must carry LLMSource or HumanSource;
 *   commitOps asserts presence + shape at entry.
 * Optimistic-update style: caller-rollback. Hooks (useGoldEdit) save
 *   pre-opsLog and restore on failure.
 * Error surface: ExtractionFailedError, SourceValidationError,
 *   YOpsReplayError (all extend CommandError).
 *
 * Note: existing consumers import from sub-paths (yopsService,
 * extractionWorker, llmAdapter, goldEditBuilder, errors). This barrel
 * is provided for §2.4 symmetry and new consumers.
 */

export {
  ExtractionFailedError,
  SourceValidationError,
  YOpsReplayError,
} from './errors';
export { runExtraction } from './extractionWorker';
export { buildHumanSource, commitGoldEdit } from './goldEditBuilder';
export { callExtractionLLM } from './llmAdapter';
export { commitOps } from './yopsService';
