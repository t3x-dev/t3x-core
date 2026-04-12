/**
 * L3 — workbench-draft read/write pass-through.
 *
 * Read surface (listWorkbenchDrafts, getWorkbenchDraft) consumed by
 * canvas + leaf components; write surface (create / update / preview /
 * commit) consumed by `draftWorkspaceStore`.
 */

import {
  type CreateWorkbenchDraftInput,
  type UpdateWorkbenchDraftInput,
  commitWorkbenchDraft,
  createWorkbenchDraft,
  getWorkbenchDraft,
  listWorkbenchDrafts,
  previewWorkbenchDraft,
  updateWorkbenchDraft,
} from '@/lib/api/drafts';
import type { WorkbenchDraft } from '@/types/api';

export function fetchWorkbenchDrafts(
  projectId: string,
  status?: string
): Promise<WorkbenchDraft[]> {
  return listWorkbenchDrafts(projectId, status);
}

export function fetchWorkbenchDraft(draftId: string): Promise<WorkbenchDraft> {
  return getWorkbenchDraft(draftId);
}

export function createWorkbenchDraftFor(
  input: CreateWorkbenchDraftInput
): Promise<WorkbenchDraft> {
  return createWorkbenchDraft(input);
}

export function updateWorkbenchDraftById(
  draftId: string,
  updates: UpdateWorkbenchDraftInput
): Promise<WorkbenchDraft> {
  return updateWorkbenchDraft(draftId, updates);
}

export function previewWorkbenchDraftById(
  draftId: string,
  options?: { model?: string; preview_type?: string }
): Promise<{ output: string; model_used: string; token_count: number; cached: boolean }> {
  return previewWorkbenchDraft(draftId, options);
}

export function commitWorkbenchDraftById(
  draftId: string,
  message?: string
): Promise<{
  commit: Record<string, unknown>;
  leaf: Record<string, unknown> | null;
  draft_status: string;
}> {
  return commitWorkbenchDraft(draftId, message);
}

export type { CreateWorkbenchDraftInput, UpdateWorkbenchDraftInput };
