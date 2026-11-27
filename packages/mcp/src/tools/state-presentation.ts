import { StatePresentationInputSchema, T3xApiError } from '@t3x-dev/api-client';
import { isSafeBusinessIdentifier } from '../business-capabilities.js';
import { withTransitionApi } from './transition/index.js';
import type { ToolDef, ToolHandler } from './types.js';

const digest = /^sha256:[a-f0-9]{64}$/;
const digestField = { type: 'string', pattern: digest.source };

export const readPresentationDef: ToolDef = {
  name: 't3x_read_state_presentation',
  description: 'Read author presentation at an exact Commit and verify its State digest.',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string' },
      commit_digest: digestField,
      state_digest: digestField,
      presentation_digest: digestField,
    },
    required: ['project_id', 'commit_digest', 'state_digest'],
  },
  annotations: { readOnlyHint: true },
};

export const readPresentationHandler: ToolHandler = (args) =>
  withTransitionApi(async (client) => {
    const { project_id, commit_digest, state_digest, presentation_digest } = args;
    if (
      !isSafeBusinessIdentifier(project_id) ||
      typeof commit_digest !== 'string' ||
      !digest.test(commit_digest) ||
      typeof state_digest !== 'string' ||
      !digest.test(state_digest) ||
      (presentation_digest !== undefined &&
        (typeof presentation_digest !== 'string' || !digest.test(presentation_digest)))
    )
      throw new T3xApiError('INVALID_ARGUMENT', 'Provide a project and exact digests.', 400);
    const result = await client.getStatePresentation(
      project_id,
      commit_digest,
      presentation_digest
    );
    if (result.stateDigest !== state_digest)
      throw new T3xApiError('HASH_CONFLICT', 'Commit does not match the requested State.', 409);
    return result;
  });

export const revisePresentationDef: ToolDef = {
  name: 't3x_revise_state_presentation',
  description:
    'Commit a complete author presentation on a ref at its expected head. Business State stays identical.',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string' },
      ref: { type: 'string' },
      expected_head: digestField,
      presentation: StatePresentationInputSchema.toJSONSchema({ io: 'input' }),
    },
    required: ['project_id', 'ref', 'expected_head', 'presentation'],
  },
};

export const revisePresentationHandler: ToolHandler = (args) =>
  withTransitionApi(async (client) => {
    const { project_id, ref, expected_head } = args;
    const input = StatePresentationInputSchema.safeParse(args.presentation);
    if (
      !isSafeBusinessIdentifier(project_id) ||
      typeof ref !== 'string' ||
      !ref.split('/').every(isSafeBusinessIdentifier) ||
      ref.length > 200 ||
      typeof expected_head !== 'string' ||
      !digest.test(expected_head) ||
      !input.success
    )
      throw new T3xApiError(
        'INVALID_ARGUMENT',
        'Provide a project, ref, expected head and complete presentation.',
        400
      );
    return client.reviseStatePresentation(project_id, ref, expected_head, input.data);
  });
