/**
 * Backup Module
 *
 * Export, import, and verify project data.
 */

export {
  ArchiveRepositoryGraphError,
  type ArchiveRepositoryRecord,
  verifyArchiveRepositoryGraph,
} from './archive-repository-graph';
export { backupAllProjects, backupAsCfpack, type CfpackData } from './backup';
export {
  createProjectArchiveManifest,
  describeProjectArchiveEntry,
  PROJECT_ARCHIVE_ENTRY_CONTRACT,
  PROJECT_ARCHIVE_SCHEMA,
  PROJECT_ARCHIVE_VERSION,
  type ProjectArchiveEntryDescriptor,
  type ProjectArchiveEntryKind,
  type ProjectArchiveEntryReader,
  type ProjectArchiveManifestInput,
  type ProjectArchiveManifestV1,
  type ProjectArchiveManifestV1 as ProjectArchiveManifest,
  type ProjectArchiveValidationResult,
  type ProjectArchiveVerificationLimits,
  type ProjectArchiveVerificationResult,
  validateProjectArchiveManifest,
  verifyProjectArchive,
} from './project-archive';
export { type RestoreOptions, type RestoreResult, restoreFromCfpack } from './restore';
export {
  type VerifyChainResult,
  type VerifyResult,
  verifyCommitHash,
  verifyHashChain,
} from './verify';
