/**
 * Shared API types — neutral re-export surface so components reference
 * domain types without importing from the L1 adapter layer (`@/lib/api/*`)
 * directly.
 *
 * Adding new types here is cheap; it keeps the biome-enforced L4→L1 ban
 * strict while still letting components type their props. The per-domain
 * ban is defined in biome.json under `overrides`.
 */

export type { Citation } from '@/lib/api/chat';
export type { ApiCommit } from '@/lib/api/commits';
export type { TreeMergeSuggestion } from '@/lib/api/diff';
export type { WorkbenchDraft } from '@/lib/api/drafts';
export type {
  Assertion,
  CompareModelsResult,
  Constraint,
  EditLearnedConstraint,
  Leaf,
  LeafType,
  ReverseLearnResult,
  SuggestedConstraint,
} from '@/lib/api/leaves';
export type { ProviderInfo, Template } from '@/lib/api/misc';
export type { TurnContextData } from '@/lib/api/turns';
export type { Conversation, Project } from '@/lib/api/types';
