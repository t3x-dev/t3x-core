/**
 * L3 command — create a workbench draft.
 */

import {
  type CreateWorkbenchDraftInput,
  createWorkbenchDraft as createWorkbenchDraftInfra,
} from '@/infrastructure/drafts';
import type { WorkbenchDraft } from '@/types/api';
import { DraftPersistenceError } from './errors';

export async function createWorkbenchDraft(
  input: CreateWorkbenchDraftInput
): Promise<WorkbenchDraft> {
  try {
    return await createWorkbenchDraftInfra(input);
  } catch (cause) {
    throw new DraftPersistenceError(
      cause instanceof Error ? cause.message : 'createWorkbenchDraft failed',
      cause
    );
  }
}

export type { CreateWorkbenchDraftInput };
