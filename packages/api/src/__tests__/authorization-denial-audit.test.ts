import type { RequestPrincipal } from '@t3x-dev/application';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { logAuthorizationDenial } from '../lib/authorization-denial-audit';
import { pinoLogger } from '../middleware/logger';

const principal: RequestPrincipal = {
  subject: { kind: 'agent', principal_id: 'ak_mcp_agent' },
  actor: { kind: 'agent', id: 'service:api-key:ak_mcp_agent' },
  delegator: { kind: 'human', id: 'user:user_owner' },
  workspaceOwner: { kind: 'human', principal_id: 'user_owner' },
  userId: 'user_owner',
  accountId: null,
  sessionId: null,
  credential: {
    kind: 'mcp',
    id: 'ak_mcp_agent',
    projectId: 'project_1',
    namespaceId: null,
  },
  scopes: [],
  ingress: 'http',
};

describe('authorization denial audit', () => {
  afterEach(() => vi.restoreAllMocks());

  it('records principal, effective entrypoint, action, resource and reason without secrets', () => {
    const warn = vi.spyOn(pinoLogger, 'warn').mockImplementation(() => undefined);

    logAuthorizationDenial({
      principal,
      action: 'project:edit',
      resource: { kind: 'workspace', id: 'workspace_1', project_id: 'project_1' },
      reason: 'inactive_membership',
    });

    expect(warn).toHaveBeenCalledWith(
      {
        event: 'authorization.denied',
        entrypoint: 'mcp',
        principal: {
          subject: principal.subject,
          actor: principal.actor,
          delegator: principal.delegator,
          credential: { kind: 'mcp', id: 'ak_mcp_agent' },
        },
        action: 'project:edit',
        resource: { kind: 'workspace', id: 'workspace_1', project_id: 'project_1' },
        reason: 'inactive_membership',
      },
      'authorization denied'
    );
  });
});
