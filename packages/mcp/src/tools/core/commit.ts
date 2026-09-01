/** t3x_commit — compatibility name for canonical Transition commit. */

import { commitTransitionHandler } from '../transition/index.js';
import type { ToolDef, ToolHandler } from '../types.js';

export const commitDef: ToolDef = {
  name: 't3x_commit',
  description: [
    'Create CommitV2 for an accepted or authorized overridden Transition.',
    'Requires the Decision digest and exact expected ref head returned by the canonical lifecycle.',
    'This is a compatibility name for commit_transition, not a Draft commit path.',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string', description: 'Project that owns the Transition.' },
      transition_id: { type: 'string', description: 'Opaque trn_ Transition identifier.' },
      request_id: { type: 'string', description: 'Commit idempotency key.' },
      decision_digest: { type: 'string', description: 'Digest returned by decide_transition.' },
      expected_head: {
        type: ['string', 'null'],
        description: 'Exact ref head from review; null only for an empty ref.',
      },
    },
    required: ['project_id', 'transition_id', 'request_id', 'decision_digest', 'expected_head'],
  },
  annotations: { readOnlyHint: false, idempotentHint: true },
};

export const commitHandler: ToolHandler = commitTransitionHandler;
