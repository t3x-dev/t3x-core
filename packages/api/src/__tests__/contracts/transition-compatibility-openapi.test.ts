import { describe, expect, it } from 'vitest';
import { createWorkspaceSourceTransitionRoutes } from '../../routes/workspace-source-transition.openapi';
import { workspaceRoutes } from '../../routes/workspaces.openapi';

const documentConfig = {
  openapi: '3.0.0' as const,
  info: { title: 'Transition compatibility test', version: '1.0.0' },
};

describe('Transition compatibility OpenAPI policy', () => {
  it('blocks deprecation until the canonical task replacement reaches parity', () => {
    const workspaceDocument = workspaceRoutes.getOpenAPIDocument(documentConfig);
    const sourceDocument =
      createWorkspaceSourceTransitionRoutes().getOpenAPIDocument(documentConfig);

    expect(
      workspaceDocument.paths['/v1/projects/{projectId}/workspaces/{workspaceId}/transition/review']
        ?.post?.deprecated
    ).not.toBe(true);
    expect(
      workspaceDocument.paths['/v1/projects/{projectId}/workspaces/{workspaceId}/transition/decide']
        ?.post?.deprecated
    ).not.toBe(true);
    expect(
      workspaceDocument.paths['/v1/projects/{projectId}/workspaces/{workspaceId}/commit']?.post
        ?.deprecated
    ).not.toBe(true);

    for (const path of [
      '/v1/projects/{projectId}/workspaces/{workspaceId}/source-transition/review',
      '/v1/projects/{projectId}/workspaces/{workspaceId}/source-transition/decide',
      '/v1/projects/{projectId}/workspaces/{workspaceId}/source-transition/revert/review',
      '/v1/projects/{projectId}/workspaces/{workspaceId}/source-transition/revert/decide',
    ]) {
      expect(sourceDocument.paths[path]?.post?.deprecated, path).not.toBe(true);
    }
  });
});
