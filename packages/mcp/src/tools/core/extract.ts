/**
 * t3x_extract — create a server-owned Workspace v2 extraction proposal.
 *
 * The preferred API path selects immutable Source turns and a Repository
 * Workspace. The legacy raw-text Draft path remains below for compatibility;
 * its direct-storage implementation omits:
 *   - Drift detection (multi-topic management)
 *   - Session state / readiness gating
 *   - Ambiguity detection
 *   - YOps log persistence
 *   - Event bus usage-tracking telemetry (the extraction.done event
 *     is still emitted, best-effort)
 *
 * Those features live in the API layer and depend on API-specific infrastructure.
 */

import { extractAndApply, type PromptTurnInput } from '@t3x-dev/core';
import {
  findConversationById,
  findProjectById,
  findTurnsByConversation,
  insertConversation,
  insertDraft,
  insertTurn,
  recordEvent,
} from '@t3x-dev/storage';

import { getApiClient, isApiBackend } from '../../backend.js';
import { getDB } from '../../db.js';
import { resolveGenerationTarget } from '../../provider-runtime.js';
import { fail, ok, type ToolDef, type ToolHandler } from '../types.js';

// ── Tool definition ──

export const extractDef: ToolDef = {
  name: 't3x_extract',
  description: [
    'Create a v2 extraction proposal from immutable Source turns in a Repository Workspace.',
    '',
    'Preferred authenticated API flow:',
    '  1. Select an existing Workspace and Source Thread',
    '  2. Pass exact immutable turn hashes',
    '  3. T3X re-resolves Source and target-ref baseline server-side',
    '  4. T3X persists canonical SourcedYOps in the Workspace proposal',
    '',
    'Use workspace_id + source_thread_id + turn_hashes for this flow.',
    'Inspect the result with t3x_query target="workspace".',
    '',
    'Raw text remains a compatibility mode for the legacy Draft workflow.',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'Project ID to extract into.',
      },
      workspace_id: {
        type: 'string',
        description: 'Repository Workspace ID for the preferred proposal flow.',
      },
      source_thread_id: {
        type: 'string',
        description: 'Existing Source Thread ID selected inside the project.',
      },
      turn_hashes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Exact immutable Source turn hashes to extract.',
      },
      if_revision: {
        type: 'number',
        description: 'Expected Workspace revision for optimistic concurrency.',
      },
      provider: {
        type: 'string',
        description: 'Optional configured provider override.',
      },
      model: {
        type: 'string',
        description: 'Optional model override compatible with the provider.',
      },
      text: {
        type: 'string',
        description: 'Compatibility mode only: raw text for the legacy Draft extraction workflow.',
      },
      conversation_id: {
        type: 'string',
        description:
          'Optional. Existing conversation ID to append to. If omitted, a new ' +
          'conversation is created.',
      },
      source: {
        type: 'string',
        description:
          'Optional label describing the source of the text (e.g., "meeting notes", "slack thread").',
      },
    },
    required: ['project_id'],
  },
  annotations: {
    readOnlyHint: false,
    idempotentHint: false,
  },
};

// ── Helpers ──

/**
 * Split raw text into turns for extraction.
 * Attempts to detect user/assistant patterns; falls back to a single user turn.
 */
function textToTurns(text: string): Array<{ role: 'user' | 'assistant'; content: string }> {
  const lines = text.split('\n');
  const turns: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  let currentRole: 'user' | 'assistant' = 'user';
  let currentContent: string[] = [];

  for (const line of lines) {
    const userMatch = line.match(/^(?:User|Human|Me|Q):\s*(.*)/i);
    const assistantMatch = line.match(/^(?:Assistant|AI|Bot|A|Claude):\s*(.*)/i);

    if (userMatch) {
      if (currentContent.length > 0) {
        turns.push({ role: currentRole, content: currentContent.join('\n').trim() });
        currentContent = [];
      }
      currentRole = 'user';
      if (userMatch[1]) currentContent.push(userMatch[1]);
    } else if (assistantMatch) {
      if (currentContent.length > 0) {
        turns.push({ role: currentRole, content: currentContent.join('\n').trim() });
        currentContent = [];
      }
      currentRole = 'assistant';
      if (assistantMatch[1]) currentContent.push(assistantMatch[1]);
    } else {
      currentContent.push(line);
    }
  }

  if (currentContent.length > 0) {
    const remaining = currentContent.join('\n').trim();
    if (remaining) {
      turns.push({ role: currentRole, content: remaining });
    }
  }

  if (turns.length === 0) {
    return [{ role: 'user', content: text.trim() }];
  }

  return turns;
}

function isPromptTurnRole(role: string): role is PromptTurnInput['role'] {
  return role === 'user' || role === 'assistant' || role === 'system' || role === 'tool';
}

// ── Handler ──

export const extractHandler: ToolHandler = async (args) => {
  const projectId = args.project_id as string | undefined;
  const text = args.text as string | undefined;
  const conversationId = args.conversation_id as string | undefined;
  const source = args.source as string | undefined;
  const workspaceId = args.workspace_id as string | undefined;
  const sourceThreadId = args.source_thread_id as string | undefined;
  const turnHashes = args.turn_hashes as string[] | undefined;
  const ifRevision = args.if_revision as number | undefined;
  const provider = args.provider as string | undefined;
  const model = args.model as string | undefined;

  // ── Validate required params ──
  if (!projectId) {
    return fail('"project_id" is required.\nProvide the project ID to extract into.');
  }
  const workspaceMode =
    workspaceId !== undefined || sourceThreadId !== undefined || turnHashes !== undefined;

  if (workspaceMode) {
    if (!workspaceId || !sourceThreadId || !Array.isArray(turnHashes) || turnHashes.length === 0) {
      return fail(
        'Workspace extraction requires "workspace_id", "source_thread_id", and at least one "turn_hashes" entry.'
      );
    }
    if (!isApiBackend()) {
      return fail(
        'Workspace extraction requires T3X_MCP_BACKEND=api so Source resolution, authorization, and Workspace concurrency stay server-owned.'
      );
    }
    const client = getApiClient();
    return ok(
      await client.workspaces.createExtractionProposal(projectId, workspaceId, {
        source: { type: 'conversation', id: sourceThreadId, turn_hashes: turnHashes },
        ...(ifRevision === undefined ? {} : { if_revision: ifRevision }),
        ...(provider === undefined ? {} : { provider }),
        ...(model === undefined ? {} : { model }),
      })
    );
  }

  if (!text) {
    return fail(
      '"text" is required for compatibility extraction. Alternatively provide "workspace_id" + "source_thread_id" + "turn_hashes".'
    );
  }

  if (isApiBackend()) {
    const client = getApiClient();
    return ok(
      await client.extract({
        project_id: projectId,
        text,
        conversation_id: conversationId,
        source,
      })
    );
  }

  const db = await getDB();

  // ── Step 1: Validate project ──
  const project = await findProjectById(db, projectId);
  if (!project) {
    return fail(`Project not found: ${projectId}`);
  }

  // ── Step 2: Create or find conversation ──
  let convId = conversationId;
  let isNewConversation = false;

  if (convId) {
    const existing = await findConversationById(db, convId);
    if (!existing) {
      return fail(`Conversation not found: ${convId}`);
    }
    if (existing.projectId !== projectId) {
      return fail(`Conversation ${convId} does not belong to project ${projectId}.`);
    }
  } else {
    const title = source ? `Extract: ${source}` : 'MCP Extraction';
    const conversation = await insertConversation(db, {
      projectId,
      title,
    });
    convId = conversation.conversationId;
    isNewConversation = true;
  }

  // ── Step 3: Insert turns from raw text ──
  const parsedTurns = textToTurns(text);
  for (const turn of parsedTurns) {
    await insertTurn(db, {
      projectId,
      conversationId: convId,
      role: turn.role,
      content: turn.content,
    });
  }

  // ── Step 4: Fetch all turns for extraction ──
  const allTurns = await findTurnsByConversation(db, {
    conversationId: convId,
    limit: 500,
  });

  // ── Step 5: Resolve provider + model ──
  const resolvedTarget = await resolveGenerationTarget({
    db,
    projectId,
    conversationId,
  });
  if (!resolvedTarget.ok) {
    return fail(`Extraction failed: ${resolvedTarget.message}`);
  }

  // ── Step 6: Run v2 extraction pipeline ──
  // MCP does not persist snapshots between calls, so we always run bootstrap
  // mode on the full turn history. For incremental semantics, use the API
  // /v1/extract routes which replay the yops_log to build a prior snapshot.
  const result = await extractAndApply({
    turns: allTurns.map((t) => ({
      turn_hash: t.turnHash,
      role: isPromptTurnRole(t.role) ? t.role : 'user',
      content: t.content,
    })),
    mode: 'bootstrap',
    providerId: resolvedTarget.providerId,
    provider: resolvedTarget.provider,
    model: resolvedTarget.model,
  });

  if (!result.ok) {
    return fail(`Extraction failed: ${result.failure.message}`);
  }

  if (result.snapshot.trees.length === 0) {
    return fail(
      'No extractable content found in the provided text.\n' +
        'The text may be too short, too vague, or not contain structured state.'
    );
  }

  // ── Step 8: Create draft with extracted trees ──
  const draftNodes = result.snapshot.trees.map((tree) => ({
    key: tree.key,
    slots: tree.slots,
    children: tree.children,
  }));

  const draft = await insertDraft(db, {
    project_id: projectId,
    title: source ? `Extract: ${source}` : 'MCP Extraction',
  });

  const { updateDraft } = await import('@t3x-dev/storage');
  await updateDraft(db, draft.id, { nodes: draftNodes }, draft.revision);

  // ── Step 9: Emit extraction.done event for WebUI realtime sync ──
  // Unlike simple CRUD events (which DB triggers handle), extraction.done
  // carries semantic payload the trigger cannot synthesize. MCP runs
  // out-of-process — wrap in try/catch so a transient events-table failure
  // does not fail the user's extraction.
  try {
    await recordEvent(db, {
      type: 'extraction.done',
      projectId,
      conversationId: convId,
      payload: {
        draft_id: draft.id,
        node_count: draftNodes.length,
        yops_count: result.compiled.ops.length,
        source: 'mcp',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[mcp:extract] failed to record extraction.done event: ${message}\n`);
  }

  // ── Build summary ──
  const treeSummary = result.snapshot.trees.map((t) => ({
    key: t.key,
    slots: Object.keys(t.slots).length,
    children: t.children.length,
  }));

  return ok({
    draft_id: draft.id,
    conversation_id: convId,
    is_new_conversation: isNewConversation,
    turns_count: allTurns.length,
    tree_summary: treeSummary,
    yops_count: result.compiled.ops.length,
    next_steps: [
      `Use t3x_query { "target": "draft", "id": "${draft.id}" } to inspect the extracted tree.`,
      `Use t3x_edit { "draft_id": "${draft.id}", "yops": "..." } to refine the extraction.`,
      `Use t3x_commit { "project_id": "${projectId}", "draft_id": "${draft.id}", "message": "..." } to commit.`,
    ],
  });
};
