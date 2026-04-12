/**
 * L3 — imperative "list workbench drafts for a project" helper.
 */

import { listWorkbenchDrafts } from '@/lib/api/drafts';
import type { WorkbenchDraft } from '@/types/api';

export function fetchWorkbenchDrafts(
  projectId: string,
  status?: string
): Promise<WorkbenchDraft[]> {
  return listWorkbenchDrafts(projectId, status);
}
