import type {
  WorkspaceAuthoringAction,
  WorkspaceAuthoringCard,
  WorkspaceAuthoringView,
} from '@t3x-dev/api-client';
import { createContext, type RefObject } from 'react';
import type { OperationStackItem } from '@/domain/workspaces/composeOperationStacks';

export interface WorkspaceActivitySnapshot {
  key: string;
  expiresAt: number;
  view: WorkspaceAuthoringView;
  actions: WorkspaceAuthoringAction[];
  cards: Record<string, WorkspaceAuthoringCard[]>;
  operationItems: OperationStackItem[];
  cursor: number | null;
}

// Owned by the repository layout so switching tabs can reuse the last saved Draft.
export const WorkspaceActivityCacheContext =
  createContext<RefObject<WorkspaceActivitySnapshot | null> | null>(null);
