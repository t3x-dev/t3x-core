/**
 * t3x_extract — extract structured knowledge from raw text using server-side LLM.
 *
 * The calling agent passes text; T3X handles:
 *   1. Conversation + turn creation (persisting the raw input)
 *   2. LLM extraction via the shared v2 pipeline from @t3x-dev/core
 *   3. Applying the compiled YOps onto a snapshot
 *   4. Draft creation with the resulting trees
 *
 * This is a simplified version of the full API extraction pipeline
 * (packages/api/src/lib/extraction-v2.ts). It omits:
 *   - Drift detection (multi-topic management)
 *   - Session state / readiness gating
 *   - Ambiguity detection
 *   - YOps log persistence
 *   - Event bus usage-tracking telemetry (the extraction.done event
 *     is still emitted, best-effort)
 *
 * These features live in the API layer and depend on API-specific
 * infrastructure (yops_log table, provider registry singleton with DB
 * credential overlay, usage tracker, etc.).
 */

import {
  createDefaultProviderRegistry,
  extractAndApply,
  type LLMProvider,
} from '@t3x-dev/core';
import {
  findConversationById,
  findProjectById,
  findTurnsByConversation,
  insertConversation,
  insertDraft,
  insertTurn,
  recordEvent,
} from '@t3x-dev/storage';

import { getDB } from '../../db.js';
import { fail, ok, type ToolDef, type ToolHandler } from '../types.js';

// ── Tool definition ──

export const extractDef: ToolDef = {
  name: 't3x_extract',
  description: [
    'Extract structured knowledge from raw text using server-side LLM.',
    '',
    'Pass raw text (conversation transcript, notes, document content) and T3X will:',
    '  1. Create a conversation record with the text as turns',
    '  2. Run LLM-based semantic extraction (requires ANTHROPIC_API_KEY)',
    '  3. Compile the extraction into YOps and materialize the resulting trees',
    '  4. Create a draft containing the extracted knowledge tree',
    '',
    'Returns a draft_id that you can then:',
    '  - Inspect with t3x_query { "target": "draft", "id": "<draft_id>" }',
    '  - Edit with t3x_edit { "draft_id": "<draft_id>", "yops": "..." }',
    '  - Commit with t3x_commit { "project_id": "...", "draft_id": "...", "message": "..." }',
    '',
    'If conversation_id is provided, the text is appended as new turns to that',
    'conversation and extraction runs on all turns (bootstrap mode — MCP does',
    'not persist snapshots between calls).',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'Project ID to extract into.',
      },
      text: {
        type: 'string',
        description:
          'Raw text to extract knowledge from. Can be a conversation transcript, ' +
          'notes, document content, or any unstructured text.',
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
    required: ['project_id', 'text'],
  },
  annotations: {
    readOnlyHint: false,
    idempotentHint: false,
  },
};

// ── Helpers ──

const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';

/**
 * Build a default provider registry while preserving MCP's current Anthropic
 * model pin for extraction.
 */
function buildRegistry() {
  return createDefaultProviderRegistry({
    providerOverrides: {
      anthropic: {
        defaultModel: DEFAULT_ANTHROPIC_MODEL,
      },
    },
  });
}

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

// ── Handler ──

export const extractHandler: ToolHandler = async (args) => {
  const projectId = args.project_id as string | undefined;
  const text = args.text as string | undefined;
  const conversationId = args.conversation_id as string | undefined;
  const source = args.source as string | undefined;

  // ── Validate required params ──
  if (!projectId) {
    return fail('"project_id" is required.\nProvide the project ID to extract into.');
  }
  if (!text) {
    return fail('"text" is required.\nProvide the raw text to extract knowledge from.');
  }

  // ── Check LLM availability ──
  if (!process.env.ANTHROPIC_API_KEY) {
    return fail(
      'ANTHROPIC_API_KEY is not set.\n\n' +
        'Extraction requires a configured LLM provider. Set the ANTHROPIC_API_KEY ' +
        'environment variable to enable extraction.\n\n' +
        'Example: export ANTHROPIC_API_KEY=sk-ant-...'
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
  const registry = buildRegistry();
  const provider = registry.getById<LLMProvider>('anthropic');
  if (!provider) {
    return fail(
      'Anthropic provider is not configured.\n' +
        'Ensure ANTHROPIC_API_KEY is set in the environment.'
    );
  }
  const model = registry.getEntry('anthropic')?.defaultModel ?? DEFAULT_ANTHROPIC_MODEL;

  // ── Step 6: Run v2 extraction pipeline ──
  // MCP does not persist snapshots between calls, so we always run bootstrap
  // mode on the full turn history. For incremental semantics, use the API
  // /v1/extract routes which replay the yops_log to build a prior snapshot.
  const result = await extractAndApply({
    turns: allTurns.map((t) => ({
      turn_hash: t.turnHash,
      role: t.role,
      content: t.content,
    })),
    mode: 'bootstrap',
    providerId: 'anthropic',
    provider,
    model,
  });

  if (!result.ok) {
    return fail(`Extraction failed: ${result.failure.message}`);
  }

  if (result.snapshot.trees.length === 0) {
    return fail(
      'No extractable content found in the provided text.\n' +
        'The text may be too short, too vague, or not contain structured knowledge.'
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
