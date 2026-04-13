/**
 * L3 — workbench-draft read pass-throughs.
 *
 * Writes (create / update / preview / commit / fork) live in
 * @/commands/drafts (v2 §2.4). `createWorkbenchDraftFor` is a transitional
 * re-export that will move when canvasNodeSlice migrates in a later bundle.
 */

import {
  type CreateWorkbenchDraftInput,
  createWorkbenchDraft,
  getWorkbenchDraft,
  listWorkbenchDrafts,
} from '@/infrastructure/drafts';
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

/**
 * Transitional: canvasNodeSlice still imports this for `addDraftNode`. Will
 * move to the canvas bundle (conversations/merge) when that slice migrates.
 */
export function createWorkbenchDraftFor(input: CreateWorkbenchDraftInput): Promise<WorkbenchDraft> {
  return createWorkbenchDraft(input);
}

export type { CreateWorkbenchDraftInput };
