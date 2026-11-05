export function notifySchemaCandidateUpdated(projectId: string, workspaceId: string) {
  const key = 't3x-schema-candidate-updated';
  const detail = { projectId, workspaceId };
  window.dispatchEvent(new CustomEvent(key, { detail }));
  try {
    localStorage.setItem(key, JSON.stringify({ ...detail, at: Date.now() }));
  } catch {
    // Focus refresh is still available when browser storage is blocked.
  }
}
