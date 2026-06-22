/**
 * t3x_edit — apply YOps to a draft through the 4-layer validation pipeline.
 *
 * Accepts a YAML string containing YOps operations, validates through all
 * 4 layers (parse, schema-reserved, engine dry-run, gates), and only persists
 * the result if every layer passes.
 *
 * Layer 1: Parse — YAML text -> YOp[]
 * Layer 2: Reserved for schema contract checks (currently skipped)
 * Layer 3: Engine — dry-run applyYOps in memory
 * Layer 4: Gates — structural quality checks (advisory warnings)
 */

import type { SemanticContent, TreeNode } from '@t3x-dev/core';
import { findDraftById, updateDraft } from '@t3x-dev/storage';

import { getApiClient, isApiBackend } from '../../backend.js';
import { getDB } from '../../db.js';
import { validateYOps } from '../../validate/pipeline.js';
import { fail, ok, type ToolDef, type ToolHandler } from '../types.js';

// ── Tool definition ──

export const editDef: ToolDef = {
  name: 't3x_edit',
  description: [
    'Apply YOps (YAML Operations) to a draft with full 4-layer validation.',
    '',
    'Pass a YAML string containing YOps; the tool validates through all layers:',
    '  Layer 1 (Parse): YAML syntax and YOps structure',
    '  Layer 2 (Schema contract): reserved; currently skipped',
    '  Layer 3 (Engine): Dry-run ops against current tree in memory',
    '  Layer 4 (Gates): Structural quality checks (duplicate keys, broken relations)',
    '',
    'If any layer fails, all collected errors are returned without persisting.',
    'If all layers pass, the updated tree is persisted to the draft.',
    '',
    '**18 operations in 4 categories:**',
    '  DDL (structure): define, drop, rename',
    '  DML (values): set, unset, populate, append',
    '  DTL (transform): move, clone, nest, split, fold, merge, sort, unique, pick, omit',
    '  DCL (constraint): assert',
    '  T3X (semantic relations): relate, unrelate',
    '',
    '**Path syntax:** slash-separated (e.g., `trip/budget`). Keys are snake_case.',
    '',
    '**YOps list format:**',
    '  yops:',
    '    - set:',
    '        path: trip/budget',
    '        value: 8000',
    '    - populate:',
    '        path: trip/hotel',
    '        values:',
    '          type: ryokan',
    '          area: Asakusa',
    '',
    '**Tree format (first extraction):**',
    '  trip:',
    '    budget: 5000',
    '    destination: Tokyo',
    '',
    'Use t3x_query { "target": "draft", "id": "<draft_id>" } to get the current revision.',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      draft_id: {
        type: 'string',
        description: 'Draft ID from a previous extract step.',
      },
      yops: {
        type: 'string',
        description: 'YAML string containing YOps operations to apply.',
      },
      if_revision: {
        type: 'number',
        description:
          'Current draft revision for optimistic locking. ' +
          'Get from t3x_query { "target": "draft", "id": "..." }.',
      },
    },
    required: ['draft_id', 'yops'],
  },
  annotations: {
    readOnlyHint: false,
    idempotentHint: false,
  },
};

// ── Helpers ──

/**
 * Convert draft nodes (as stored in DB) to SemanticContent for validation.
 * Draft nodes are TreeNode-shaped objects with key, slots, children.
 */
function draftNodesToContent(
  nodes: Array<{
    key?: string;
    id?: string;
    slots?: Record<string, unknown>;
    text?: string;
    children?: unknown[];
  }>
): SemanticContent {
  const trees: TreeNode[] = nodes.map((node) => ({
    key: node.key || node.id || 'unknown',
    slots: (node.slots || (node.text ? { text: node.text } : {})) as TreeNode['slots'],
    children: (node.children ?? []) as TreeNode[],
  }));
  return { trees, relations: [] };
}

/**
 * Summarize a tree for the response (key + slot count + child count).
 */
function summarizeTrees(
  trees: TreeNode[]
): Array<{ key: string; slots: number; children: number }> {
  return trees.map((t) => ({
    key: t.key,
    slots: Object.keys(t.slots).length,
    children: t.children.length,
  }));
}

// ── Handler ──

export const editHandler: ToolHandler = async (args) => {
  const draftId = args.draft_id as string | undefined;
  const yopsYaml = args.yops as string | undefined;
  const ifRevision = args.if_revision as number | undefined;

  if (!draftId) {
    return fail('"draft_id" is required.\nProvide the draft ID from a previous extract step.');
  }
  if (!yopsYaml) {
    return fail('"yops" is required.\nProvide a YAML string containing YOps operations.');
  }

  if (isApiBackend()) {
    const client = getApiClient();
    const draft = (await client.getDraft(draftId)) as Record<string, unknown>;
    const status = draft.status as string | undefined;

    if (status !== 'editing') {
      return fail(
        `Draft status is "${status}", must be "editing".\n` +
          (status === 'committed'
            ? `This draft was already committed as ${String(draft.committed_as ?? '')}.`
            : 'Only drafts in "editing" status can be edited.')
      );
    }

    const revision = ifRevision ?? Number(draft.revision ?? 0);
    const draftNodes = (draft.nodes ?? []) as Array<{
      key?: string;
      id?: string;
      slots?: Record<string, unknown>;
      text?: string;
      children?: unknown[];
    }>;
    const currentContent = draftNodesToContent(draftNodes);
    const validation = await validateYOps(yopsYaml, currentContent);

    if (!validation.ok) {
      return fail(
        JSON.stringify(
          {
            applied: false,
            errors: validation.errors,
            auto_fixes: validation.auto_fixes,
            warnings: validation.warnings,
            fix_hint:
              'Fix the errors above and retry. Use t3x_query { "target": "draft", "id": "..." } to see current tree state.',
          },
          null,
          2
        )
      );
    }

    const result = await client.applyYOps(draftId, validation.parsed_yops ?? [], revision);
    return ok({
      applied: true,
      applied_count: result.applied_count,
      revision: result.revision,
      trees: result.trees,
      tree_count: result.tree_count,
      slot_count: result.slot_count,
      auto_fixes: validation.auto_fixes,
      warnings: validation.warnings,
      next_steps: [
        'Use t3x_query { "target": "draft", "id": "..." } to review the updated tree.',
        'Apply more edits with t3x_edit, or commit with t3x_commit.',
      ],
    });
  }

  const db = await getDB();

  // Step 1: Fetch draft
  const draft = await findDraftById(db, draftId);
  if (!draft) {
    return fail(`Draft not found: ${draftId}`);
  }

  if (draft.status !== 'editing') {
    return fail(
      `Draft status is "${draft.status}", must be "editing".\n` +
        (draft.status === 'committed'
          ? `This draft was already committed as ${draft.committed_as}.`
          : 'Only drafts in "editing" status can be edited.')
    );
  }

  // Use provided revision or fall back to the draft's current revision
  const revision = ifRevision ?? draft.revision;

  // Step 2: Build current content from draft nodes
  const draftNodes = (draft.nodes ?? []) as Array<{
    key?: string;
    id?: string;
    slots?: Record<string, unknown>;
    text?: string;
    children?: unknown[];
  }>;
  const currentContent = draftNodesToContent(draftNodes);

  // Step 3: Validate through 4-layer pipeline
  const validation = await validateYOps(yopsYaml, currentContent);

  if (!validation.ok) {
    return fail(
      JSON.stringify(
        {
          applied: false,
          errors: validation.errors,
          auto_fixes: validation.auto_fixes,
          warnings: validation.warnings,
          fix_hint:
            'Fix the errors above and retry. Use t3x_query { "target": "draft", "id": "..." } to see current tree state.',
        },
        null,
        2
      )
    );
  }

  // Step 4: Validation passed — persist the result
  const resultDoc = validation.result_doc as SemanticContent;
  const newNodes = resultDoc.trees.map((tree) => ({
    key: tree.key,
    slots: tree.slots,
    children: tree.children,
  }));

  const updated = await updateDraft(db, draftId, { nodes: newNodes }, revision);

  return ok({
    applied: true,
    applied_count: validation.parsed_yops?.length ?? 0,
    revision: updated.revision,
    tree_summary: summarizeTrees(resultDoc.trees),
    auto_fixes: validation.auto_fixes,
    warnings: validation.warnings,
    next_steps: [
      'Use t3x_query { "target": "draft", "id": "..." } to review the updated tree.',
      'Apply more edits with t3x_edit, or commit with t3x_commit.',
    ],
  });
};
