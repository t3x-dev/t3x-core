// Unified Pipeline Operations — barrel export
export { buildPipelineContext, type ApiPipelineContext } from './context';
export { yopsApplyOp, type YopsApplyInput, type YopsApplyOutput } from './yops-apply';
export { commitOp, type CommitInput, type CommitOutput } from './commit';
export { diffOp, type DiffInput, type DiffOutput } from './diff';
export { leafGenerateOp, type LeafGenInput, type LeafGenOutput } from './leaf-gen';
export {
	mergePrepareOp,
	mergeExecuteOp,
	type MergePrepareInput,
	type MergePrepareOutput,
	type MergeExecuteInput,
	type MergeExecuteOutput,
} from './merge';
export { extractOp, type ExtractInput, type ExtractOutput } from './extract';
