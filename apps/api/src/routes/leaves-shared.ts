/**
 * Shared helpers for leaves routes.
 *
 * Response-shape converters used by multiple leaves sub-routers.
 */

import type { Leaf, LeafHistory } from '@t3x-dev/core';

/**
 * Convert storage Leaf to API response format
 * Storage returns Leaf (snake_case), API uses snake_case with null for missing values
 */
export function toApiLeaf(leaf: Leaf) {
  return {
    id: leaf.id,
    commit_hash: leaf.commit_hash,
    type: leaf.type,
    title: leaf.title ?? null,
    constraints: leaf.constraints ?? [],
    config: leaf.config ?? {},
    output: leaf.output ?? null,
    generated_at: leaf.generated_at ?? null,
    assertions: leaf.assertions ?? null,
    runner_assertions: leaf.runner_assertions ?? null,
    project_id: leaf.project_id,
    created_at: leaf.created_at,
    created_by: leaf.created_by ?? null,
  };
}

/**
 * Convert storage LeafHistory to API response format
 */
export function toApiLeafHistory(history: LeafHistory) {
  return {
    id: history.id,
    leaf_id: history.leaf_id,
    output: history.output,
    config: history.config,
    model: history.model,
    generated_at: history.generated_at,
    created_by: history.created_by ?? null,
  };
}
