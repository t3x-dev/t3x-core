/**
 * L3 — imperative "list workbench drafts for a project" helper.
 */

import {
  type CreateWorkbenchDraftInput,
  createWorkbenchDraft,
  listWorkbenchDrafts,
} from '@/lib/api/drafts';
import type { WorkbenchDraft } from '@/types/api';

export function fetchWorkbenchDrafts(
  projectId: string,
  status?: string
): Promise<WorkbenchDraft[]> {
  return listWorkbenchDrafts(projectId, status);
}

export function createWorkbenchDraftFor(
  input: CreateWorkbenchDraftInput
): Promise<WorkbenchDraft> {
  return createWorkbenchDraft(input);
}

export type { CreateWorkbenchDraftInput };
