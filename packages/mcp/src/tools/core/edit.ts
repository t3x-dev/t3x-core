import type { TransitionProtocolValue } from '@t3x-dev/api-client';
/** t3x_edit — compatibility name for a structured_yops Transition proposal. */

import { proposeTransitionHandler, withTransitionApi } from '../transition/index.js';
import { fail, type ToolDef, type ToolHandler } from '../types.js';

export const editDef: ToolDef = {
  name: 't3x_edit',
  description: [
    'Propose structured YOps, or explicitly save an immutable current-Draft action with mode=draft.',
    'mode=initialize_draft starts a pinned authoring ledger; legacy edits require an explicit legacy_document snapshot.',
    'Draft mode requires both current revisions and expected_ref_head. Read t3x_query workspace_activity first.',
    'Draft save appends one atomic action; it does not rewrite history, decide, commit or claim verified source evidence.',
    'Default mode=proposal prepares a pending Transition without changing the Draft.',
    'Use verify_transition, decide_transition, and commit_transition to complete the lifecycle.',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['proposal', 'draft', 'initialize_draft'],
        description: 'Default proposal preserves the existing pending Transition workflow.',
      },
      expected_revision: {
        type: 'integer',
        minimum: 0,
        description: 'Current composition revision for a Draft save.',
      },
      expected_workspace_revision: {
        type: 'integer',
        minimum: 1,
        description: 'Current persisted Workspace revision.',
      },
      expected_ref_head: {
        type: ['string', 'null'],
        description: 'Pinned Commit digest; null means an empty ref.',
      },
      legacy_document: {
        description:
          'Explicit snapshot of pre-ledger Draft edits. Imported history is marked unknown.',
      },
      project_id: { type: 'string', description: 'Project that owns the Workspace.' },
      workspace_id: { type: 'string', description: 'Existing Repository Workspace.' },
      request_id: { type: 'string', description: 'Proposal idempotency key.' },
      operations: {
        type: 'array',
        items: { type: 'object' },
        description: 'Non-empty canonical YOps operation array.',
      },
      why: { type: 'string', description: 'Optional concise rationale.' },
      if_revision: { type: 'number', description: 'Optional positive Workspace revision.' },
    },
    required: ['project_id', 'workspace_id', 'request_id'],
  },
  annotations: { readOnlyHint: false, idempotentHint: true },
};

export const editHandler: ToolHandler = async (args) => {
  if (args.mode === undefined || args.mode === 'proposal')
    return proposeTransitionHandler({ ...args, kind: 'structured_yops' });
  if (args.mode !== 'draft' && args.mode !== 'initialize_draft')
    return fail('Unknown editing mode');
  for (const key of ['project_id', 'workspace_id', 'request_id'])
    if (typeof args[key] !== 'string' || !(args[key] as string).trim())
      return fail(`${key} is required`);
  if (
    !Number.isInteger(args.expected_workspace_revision) ||
    Number(args.expected_workspace_revision) < 1 ||
    (args.expected_ref_head !== null &&
      (typeof args.expected_ref_head !== 'string' ||
        !/^sha256:[a-f0-9]{64}$/.test(args.expected_ref_head)))
  )
    return fail('Current expected_workspace_revision and expected_ref_head are required');
  const common = {
    request_id: args.request_id as string,
    expected_workspace_revision: Number(args.expected_workspace_revision),
    expected_ref_head: args.expected_ref_head as string | null,
  };
  if (args.mode === 'initialize_draft')
    return withTransitionApi((client) =>
      client.workspaces.authoring.initialize(
        args.project_id as string,
        args.workspace_id as string,
        {
          ...common,
          ...(args.legacy_document === undefined
            ? {}
            : { legacy_document: args.legacy_document as TransitionProtocolValue }),
        }
      )
    );
  if (
    !Number.isInteger(args.expected_revision) ||
    Number(args.expected_revision) < 0 ||
    !Array.isArray(args.operations)
  )
    return fail('Draft save requires expected_revision and operations');
  return withTransitionApi((client) =>
    client.workspaces.authoring.publish(args.project_id as string, args.workspace_id as string, {
      ...common,
      expected_revision: Number(args.expected_revision),
      operations: args.operations as TransitionProtocolValue[],
      ...(typeof args.why === 'string' ? { reason: args.why } : {}),
    })
  );
};
