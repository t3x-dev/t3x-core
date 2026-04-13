/**
 * L3 — workbench-draft readers (read-only per v2 §2.3).
 *
 * Writes (create, update, preview, commit, fork) live in
 * @/commands/drafts per v2 §2.4.
 */

import { getWorkbenchDraft, listWorkbenchDrafts } from '@/infrastructure/drafts';
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
