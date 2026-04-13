/**
 * API client barrel re-export
 *
 * All consumers should import from '@/lib/api' which resolves here.
 * The original api.ts file is a shim that re-exports from this index.
 */

export * from './auth';
export * from './autopilot';
export * from './branches';
export * from './chat';
export * from './commits';
export * from './conversations';
export * from './core';
export * from './deploy';
export * from './diff';
export * from './drafts';
export * from './export';
export * from './extraction-feedback';
export * from './extractionStream';
export * from './trees';
export * from './topics';
export * from './treeDiff';
export * from './health';
export * from './knowledge-graph';
export * from './leaves';
export * from './llm';
// merge.ts moved to @/infrastructure/mergeApi per doc §2 L1 (Phase 4).
// Consumers must import merge ops from @/queries/mergeApi (L3).
export * from './misc';
export * from './pins';
export * from './projects';
export * from './recipes';
export * from './relations';
export * from './runner';
export * from './search';
export * from './turns';
export * from './types';
