// @vitest-environment jsdom

import '@testing-library/jest-dom';
import {
  type DeploymentCapabilities,
  SELF_HOSTED_DEPLOYMENT_CAPABILITIES,
} from '@t3x-dev/api-client';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeploymentCapabilitiesProvider } from '@/components/deployment/DeploymentCapabilitiesProvider';
import { ProjectCollaborationPanel } from '@/components/project/ProjectCollaborationPanel';
import { ProjectAiSettings } from '@/components/project/settings/ProjectAiSettings';
import { clearQueryCache } from '@/hooks/shared/useQuery';
import type { ProjectDetail, ProviderInfo } from '@/types/api';

const project: ProjectDetail = {
  project_id: 'project-settings',
  name: 'Settings test',
  visibility: 'private',
  created_at: '2026-11-01T00:00:00Z',
};

const managed: DeploymentCapabilities = {
  ...SELF_HOSTED_DEPLOYMENT_CAPABILITIES,
  deployment_mode: 'managed',
  provider_credentials: { administration: 'disabled' },
  inference: { mode: 'managed' },
};

const provider: ProviderInfo = {
  id: 'openai',
  name: 'Test provider',
  role: 'generation',
  roles: ['generation'],
  configured: true,
  required_env_keys: [],
  default_model: null,
  available_models: null,
};

function showSettings(capabilities: DeploymentCapabilities, operator: boolean) {
  const adminEnabled = operator && capabilities.provider_credentials.administration === 'local';
  const fetch = vi.fn(async (url: string) => {
    const path = new URL(url, 'http://localhost').pathname;
    const success = (data: unknown) => Response.json({ success: true, data });
    switch (path) {
      case '/api/v1/auth/me/capabilities':
        return success({ operator });
      case '/api/v1/providers':
      case '/api/v1/providers/roles':
        if (adminEnabled) return success(path.endsWith('/roles') ? [] : [provider]);
        return Response.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'Provider access denied' } },
          { status: 403 }
        );
      case '/api/v1/llm/models':
        return success({ providers: [], default_provider: null, generation_provider_order: [] });
      case '/api/v1/projects/project-settings':
        return success({ ...project, provider_config: null });
      case '/api/v1/projects/project-settings/guests':
        return success({
          version: 1,
          namespace_id: 'ns_settings',
          project_id: project.project_id,
          authorized_actions: ['project:guests:manage'],
          guests: [],
        });
      case '/api/v1/projects/project-settings/invitations':
        return success({
          version: 1,
          target_kind: 'project',
          namespace_id: 'ns_settings',
          project_id: project.project_id,
          authorized_actions: ['project:guests:manage'],
          invitations: [],
        });
      default:
        throw new Error(`Unexpected request ${path}`);
    }
  });
  vi.stubGlobal('fetch', fetch);

  render(
    <DeploymentCapabilitiesProvider initialCapabilities={capabilities}>
      <ProjectCollaborationPanel projectId={project.project_id} />
      <ProjectAiSettings projectId={project.project_id} project={project} projectLoading={false} />
    </DeploymentCapabilitiesProvider>
  );
  return fetch;
}

describe('Project AI defaults', () => {
  afterEach(() => {
    cleanup();
    clearQueryCache();
    vi.unstubAllGlobals();
  });

  it.each([
    [managed, true, 'Provider overrides are unavailable on this deployment.'],
    [
      SELF_HOSTED_DEPLOYMENT_CAPABILITIES,
      false,
      'Provider overrides require deployment operator access.',
    ],
  ])('loads project guests and the model selector without provider admin requests', async (capabilities, operator, message) => {
    const fetch = showSettings(capabilities, operator);

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(await screen.findByText('No project-only guests.')).toBeInTheDocument();
    expect(await screen.findByLabelText('Provider')).toBeInTheDocument();
    expect(fetch.mock.calls.some(([url]) => url.includes('/api/v1/providers'))).toBe(false);
    expect(screen.queryByText('Your access changed. Refresh to load this data.')).toBeNull();
  });

  it('loads provider overrides for self-hosted operators', async () => {
    const fetch = showSettings(SELF_HOSTED_DEPLOYMENT_CAPABILITIES, true);

    expect(await screen.findByText('Test provider')).toBeInTheDocument();
    expect(await screen.findByText('No project-only guests.')).toBeInTheDocument();
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/api/v1/providers/roles'))).toBe(true);
  });
});
