/**
 * L3 command — compare-and-set a project's canonical visibility.
 *
 * Publication confirmation is explicit input and the API records the actor
 * evidence. Hosted capacity denials remain available through the error cause.
 */

import {
  type ChangeProjectVisibilityPayload,
  type ChangeProjectVisibilityResponse,
  changeProjectVisibility as changeProjectVisibilityInfra,
} from '@/infrastructure/projects';
import { ProjectPersistenceError } from './errors';

export async function changeProjectVisibility(
  projectId: string,
  input: ChangeProjectVisibilityPayload
): Promise<ChangeProjectVisibilityResponse> {
  try {
    return await changeProjectVisibilityInfra(projectId, input);
  } catch (cause) {
    throw new ProjectPersistenceError(
      cause instanceof Error ? cause.message : 'changeProjectVisibility failed',
      cause
    );
  }
}

export type { ChangeProjectVisibilityPayload, ChangeProjectVisibilityResponse };
