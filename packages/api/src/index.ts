/**
 * @t3x-dev/api — Barrel export
 *
 * Re-exports the createApp factory and all public types/utilities
 * so consumers (apps/api thin launcher, t3x_cloud) can import from '@t3x-dev/api'.
 */

import type { CollaborationLifecycleUnitOfWork } from '@t3x-dev/application';
import type { PostgresCollaborationLifecycleUnitOfWork } from '@t3x-dev/storage';

type AssertCollaborationPortCompatibility<T extends CollaborationLifecycleUnitOfWork> = T;
type _PostgresCollaborationPortCompatibility =
  AssertCollaborationPortCompatibility<PostgresCollaborationLifecycleUnitOfWork>;

export {
  type AccountOperation,
  AccountOperationSchema,
  type AuthOperation,
  AuthOperationSchema,
  DEPLOYMENT_CAPABILITIES_VERSION,
  type DeploymentCapabilities,
  DeploymentCapabilitiesSchema,
  SELF_HOSTED_DEPLOYMENT_CAPABILITIES,
  UNAVAILABLE_DEPLOYMENT_CAPABILITIES,
} from '@t3x-dev/api-client';
// Standalone runtime database maintenance.
export { cleanupExpiredRateLimitBuckets, cleanupOldEvents } from '@t3x-dev/storage';
export type { CreateAppOptions } from './app';
export { createApp } from './app';
export {
  COLLABORATION_INVITATION_TOKEN_PREFIX,
  COLLABORATION_INVITATION_TOKEN_SECRET_BYTES,
  type CollaborationInvitationToken,
  type CollaborationInvitationTokenHash,
  hashCollaborationInvitationToken,
  type IssuedCollaborationInvitationToken,
  isCollaborationInvitationToken,
  issueCollaborationInvitationToken,
  verifyCollaborationInvitationToken,
} from './lib/collaboration-invitation-token';
export { buildCommittedCompositionOverview } from './lib/committed-composition-overview';
// Database
export { closeDB, getDB, getRuntimePostgresClient } from './lib/db';
export {
  createDeploymentCapabilitiesMiddleware,
  type DeploymentCapabilitiesSource,
  getDeploymentCapabilities,
  parseDeploymentCapabilities,
} from './lib/deployment-capabilities';
// Error utilities
export { createError, errorResponse, zodErrorHook } from './lib/errors';
export {
  allowAllInferenceAdmissionPolicy,
  createInferenceRuntime,
  createInferenceRuntimeMiddleware,
  directInferenceGateway,
  executeMeteredInference,
  getInferenceRuntime,
  INFERENCE_CONTRACT_VERSION,
  type InferenceActor,
  type InferenceAdmission,
  type InferenceAdmissionDecision,
  InferenceAdmissionDeniedError,
  type InferenceAdmissionPolicy,
  type InferenceAttempt,
  type InferenceExecution,
  InferenceExecutionError,
  type InferenceExecutionInput,
  type InferenceExecutionResult,
  type InferenceFinishStatus,
  type InferenceGateway,
  type InferenceGatewayStream,
  type InferenceIngressChannel,
  type InferenceProviderCost,
  type InferenceReceipt,
  type InferenceRuntime,
  type InferenceRuntimeOptions,
  type InferenceScope,
  type InferenceStream,
  type InferenceTerminal,
  type InferenceUsage,
  type MeteredInferenceCall,
  type MeteredInferenceResult,
  resolveInferenceActor,
  resolveInferenceIngressChannel,
  resolveInferenceRunId,
  toGenerationModelScope,
} from './lib/inference';
export {
  createGenerationModelCatalogSnapshot,
  GENERATION_MODEL_CATALOG_SCHEMA,
  GENERATION_MODEL_INGRESS_CHANNELS,
  GENERATION_MODEL_SPECIFICATION_VERSION,
  GENERATION_PROVIDER_RUNTIME_VERSION,
  type GenerationModel,
  type GenerationModelActor,
  type GenerationModelCapability,
  type GenerationModelCatalog,
  type GenerationModelCatalogSnapshot,
  type GenerationModelContentPart,
  type GenerationModelDescriptor,
  GenerationModelError,
  type GenerationModelEvidence,
  type GenerationModelFailureOutcome,
  type GenerationModelFinishReason,
  type GenerationModelIngressChannel,
  type GenerationModelInvocation,
  type GenerationModelMessage,
  type GenerationModelOutputFormat,
  type GenerationModelOutputPart,
  type GenerationModelProjectVisibility,
  type GenerationModelRequest,
  type GenerationModelResult,
  type GenerationModelScope,
  type GenerationModelStream,
  type GenerationModelStreamPart,
  type GenerationModelStreamTerminal,
  type GenerationModelTool,
  type GenerationModelUsage,
  type GenerationProviderResolution,
  type GenerationProviderResolutionInput,
  type GenerationProviderRuntime,
} from './lib/model-runtime-contract';
export {
  allowAllProjectLifecyclePolicy,
  getProjectLifecyclePolicy,
  PROJECT_LIFECYCLE_POLICY_VERSION,
  type ProjectLifecycleAdmission,
  type ProjectLifecycleOperation,
  type ProjectLifecyclePolicy,
  ProjectLifecyclePolicyDeniedError,
  type ProjectLifecyclePolicyInput,
  resolveProjectLifecycleActor,
} from './lib/project-lifecycle-policy';
export {
  allowAllProjectVisibilityPolicy,
  PROJECT_VISIBILITY_POLICY_VERSION,
  type ProjectVisibilityMutation,
  type ProjectVisibilityPolicy,
  ProjectVisibilityPolicyDeniedError,
  type ProjectVisibilityPolicyInput,
} from './lib/project-visibility-policy';
export {
  createGenerationProviderRuntimeMiddleware,
  defaultGenerationProviderRuntime,
  getGenerationProviderRuntime,
} from './lib/provider-runtime';
// Background tasks
export {
  defaultFetchEventById,
  startRealtimeListener,
  stopRealtimeListener,
} from './lib/realtime-listener';
export { startTimeoutChecker, stopTimeoutChecker } from './lib/timeout-checker';
export type {
  TransitionControlPlaneOptions,
  TransitionExternalProviderResult,
  TransitionExternalStatementProvider,
  TransitionNativeProviderResult,
  TransitionNativeStatementProvider,
} from './lib/transition-control-plane';
export type {
  WorkspaceSourceRunnerCapability,
  WorkspaceSourceSecretResolver,
  WorkspaceSourceTransitionCapabilities,
} from './lib/workspace-source-transition';
export {
  createWorkspaceSourceRunnerProvider,
  WORKSPACE_SOURCE_RUNNER_PROVIDER_SOURCE,
} from './lib/workspace-source-transition';
export type { BearerTokenPrincipal, BearerTokenVerifier } from './middleware/auth';
// Logger
export { pinoLogger } from './middleware/logger';
export {
  applyRateLimitHeaders,
  consumeRateLimit,
  createDatabaseRateLimitStore,
  createRateLimitL1,
  createRateLimitL2,
  databaseRateLimitStore,
  getClientIp,
  getRequestRateLimitStore,
  hashRateLimitIdentity,
  RATE_LIMIT_POLICIES,
  type RateLimitPolicy,
  type RateLimitStore,
  resolveIpRateLimitPolicy,
} from './middleware/rate-limit';
// Common OpenAPI schemas
export { ErrorResponseSchema, SuccessResponseSchema } from './schemas/common';
// Type definitions
export type { AppEnv } from './types';
