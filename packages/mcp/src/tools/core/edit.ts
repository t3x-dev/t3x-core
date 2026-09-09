/** t3x_edit — compatibility name for a structured_yops Transition proposal. */

import { proposeTransitionHandler } from '../transition/index.js';
import type { ToolDef, ToolHandler } from '../types.js';

export const editDef: ToolDef = {
  name: 't3x_edit',
  description: [
    'Propose structured YOps against an existing Repository Workspace.',
    'This prepares a replayable Transition; it does not mutate a Draft, decide, commit, or advance a ref.',
    'Use verify_transition, decide_transition, and commit_transition to complete the lifecycle.',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
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
    required: ['project_id', 'workspace_id', 'request_id', 'operations'],
  },
  annotations: { readOnlyHint: false, idempotentHint: true },
};

export const editHandler: ToolHandler = async (args) =>
  proposeTransitionHandler({ ...args, kind: 'structured_yops' });
