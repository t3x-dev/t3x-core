/**
 * Shared API types — neutral re-export surface so components reference
 * domain types without importing from the L1 adapter layer (`@/lib/api/*`)
 * directly.
 *
 * Adding new types here is cheap; it keeps the biome-enforced L4→L1 ban
 * strict while still letting components type their props. The per-domain
 * ban is defined in biome.json under `overrides`.
 */

export type { Citation } from '@/infrastructure/chat';
export type { ApiCommit } from '@/infrastructure/commits';
export type { TreeMergeSuggestion } from '@/infrastructure/diff';
export type { DraftConstraint, DraftNode, WorkbenchDraft } from '@/infrastructure/drafts';
export type { NodeMember } from '@/infrastructure/knowledge-graph';
export type {
  Assertion,
  CompareModelsResult,
  Constraint,
  EditLearnedConstraint,
  Leaf,
  LeafType,
  ReverseLearnResult,
  SuggestedConstraint,
} from '@/infrastructure/leaves';
export type { ProviderInfo, Template } from '@/infrastructure/misc';
export type { ConversationContext } from '@/infrastructure/pins';
export type { TurnContextData } from '@/infrastructure/turns';
export type { Branch, Commit, Conversation, Project } from '@/infrastructure/types';
