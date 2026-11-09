export function evaluationCompareHref(
  projectId?: string | null,
  selection: Record<string, string> = {}
) {
  const params = new URLSearchParams(selection);
  if (projectId) params.set('project', projectId);
  return params.size ? `/deploy/compare?${params}` : '/deploy/compare';
}

export function evaluationDeployHref(projectId?: string | null, prepare = false) {
  const params = new URLSearchParams();
  if (projectId) params.set('project', projectId);
  if (prepare) params.set('prepare', '1');
  return `/deploy${params.size ? `?${params}` : ''}${prepare ? '#comparison-preparation' : ''}`;
}
