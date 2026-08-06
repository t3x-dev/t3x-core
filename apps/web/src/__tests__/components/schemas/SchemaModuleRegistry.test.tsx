// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SchemaModuleRegistry } from '@/components/schemas';
import { PRD_CORE_ARTIFACT, PRD_MODULE_ARTIFACTS } from '@/data/schemaModules';

const TEST_REGISTRY = [PRD_CORE_ARTIFACT, ...PRD_MODULE_ARTIFACTS];
const PROMPT_CORE = {
  ...PRD_CORE_ARTIFACT,
  canonicalName: 't3x/prompt-core',
  version: '1.0.0',
  family: 'prompt' as const,
  title: 'Prompt Core',
  domain: 'Foundation',
  renderers: ['prompt-text', 'markdown', 'yaml'],
};
const PROMPT_MODULE = {
  ...PRD_MODULE_ARTIFACTS[0],
  canonicalName: 't3x/prompt-few-shot-examples',
  family: 'prompt' as const,
  title: 'Few-shot Examples',
  domain: 'Examples',
  placement: 'examples',
  provides: ['few-shot-examples'],
  requires: ['message-contract'],
  nodePaths: ['examples'],
  renderers: ['prompt-text', 'markdown', 'yaml'],
};

describe('SchemaModuleRegistry', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows Core, Module details, and an ordered Composition draft', () => {
    render(<SchemaModuleRegistry registryArtifacts={TEST_REGISTRY} />);

    expect(screen.getByRole('region', { name: 'Schema Module Registry' })).toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: 'Composition workbench' })
    ).toBeInTheDocument();
    expect(screen.getByText('Pinned foundation')).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'PRD Core details' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Drag System Architecture to reorder' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compile preview' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No Workspace' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Publish unavailable' })).toBeDisabled();
    expect(screen.getByText('Recommended')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add Quality Strategy to composition' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Drag Quality Strategy to reorder' })
    ).not.toBeInTheDocument();
  });

  it('keeps the official Core pinned when a newer project Schema is listed first', async () => {
    const projectSchema = {
      ...PRD_CORE_ARTIFACT,
      canonicalName: 'projects/proj_modules/prd',
      version: '1.0.1',
      source: 'team' as const,
      title: 'Project PRD',
    };
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              report: { valid: true, issues: [] },
              compiledSchemaHash: `sha256:${'1'.repeat(64)}`,
              compositionHash: `sha256:${'2'.repeat(64)}`,
              renderPlan: [],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <SchemaModuleRegistry
        registryArtifacts={[projectSchema, PRD_CORE_ARTIFACT, ...PRD_MODULE_ARTIFACTS]}
      />
    );

    expect(screen.getByRole('tablist', { name: 'PRD Core details' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Compile preview' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.core).toEqual({
      canonicalName: 't3x/prd-core',
      version: '1.1.0',
    });
  });

  it('scopes Core, Modules, Domains, and Render to the selected family', () => {
    render(
      <SchemaModuleRegistry
        family="prompt"
        registryArtifacts={[...TEST_REGISTRY, PROMPT_CORE, PROMPT_MODULE]}
      />
    );

    expect(screen.getAllByText('Prompt Core').length).toBeGreaterThan(0);
    expect(screen.getByText('Prompt Modules')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inspect Few-shot Examples' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Inspect Database Design' })
    ).not.toBeInTheDocument();
    expect(screen.getAllByText('Examples').length).toBeGreaterThan(0);
    expect(screen.getByText('Prompt composition')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Render' }));
    expect(screen.getByText('Prompt Text')).toBeInTheDocument();
    expect(screen.getByText(/compiles ordered messages and typed variables/)).toBeInTheDocument();
  });

  it('inspects Module rules and adds or removes Modules explicitly', () => {
    render(<SchemaModuleRegistry registryArtifacts={TEST_REGISTRY} />);

    fireEvent.click(screen.getByRole('button', { name: 'Inspect Database Design' }));
    expect(screen.getByRole('tablist', { name: 'Database Design details' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Rules' }));
    expect(screen.getByText('prd-database-design.dependencies')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Database Design from composition' })
    );
    expect(
      screen.queryByRole('button', { name: 'Drag Database Design to reorder' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add Database Design to composition' }));
    expect(
      screen.getByRole('button', { name: 'Drag Database Design to reorder' })
    ).toBeInTheDocument();
  });

  it('offers reliable arrow controls alongside pointer and keyboard sorting', () => {
    render(<SchemaModuleRegistry registryArtifacts={TEST_REGISTRY} />);
    const workbench = screen.getByRole('complementary', { name: 'Composition workbench' });
    const moduleTitles = () =>
      within(workbench)
        .getAllByRole('listitem')
        .map((item) => within(item).getByText(/Design|Architecture|Stack|Contract/).textContent);

    expect(moduleTitles().slice(0, 2)).toEqual(['System Architecture', 'Technology Stack']);
    fireEvent.click(screen.getByRole('button', { name: 'Move Technology Stack earlier' }));
    expect(moduleTitles().slice(0, 2)).toEqual(['Technology Stack', 'System Architecture']);
  });

  it('restores and saves a versioned Workspace Composition draft', async () => {
    const onSaved = vi.fn();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            composition: { ...request.composition, revision: 3 },
            workspaceRevision: 9,
            preview: {
              report: {
                valid: false,
                issues: [
                  {
                    code: 'PROVIDER_AFTER_CONSUMER',
                    blocking: true,
                    message: 'Technology Stack requires system boundaries from a later provider.',
                  },
                ],
              },
              compiledSchemaHash: `sha256:${'1'.repeat(64)}`,
              compositionHash: `sha256:${'2'.repeat(64)}`,
              renderPlan: [],
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <SchemaModuleRegistry
        registryArtifacts={TEST_REGISTRY}
        workspace={{
          projectId: 'proj_modules',
          workspaceId: 'workspace_modules',
          workspaceTitle: 'Module Workspace',
          workspaceRevision: 8,
          composition: {
            apiVersion: 't3x.dev/yschema-composition/v1',
            id: 'composition:workspace_modules',
            revision: 2,
            family: 'prd',
            status: 'draft',
            core: { canonicalName: 't3x/prd-core', version: '1.1.0' },
            modules: [
              {
                canonicalName: 't3x/prd-system-architecture',
                version: '1.0.0',
                order: 10,
              },
              {
                canonicalName: 't3x/prd-technology-stack',
                version: '1.0.0',
                order: 20,
              },
            ],
          },
          onSaved,
        }}
      />
    );

    expect(screen.getByText('saved r2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Move Technology Stack earlier' }));
    expect(screen.getByText('unsaved')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.if_revision).toBe(8);
    expect(request.composition.revision).toBe(2);
    expect(request.composition.modules[0]).toMatchObject({
      canonicalName: 't3x/prd-technology-stack',
      order: 10,
    });
    expect(screen.getByText('saved r3')).toBeInTheDocument();
    expect(screen.getByText(/No Commit was created/)).toBeInTheDocument();
  });

  it('previews and publishes a saved Composition into version history', async () => {
    const onPublished = vi.fn();
    const compositionHash = `sha256:${'2'.repeat(64)}`;
    const compiledSchemaHash = `sha256:${'1'.repeat(64)}`;
    const preview = {
      report: { valid: true, issues: [] },
      compiledSchemaHash,
      compositionHash,
      renderPlan: [],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const request = JSON.parse(String(init?.body));
      const data = url.endsWith('/schema-composition/publish')
        ? {
            apiVersion: 't3x.dev/yschema-core/v1',
            canonicalName: 'projects/proj_modules/prd',
            version: '1.0.0',
            family: 'prd',
            title: 'Module Workspace PRD',
            description: 'Published Composition',
            status: 'active',
            source: 'team',
            schema: {},
          }
        : preview;
      if (url.endsWith('/schema-composition/publish')) {
        expect(request).toEqual({
          composition_revision: 2,
          composition_hash: compositionHash,
          canonical_name: 'projects/proj_modules/prd',
          version: '1.0.0',
          title: 'Module Workspace PRD',
        });
      }
      return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <SchemaModuleRegistry
        registryArtifacts={TEST_REGISTRY}
        workspace={{
          projectId: 'proj_modules',
          workspaceId: 'workspace_modules',
          workspaceTitle: 'Module Workspace',
          workspaceRevision: 8,
          composition: persistedComposition,
          onPublished,
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Publish version' }));
    expect(
      await screen.findByRole('dialog', { name: 'Publish Schema version' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Publish 1.0.0' }));

    await waitFor(() => expect(onPublished).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onPublished).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalName: 'projects/proj_modules/prd', version: '1.0.0' })
    );
  });
});

const persistedComposition = {
  apiVersion: 't3x.dev/yschema-composition/v1' as const,
  id: 'composition:workspace_modules',
  revision: 2,
  family: 'prd' as const,
  status: 'draft' as const,
  core: { canonicalName: 't3x/prd-core', version: '1.1.0' },
  modules: [
    {
      canonicalName: 't3x/prd-system-architecture',
      version: '1.0.0',
      order: 10,
    },
    {
      canonicalName: 't3x/prd-technology-stack',
      version: '1.0.0',
      order: 20,
    },
  ],
};
