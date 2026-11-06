import type { WorkspaceFullSchemaReview } from '@t3x-dev/api-client';
import { schemaRootKeyFromBinding } from './yschema-registry';

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const empty = (value: unknown) => record(value) && Object.keys(value).length === 0;
const rootKey = (value: unknown): string | null =>
  typeof value === 'string' && /^[a-z][a-z0-9_]*$/.test(value) ? value : null;

/** Read the single authored root without guessing from a Schema name. */
export function workspaceDocumentRootKey(value: unknown): string | null {
  if (!record(value)) return null;
  if (value.domain === 't3x.dev/semantic-content' && record(value.content)) {
    const trees = value.content.trees;
    return Array.isArray(trees) && trees.length === 1 && record(trees[0])
      ? rootKey(trees[0].key)
      : null;
  }
  const keys = Object.keys(value);
  return keys.length === 1 ? rootKey(keys[0]) : null;
}

/** Only the empty document or its transport root; a named business node is content. */
export function hasNoWorkspaceBusinessContent(value: unknown, rootKey: string): boolean {
  if (!record(value)) return false;
  if (empty(value)) return true;
  if (Object.keys(value).length === 1 && empty(value[rootKey])) return true;
  if (value.domain !== 't3x.dev/semantic-content' || value.version !== 1 || !record(value.content))
    return false;
  if (
    Object.keys(value).some((key) => !['domain', 'version', 'content'].includes(key)) ||
    Object.keys(value.content).some((key) => !['trees', 'relations'].includes(key))
  )
    return false;
  const { trees, relations } = value.content;
  if (!Array.isArray(trees) || !Array.isArray(relations) || relations.length) return false;
  if (!trees.length) return true;
  return (
    trees.length === 1 &&
    record(trees[0]) &&
    trees[0].key === rootKey &&
    Object.keys(trees[0]).every((key) => ['key', 'slots', 'children'].includes(key)) &&
    empty(trees[0].slots) &&
    Array.isArray(trees[0].children) &&
    trees[0].children.length === 0
  );
}

/** Server-owned applicability, rechecked from the frozen pair rather than a client toggle. */
export function isSchemaOnlyWorkspaceReview(review: WorkspaceFullSchemaReview): boolean {
  const rootKey = schemaRootKeyFromBinding(review.draft.bindings[0]);
  return (
    review.contentValidation === 'not_applicable' &&
    review.base.status !== 'unknown' &&
    review.draft.status === 'bound' &&
    (review.base.status !== review.draft.status ||
      review.base.schemaHash !== review.draft.schemaHash) &&
    hasNoWorkspaceBusinessContent(review.baseContent, rootKey) &&
    hasNoWorkspaceBusinessContent(review.draftContent, rootKey)
  );
}
