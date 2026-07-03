/**
 * Shared API types — neutral re-export surface so components reference
 * domain types without importing from the L1 adapter layer
 * (`@/infrastructure/*`) directly.
 *
 * Adding new types here is cheap; it keeps the biome-enforced L4→L1 ban
 * strict while still letting components type their props. The per-domain
 * ban is defined in biome.json under `overrides`.
 */

export type {
  AdaptiveResult,
  AutoCommitResult,
  AutopilotConfig,
} from '@/infrastructure/autopilot';
export type { Citation } from '@/infrastructure/chat';
export type { ApiCommit } from '@/infrastructure/commits';
export type {
  ContextManifestBaseline,
  ContextManifestFeedback,
  ContextManifestReference,
  ContextManifestSource,
  ContextManifestSourceItem,
  ContextManifestSourceKind,
  ContextManifestSourceRole,
  ConversationContextManifest,
} from '@/infrastructure/contextManifest';
export { ApiError } from '@/infrastructure/core';
export type { DeployAgent } from '@/infrastructure/deploy';
export type { TreeMergeSuggestion } from '@/infrastructure/diff';
export type {
  DraftConstraint,
  DraftNode,
  LocatedEvidenceAPI,
  SemanticPointAPI,
  WorkbenchDraft,
} from '@/infrastructure/drafts';
export type { CommitExportFormat } from '@/infrastructure/export/commit';
// Export-format unions (re-exported so components consume types
// without touching @/infrastructure — Phase F boundary).
export type { ExportFormat } from '@/infrastructure/export/core';
export type { TemplateExportFormat } from '@/infrastructure/export/template';
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
  LeafConfig,
  LeafSemanticPointOverride,
  LeafSemanticPointState,
  LeafType,
  ReverseLearnResult,
  SuggestedConstraint,
} from '@/infrastructure/leaves';
export type {
  Material,
  MaterialDetail,
  MaterialParseQuality,
  MaterialSegment,
} from '@/infrastructure/materials';
export type {
  CreateTemplateInput,
  CreateWebhookInput,
  ImportParagraph,
  ImportPreviewResult,
  ImportResult,
  ImportStreamEvent,
  NotificationItem,
  PlatformImportResult,
  PlatformPreviewResult,
  ProviderInfo,
  RoleAssignment,
  ShareLink,
  Template,
  TemplateLeafType,
  TemplateVariable,
  UpdateWebhookInput,
  WebhookData,
} from '@/infrastructure/misc';
// Value-level re-exports (v2 §2.3 — consumers pattern-match via
// instanceof / numeric comparison; hook-化 applies to functions only).
export { STREAMING_IMPORT_THRESHOLD } from '@/infrastructure/misc';
export type { ConversationContext } from '@/infrastructure/pins';
export type {
  CreateYSchemaValidationRunPayload,
  LatestYSchemaValidationRunOptions,
  QuickVerifyResult,
  VerifyResult,
  YSchemaValidationRun,
  YSchemaValidationRunStatus,
} from '@/infrastructure/projects';
export type {
  CreateRecipeInput,
  Recipe,
  RecipeStep,
  RecipeTrigger,
  UpdateRecipeInput,
} from '@/infrastructure/recipes';
export type { Relation, RelationType } from '@/infrastructure/relations';
export type { EngineRun } from '@/infrastructure/runner';
export type { CommitMeta, DiffResponse } from '@/infrastructure/treeDiff';
export type { TurnContextData } from '@/infrastructure/turns';
export type {
  Branch,
  Commit,
  Conversation,
  LLMProviderInfo,
  Project,
  Turn,
} from '@/infrastructure/types';
export type { NodeMember } from '@/types/knowledgeGraph';
