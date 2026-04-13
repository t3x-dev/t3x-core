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
export type { DeployAgent } from '@/infrastructure/deploy';
export type { TreeMergeSuggestion } from '@/infrastructure/diff';
export type {
  DraftConstraint,
  DraftNode,
  LocatedEvidenceAPI,
  SemanticPointAPI,
  SuggestResult,
  WorkbenchDraft,
} from '@/infrastructure/drafts';
export type {
  CosineBucket,
  FeedbackStats,
} from '@/infrastructure/extraction-feedback';
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
export type {
  CreateTemplateInput,
  CreateWebhookInput,
  ImportParagraph,
  ProviderInfo,
  ShareLink,
  Template,
  TemplateVariable,
  UpdateWebhookInput,
  WebhookData,
} from '@/infrastructure/misc';
export type { ConversationContext } from '@/infrastructure/pins';
export type { NodeRelation, RelationType } from '@/infrastructure/relations';
export type { EngineRun } from '@/infrastructure/runner';
export type { CommitMeta } from '@/infrastructure/treeDiff';
export type { TurnContextData } from '@/infrastructure/turns';
export type { QuickVerifyResult, VerifyResult } from '@/infrastructure/projects';
export type {
  Branch,
  Commit,
  Conversation,
  LLMProviderInfo,
  Project,
  Turn,
} from '@/infrastructure/types';
export type { NodeMember } from '@/types/knowledgeGraph';
