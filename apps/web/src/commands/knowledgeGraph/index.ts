/**
 * commands/knowledgeGraph — v2 §2.4 aggregate command module.
 *
 * Source policy: none.
 * Optimistic-update style: all-or-nothing.
 * Error surface: KnowledgeGraphPersistenceError (extends CommandError).
 */

export { type BuildResult, buildKnowledgeGraph } from './buildKnowledgeGraph';
export { deleteKnowledgeGraph } from './deleteKnowledgeGraph';
export { KnowledgeGraphPersistenceError } from './errors';
