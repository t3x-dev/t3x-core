// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SchemaModuleRegistry } from '@/components/schemas';
import { PRD_CORE_ARTIFACT, PRD_MODULE_ARTIFACTS } from '@/data/schemaModules';

const PROMPT_MODULE = {
  ...PRD_MODULE_ARTIFACTS[0],
  canonicalName: 't3x/prompt-few-shot-examples',
  family: 'prompt' as const,
  title: 'Few-shot Examples',
  description: 'Examples for prompt compilation, not a frontend Module.',
  domain: 'Examples',
};
const TEST_REGISTRY = [PRD_CORE_ARTIFACT, ...PRD_MODULE_ARTIFACTS, PROMPT_MODULE];

describe('SchemaModuleRegistry', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders the HF-style tag browser, name-only results, and composition columns', () => {
    render(<SchemaModuleRegistry registryArtifacts={TEST_REGISTRY} />);

    expect(screen.getByText('Browse by tags')).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Tag groups' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search Modules by name' })).toHaveAttribute(
      'placeholder',
      'Search modules by name...'
    );
    expect(screen.getByRole('complementary', { name: 'Composition workbench' })).toHaveTextContent(
      'no required Core'
    );
  });

  it('treats Core as a selectable tag and ordinary Module', () => {
    render(<SchemaModuleRegistry registryArtifacts={TEST_REGISTRY} />);

    expect(screen.getByRole('tablist', { name: 'PRD Core instance views' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Rendered' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'YAML' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Guide' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Overview' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add PRD Core to composition' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Core' }));
    expect(screen.getByRole('button', { name: 'Inspect PRD Core' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Inspect Frontend Design' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add PRD Core to composition' }));
    expect(
      screen.getAllByRole('button', { name: 'Remove PRD Core from composition' })
    ).toHaveLength(2);
  });

  it('places a newly added Core first without pinning its position', () => {
    render(<SchemaModuleRegistry registryArtifacts={TEST_REGISTRY} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Frontend Design to composition' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add PRD Core to composition' }));

    const workbench = screen.getByRole('complementary', { name: 'Composition workbench' });
    const titles = within(workbench)
      .getAllByRole('article')
      .map((article) => within(article).getByText(/PRD Core|Frontend Design/).textContent);
    expect(titles).toEqual(['PRD Core', 'Frontend Design']);
    expect(
      within(workbench).getByRole('button', { name: 'Drag PRD Core to reorder' })
    ).toBeInTheDocument();
    fireEvent.click(within(workbench).getByRole('button', { name: 'Move PRD Core later' }));
    const movedTitles = within(workbench)
      .getAllByRole('article')
      .map((article) => within(article).getByText(/PRD Core|Frontend Design/).textContent);
    expect(movedTitles).toEqual(['Frontend Design', 'PRD Core']);
  });

  it('uses an Instance outline for Modules without a curated sample', () => {
    const communityModule = {
      ...PRD_MODULE_ARTIFACTS[0],
      canonicalName: 'community/custom-module',
      title: 'Custom Module',
      source: 'community' as const,
      nodePaths: ['custom_contract'],
    };
    render(<SchemaModuleRegistry registryArtifacts={[communityModule]} />);

    expect(
      screen.getByRole('tablist', { name: 'Custom Module instance views' })
    ).toBeInTheDocument();
    expect(screen.getByText('Representative Custom Contract content')).toBeInTheDocument();
  });

  it('filters by tag on the left and only by Module name in the middle', () => {
    render(<SchemaModuleRegistry registryArtifacts={TEST_REGISTRY} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Domain' }));
    fireEvent.click(screen.getByRole('button', { name: 'Frontend' }));
    expect(screen.getByRole('button', { name: 'Inspect Frontend Design' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Inspect Database Design' })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    const search = screen.getByRole('textbox', { name: 'Search Modules by name' });
    fireEvent.change(search, { target: { value: 'Frontend Design' } });
    expect(screen.getByRole('button', { name: 'Inspect Frontend Design' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Inspect Few-shot Examples' })
    ).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'frontend' } });
    expect(
      screen.queryByRole('button', { name: 'Inspect Few-shot Examples' })
    ).not.toBeInTheDocument();
  });

  it('builds one mixed Composition without a family boundary', () => {
    render(<SchemaModuleRegistry registryArtifacts={TEST_REGISTRY} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Frontend Design to composition' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Few-shot Examples to composition' }));
    const workbench = screen.getByRole('complementary', { name: 'Composition workbench' });
    expect(within(workbench).getByText('Frontend Design')).toBeInTheDocument();
    expect(within(workbench).getByText('Few-shot Examples')).toBeInTheDocument();
  });

  it('changes presentation order without requiring a pinned Core', () => {
    render(<SchemaModuleRegistry registryArtifacts={TEST_REGISTRY} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add System Architecture to composition' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Technology Stack to composition' }));
    expect(
      screen.getByRole('button', { name: 'Drag System Architecture to reorder' })
    ).toHaveAttribute('aria-roledescription', 'sortable');
    expect(
      screen.getByRole('button', { name: 'Drag Technology Stack to reorder' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Move Technology Stack earlier' }));

    const workbench = screen.getByRole('complementary', { name: 'Composition workbench' });
    const titles = within(workbench)
      .getAllByRole('article')
      .map((article) => within(article).getByText(/Architecture|Stack/).textContent);
    expect(titles).toEqual(['Technology Stack', 'System Architecture']);
  });

  it('restores a v1 Core plus Modules as equal selectable entries', () => {
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
            id: 'legacy',
            revision: 2,
            family: 'prd',
            status: 'draft',
            core: { canonicalName: 't3x/prd-core', version: '1.1.0' },
            modules: [
              {
                canonicalName: 't3x/prd-frontend-design',
                version: '1.0.0',
                order: 10,
              },
            ],
          },
        }}
      />
    );

    const workbench = screen.getByRole('complementary', { name: 'Composition workbench' });
    expect(within(workbench).getByText('PRD Core')).toBeInTheDocument();
    expect(within(workbench).getByText('Frontend Design')).toBeInTheDocument();
    expect(
      within(workbench).getByRole('button', { name: 'Remove PRD Core from composition' })
    ).toBeInTheDocument();
  });

  it('auto-saves the open v2 Composition without exposing a Draft action', async () => {
    const onSaved = vi.fn();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            composition: { ...request.composition, revision: 1 },
            workspaceRevision: 9,
            preview: {
              report: { valid: true, mode: 'open', issues: [] },
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
          onSaved,
        }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add Frontend Design to composition' }));
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Apply verified composition' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verify composition' })).toBeDisabled();

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1), { timeout: 2_000 });
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.composition).toMatchObject({
      apiVersion: 't3x.dev/yschema-composition/v2',
      modules: [
        {
          canonicalName: 't3x/prd-frontend-design',
          presentationOrder: 10,
        },
      ],
    });
    expect(screen.getByText('Needs verification')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verify composition' })).toBeEnabled();
  });

  it('publishes a verified v2 Composition as a Schema Blueprint', async () => {
    const onPublished = vi.fn();
    const hash = `sha256:${'2'.repeat(64)}`;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      const data = url.endsWith('/publish')
        ? {
            apiVersion: 't3x.dev/yschema-blueprint/v1',
            canonicalName: 'projects/proj_modules/schema',
            version: '1.0.0',
            title: 'Module Workspace Schema',
            description: 'Published Schema',
            status: 'active',
            source: 'team',
          }
        : {
            report: { valid: true, mode: 'open', issues: [] },
            compiledSchemaHash: `sha256:${'1'.repeat(64)}`,
            compositionHash: hash,
            renderPlan: [],
          };
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
          onPublished,
          composition: {
            apiVersion: 't3x.dev/yschema-composition/v2',
            id: 'composition:workspace_modules',
            revision: 1,
            status: 'draft',
            modules: [
              {
                canonicalName: 't3x/prd-frontend-design',
                version: '1.0.0',
                presentationOrder: 10,
              },
            ],
          },
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Verify composition' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Publish Schema version' })).toBeEnabled()
    );
    expect(screen.getByRole('button', { name: 'Verified' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Publish Schema version' }));
    fireEvent.change(screen.getByLabelText('Tags (comma separated)'), {
      target: { value: 'product, team' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publish 1.0.0' }));

    await waitFor(() => expect(onPublished).toHaveBeenCalledTimes(1));
    const publishCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/publish'));
    expect(JSON.parse(String(publishCall?.[1]?.body))).toMatchObject({
      canonical_name: 'projects/proj_modules/schema',
      version: '1.0.0',
      composition_hash: hash,
      tags: ['product', 'team'],
    });
    expect(screen.getByText(/immutable Schema/)).toBeInTheDocument();
  });
});
