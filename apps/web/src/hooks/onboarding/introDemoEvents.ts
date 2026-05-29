export const INTRO_DEMO_PROJECT_DELETED_EVENT = 't3x:intro-demo-project-deleted';

export interface IntroDemoProjectDeletedDetail {
  projectId: string;
}

export function notifyIntroDemoProjectDeleted(projectId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<IntroDemoProjectDeletedDetail>(INTRO_DEMO_PROJECT_DELETED_EVENT, {
      detail: { projectId },
    })
  );
}
