/**
 * createMcpServer — factory that builds a configured MCP server
 * with tools filtered by the requested toolset(s).
 *
 * Core toolset:
 *   t3x_query, t3x_commit, t3x_edit, t3x_extract, t3x_generate,
 *   t3x_resolve_repository, t3x_committed_state, t3x_open_workspace
 *
 * Advanced toolset (3 additional tools):
 *   t3x_diff, t3x_merge, t3x_admin
 *
 * Transition toolset (opt-in, API-only):
 *   propose_transition, inspect_transition, verify_transition, attach_statement,
 *   decide_transition, commit_transition, t3x_draft_review, t3x_commit_result
 */

import { createRequire } from 'node:module';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { T3xApiError } from '@t3x-dev/api-client';
import { getApiClient, isApiBackend } from './backend.js';
import {
  getBusinessExposure,
  isSafeBusinessIdentifier,
  isSafeWorkspaceIdentifier,
  type McpCapability,
} from './business-capabilities.js';
import { type McpDiagnostic, trackToolCall } from './diagnostics.js';
import { getPrompt, PROMPT_DEFS } from './prompts/index.js';
import { RESOURCE_TEMPLATES, readResource } from './resources/index.js';
// Advanced tools
import { adminDef, adminHandler } from './tools/advanced/admin.js';
import { diffDef, diffHandler } from './tools/advanced/diff.js';
import { mergeDef, mergeHandler } from './tools/advanced/merge.js';
import { commitResultDef, commitResultHandler } from './tools/commit-result.js';
import { commitValidationDef, commitValidationHandler } from './tools/commit-validation.js';
import { committedStateDef, committedStateHandler } from './tools/committed-state.js';
import { contextDef, contextHandler } from './tools/context.js';
// Core tools
import { commitDef, commitHandler } from './tools/core/commit.js';
import { editDef, editHandler } from './tools/core/edit.js';
import { extractDef, extractHandler } from './tools/core/extract.js';
import { generateDef, generateHandler } from './tools/core/generate.js';
import { queryDef, queryHandler } from './tools/core/query.js';
import { draftReviewDef, draftReviewHandler } from './tools/draft-review.js';
import { openWorkspaceDef, openWorkspaceHandler } from './tools/open-workspace.js';
import { proposalGenerationDef, proposalGenerationHandler } from './tools/proposal-generation.js';
import { repositoryLocationDef, repositoryLocationHandler } from './tools/repository-location.js';
import {
  repositoryRunsDef,
  repositoryRunsHandler,
  triggerRepositoryRunDef,
  triggerRepositoryRunHandler,
} from './tools/repository-runs.js';
import {
  schemaCandidateDef,
  schemaCandidateHandler,
  schemaPreparationDef,
  schemaPreparationHandler,
} from './tools/schema-authoring.js';
import { schemaRegistryDef, schemaRegistryHandler } from './tools/schema-registry.js';
import { sourceArtifactDef, sourceArtifactHandler } from './tools/source-artifact.js';
import { sourceContextDef, sourceContextHandler } from './tools/source-context.js';
import { sourceIngestionDef, sourceIngestionHandler } from './tools/source-ingestion.js';
import { TRANSITION_TOOLS } from './tools/transition/index.js';
import {
  apiToolError,
  fail,
  type ToolDef,
  type ToolHandler,
  type ToolResult,
  toolError,
} from './tools/types.js';
import { workspaceCandidateDef, workspaceCandidateHandler } from './tools/workspace-candidate.js';
import {
  workspaceValidationDef,
  workspaceValidationHandler,
} from './tools/workspace-validation.js';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as { version?: string };

import { restoreContentDef, restoreContentHandler } from './tools/restore-content.js';
import {
  readPresentationDef,
  readPresentationHandler,
  revisePresentationDef,
  revisePresentationHandler,
} from './tools/state-presentation.js';
import { workspaceDeliveryDef, workspaceDeliveryHandler } from './tools/workspace-delivery.js';

// ── Toolset registry ──

interface ToolEntry {
  def: ToolDef;
  handler: ToolHandler;
}

const CORE_TOOLS: ToolEntry[] = [
  { def: queryDef, handler: queryHandler },
  { def: commitDef, handler: commitHandler },
  { def: editDef, handler: editHandler },
  { def: extractDef, handler: extractHandler },
  { def: generateDef, handler: generateHandler },
  { def: repositoryLocationDef, handler: repositoryLocationHandler },
  { def: committedStateDef, handler: committedStateHandler },
  { def: openWorkspaceDef, handler: openWorkspaceHandler },
];

const ADVANCED_TOOLS: ToolEntry[] = [
  { def: diffDef, handler: diffHandler },
  { def: mergeDef, handler: mergeHandler },
  { def: adminDef, handler: adminHandler },
];

const BUSINESS_TOOLS: ToolEntry[] = [
  { def: commitValidationDef, handler: commitValidationHandler },
  { def: contextDef, handler: contextHandler },
  { def: proposalGenerationDef, handler: proposalGenerationHandler },
  { def: triggerRepositoryRunDef, handler: triggerRepositoryRunHandler },
  { def: repositoryRunsDef, handler: repositoryRunsHandler },
  { def: schemaCandidateDef, handler: schemaCandidateHandler },
  { def: schemaPreparationDef, handler: schemaPreparationHandler },
  { def: schemaRegistryDef, handler: schemaRegistryHandler },
  { def: sourceArtifactDef, handler: sourceArtifactHandler },
  { def: sourceContextDef, handler: sourceContextHandler },
  { def: sourceIngestionDef, handler: sourceIngestionHandler },
  { def: workspaceCandidateDef, handler: workspaceCandidateHandler },
  { def: readPresentationDef, handler: readPresentationHandler },
  { def: revisePresentationDef, handler: revisePresentationHandler },
  { def: restoreContentDef, handler: restoreContentHandler },
  { def: workspaceDeliveryDef, handler: workspaceDeliveryHandler },
  { def: workspaceValidationDef, handler: workspaceValidationHandler },
];

export type McpToolset = 'core' | 'advanced' | 'transition';

const TOOLSET_MAP: Record<McpToolset, readonly ToolEntry[]> = {
  core: CORE_TOOLS,
  advanced: ADVANCED_TOOLS,
  transition: [
    ...TRANSITION_TOOLS,
    { def: draftReviewDef, handler: draftReviewHandler },
    { def: commitResultDef, handler: commitResultHandler },
  ],
};

// ── Server instructions ──

const SERVER_INSTRUCTIONS = `T3X is version control for structured state — like Git, but for
schema-backed YAML changed through deterministic YOps.

Repository Workspace workflow (API backend):
- t3x_resolve_repository — resolve a repository address and explicit branch head
- t3x_committed_state — read or export the value, or inspect the Schema binding, at an exact Commit
- t3x_open_workspace — open a private Workspace for an explicit branch and expected head
1. t3x_query source_evidence — select immutable Source turn hashes
2. t3x_extract — create a v2 SourcedYOps proposal in an existing Workspace
3. t3x_query workspace — inspect the persisted proposal

Source reads:
- query source_thread or source_threads for durable source metadata
- query source_evidence with project_id and source-thread id for repository evidence
- conversation and conversations remain compatibility aliases

Additional capabilities (if advanced toolset enabled):
4. t3x_diff — compare two commits
5. t3x_merge — branch and merge structured state
6. t3x_admin — manage projects, branches, pins

Transition lifecycle (only if the opt-in transition toolset and API backend are enabled):
- t3x_draft_review — prepare Review from the complete saved Draft or read a fixed snapshot by ID
7. propose_transition — prepare a replayable change without deciding or committing; pass the extraction_candidate_id returned by t3x_extract to load canonical Workspace SourcedYOps on the server
8. inspect_transition — inspect task state, assurance, and immutable preconditions
9. verify_transition — run mandatory Replay plus configured external checks
10. attach_statement — attach an allowlisted claim through authenticated API authority
11. decide_transition — record an accepted, rejected, or overridden Decision from the latest review precondition
12. commit_transition — create CommitV2 and advance the ref by exact expected-head CAS
- t3x_commit_result — read back the fixed Commit and current ref and authorized Workspace

t3x_generate creates validated outputs from committed state.`;

// ── Factory ──

export interface McpServerOptions {
  toolsets: McpToolset[];
  capabilities?: readonly McpCapability[];
  onDiagnostic?: (event: McpDiagnostic) => void;
}

export function createMcpServer(options: McpServerOptions) {
  const exposure =
    options.capabilities === undefined ? undefined : getBusinessExposure(options.capabilities);
  if (exposure && !isApiBackend()) {
    throw new Error('T3X_MCP_CAPABILITIES requires T3X_MCP_BACKEND=api.');
  }
  const authenticatedApi = async () => {
    if (!isApiBackend()) throw new Error('T3X_MCP_CAPABILITIES requires T3X_MCP_BACKEND=api.');
    await getApiClient().getCredentialContext();
  };

  // 1. Collect active tools based on requested toolsets
  const activeEntries: ToolEntry[] = [];
  const seen = new Set<string>();

  for (const toolset of exposure ? (Object.keys(TOOLSET_MAP) as McpToolset[]) : options.toolsets) {
    const entries = TOOLSET_MAP[toolset];
    if (!entries) continue;
    for (const entry of entries) {
      if (!seen.has(entry.def.name)) {
        seen.add(entry.def.name);
        const def = exposure ? exposure.definition(entry.def) : entry.def;
        if (def) activeEntries.push({ def, handler: entry.handler });
      }
    }
  }

  if (exposure) {
    for (const entry of BUSINESS_TOOLS) {
      const def = exposure.definition(entry.def);
      if (def) activeEntries.push({ def, handler: entry.handler });
    }
  }

  // 2. Build tool definitions array and handlers map
  const tools: ToolDef[] = activeEntries.map((e) => e.def);
  const entries = new Map(activeEntries.map((entry) => [entry.def.name, entry]));

  // 3. Create the MCP server
  const server = new Server(
    { name: 't3x-mcp', version: packageJson.version ?? '0.0.0' },
    {
      capabilities: { tools: {}, resources: {}, prompts: {} },
      instructions: exposure
        ? 'Use the advertised T3X tools and their enabled actions. The API authorizes each request.'
        : SERVER_INSTRUCTIONS,
    }
  );

  // 4. Register ListTools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  // 5. Register resources handlers
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [],
  }));

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: RESOURCE_TEMPLATES.filter(
      (template) =>
        !exposure ||
        exposure.resources.has(
          template.name === 'conversation_compatibility' ? 'source_thread' : template.name
        )
    ),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) =>
    readResource(
      request.params.uri,
      exposure &&
        (async ({ kind, id, projectId }) => {
          if (
            !exposure.resources.has(kind) ||
            !(kind === 'workspace'
              ? isSafeWorkspaceIdentifier(id)
              : isSafeBusinessIdentifier(id)) ||
            (projectId !== undefined && !isSafeBusinessIdentifier(projectId))
          ) {
            throw new Error('Resource is unavailable in T3X_MCP_CAPABILITIES.');
          }
          await authenticatedApi();
        })
    )
  );

  // 6. Register prompts handlers
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: exposure ? [] : [...PROMPT_DEFS],
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    if (exposure)
      throw new Error('Legacy workflow prompts are unavailable in T3X_MCP_CAPABILITIES.');
    return getPrompt(request.params.name, request.params.arguments ?? {});
  });

  // 7. Register CallTool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const entry = entries.get(name);

    if (!entry) {
      throw new McpError(ErrorCode.InvalidParams, 'Unknown tool.');
    }

    const input = args ?? {};
    const execute = async (): Promise<ToolResult> => {
      try {
        if (exposure) {
          if (!exposure.allows(name, input)) {
            return {
              ...toolError('ACTION_UNAVAILABLE', 'Action is unavailable in T3X_MCP_CAPABILITIES.'),
            };
          }
          const identifiers = [
            'id',
            'project_id',
            'workspace_id',
            'pin_id',
            'transition_id',
            'source_thread_id',
            'snapshot_id',
          ];
          if (
            identifiers.some((key) => {
              if (!Object.hasOwn(input, key)) return false;
              const workspace =
                key === 'workspace_id' ||
                (key === 'id' &&
                  name === 't3x_query' &&
                  (input.target === 'workspace' || input.target === 'workspace_activity'));
              return !(workspace ? isSafeWorkspaceIdentifier : isSafeBusinessIdentifier)(
                input[key]
              );
            })
          ) {
            return {
              ...toolError('INVALID_ARGUMENT', 'Invalid identifier in business tool arguments.'),
            };
          }
          if (name !== contextDef.name) await authenticatedApi();
        }
        const result = await entry.handler(
          input,
          exposure && {
            skipMainBranchInitialization: true,
          }
        );
        if (exposure && result.isError && !result.content[0]?.text.startsWith('{')) {
          return {
            ...toolError(
              'TOOL_ERROR',
              result.content[0]?.text ?? 'The tool could not complete the operation.'
            ),
          };
        }
        return { ...result };
      } catch (error: unknown) {
        if (error instanceof T3xApiError) return { ...apiToolError(error) };
        return exposure
          ? { ...toolError('INTERNAL_ERROR', 'The tool could not complete the operation.') }
          : { ...fail(`Error: ${formatErrorMessage(error)}`) };
      }
    };
    return {
      ...(options.onDiagnostic
        ? await trackToolCall(entry.def, input, options.onDiagnostic, execute)
        : await execute()),
    };
  });

  return { server, tools };
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof AggregateError) {
    const nested = error.errors.map((entry) => formatErrorMessage(entry)).filter(Boolean);
    if (nested.length > 0) {
      return nested.join('; ');
    }
    return error.message || error.name || 'AggregateError';
  }

  if (error instanceof Error) {
    return error.message || error.name || 'Unknown error';
  }

  const text = String(error);
  if (!text || text === 'undefined') {
    return 'Unknown error';
  }
  return text;
}
