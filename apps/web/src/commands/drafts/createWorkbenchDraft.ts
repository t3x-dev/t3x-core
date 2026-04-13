/**
 * L3 command — create a new workbench draft.
 */

import {
  type CreateWorkbenchDraftInput,
  createWorkbenchDraft as createWorkbenchDraftInfra,
} from '@/infrastructure/drafts';
import type { WorkbenchDraft } from '@/types/api';

export async function createWorkbenchDraft(
  input: CreateWorkbenchDraftInput
): Promise<WorkbenchDraft> {
  return createWorkbenchDraftInfra(input);
}

export type { CreateWorkbenchDraftInput };
