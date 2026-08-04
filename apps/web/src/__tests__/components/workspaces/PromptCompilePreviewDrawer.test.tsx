// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PromptCompilePreviewDrawer } from '@/components/workspaces/PromptCompilePreviewDrawer';
import { ApiError } from '@/infrastructure/core';
import { fetchPromptCompilePreview } from '@/infrastructure/promptCompile';
import type { PromptCompilePreviewResponse } from '@/types/promptCompile';
import type { WorkspaceCandidate } from '@/types/workspaces';

vi.mock('@/infrastructure/promptCompile', () => ({
  fetchPromptCompilePreview: vi.fn(),
}));

const fetchPreviewMock = vi.mocked(fetchPromptCompilePreview);

function workspace(): WorkspaceCandidate {
  return {
    id: 'workspace_prompt',
    projectId: 'proj_1',
    title: 'Requirement extractor prompt',
    summary: 'Prompt Workspace candidate.',
    status: 'schema_review',
    updatedAt: '2026-07-30T10:00:00.000Z',
    baseCommitHash: null,
    targetBranch: 'prompt/extractor',
    sourceBundle: [{ id: 'source_1', type: 'text', title: 'Launch brief' }],
    schemaBindings: [
      {
        canonicalName: 't3x/prompt',
        schemaHash: `sha256:${'1'.repeat(64)}`,
        schemaName: 'Prompt Schema',
        version: 'v1',
        mode: 'pinned',
      },
    ],
    schemaCandidate: {
      proposalMode: 'deterministic_scaffold',
      summary: 'Prompt candidate from the launch brief.',
      fields: [
        {
          id: 'manifest-name',
          path: 'manifest.name',
          label: 'Name',
          type: 'string',
          required: true,
          status: 'covered',
          value: 'requirement-extractor',
        },
      ],
    },
    schemaReview: { verdict: 'needs_review', summary: 'Review candidate.', gaps: [] },
    yopsDraft: { id: 'draft_prompt', operations: [] },
    outputTargets: [],
  };
}

function response(
  overrides: Partial<PromptCompilePreviewResponse> = {}
): PromptCompilePreviewResponse {
  return {
    compiled: false,
    schemaName: 't3x/prompt',
    schemaVersion: 'v1',
    compilerVersion: 't3x-prompt-compiler@0.1.0',
    inputSource: { kind: 'workspace', label: 'Launch brief', sourceCount: 1 },
    adapter: {
      id: 'portable-preview',
      mode: 'chat',
      responseFormat: 'json_schema',
      streaming: false,
      toolPolicy: 'none',
      maxOutputTokens: 2000,
    },
    messages: [
      {
        key: 'user_task',
        path: 'messages/user_task',
        sequence: 1,
        role: 'user',
        content: 'Build {{request}}',
        variableKeys: ['request'],
        contextKeys: ['project_sources'],
        resourceKeys: ['response_schema'],
      },
    ],
    variables: [
      {
        key: 'request',
        path: 'variables/request',
        source: 'user',
        required: true,
        sensitive: false,
        status: 'missing',
      },
    ],
    contexts: [
      {
        key: 'project_sources',
        path: 'contexts/project_sources',
        kind: 'retrieval',
        loadPolicy: 'on_demand',
        placement: 'before_user',
        required: true,
        status: 'resolved',
        targetMessageKeys: ['user_task'],
      },
    ],
    contextBudget: { maxTokens: 6000, resolved: 1, missing: 0 },
    resources: [
      {
        key: 'response_schema',
        path: 'resources/response_schema',
        kind: 'schema',
        bundlePath: 'schemas/response.json',
        referenced: true,
        available: false,
      },
    ],
    output: {
      format: 'json_schema',
      strict: true,
      onParseFailure: 'report_and_stop',
      maxRetries: 0,
      schemaResource: 'response_schema',
    },
    issues: [
      {
        code: 'PROMPT_VARIABLE_UNRESOLVED',
        path: 'variables/request',
        message: 'Variable request could not be resolved.',
        source: 'compile',
        blocking: true,
      },
      {
        code: 'PROMPT_RESOURCE_CONTENT_MISSING',
        path: 'resources/response_schema/path',
        message: 'Referenced resource response_schema has no compiler content.',
        source: 'compile',
        blocking: true,
      },
    ],
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('PromptCompilePreviewDrawer', () => {
  it('renders backend results and line-level issue navigation', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    fetchPreviewMock.mockResolvedValue(response());

    render(<PromptCompilePreviewDrawer candidate={workspace()} onOpenChange={vi.fn()} open />);

    expect(screen.getByText('No preview yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Compile current candidate' }));
    expect(screen.getByRole('status')).toHaveTextContent('Compiling preview');
    expect(await screen.findByText('Launch brief')).toBeInTheDocument();
    expect(screen.getByText('portable-preview · chat')).toBeInTheDocument();
    expect(screen.getByText('6000 tokens')).toBeInTheDocument();
    expect(screen.getByText('Build {{request}}')).toBeInTheDocument();
    expect(
      screen.getByText('Compilation blocked: Variable request could not be resolved.')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Jump to Variable' }));
    const variableRow = document.getElementById('prompt-preview-variable-request');
    expect(scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(variableRow);
  });

  it('keeps the prior result when a changed candidate fails to refresh', async () => {
    fetchPreviewMock.mockResolvedValueOnce(response());
    const candidate = workspace();
    const view = render(
      <PromptCompilePreviewDrawer candidate={candidate} onOpenChange={vi.fn()} open />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Compile current candidate' }));
    expect(await screen.findByText('Build {{request}}')).toBeInTheDocument();

    const changed = structuredClone(candidate);
    changed.schemaCandidate.fields[0]!.value = 'changed-prompt';
    view.rerender(<PromptCompilePreviewDrawer candidate={changed} onOpenChange={vi.fn()} open />);
    expect(screen.getByText('Showing the previous candidate result')).toBeInTheDocument();

    fetchPreviewMock.mockRejectedValueOnce(new Error('Network request failed.'));
    fireEvent.click(screen.getByRole('button', { name: 'Recompile current candidate' }));
    expect(await screen.findByText('Preview request failed')).toBeInTheDocument();
    expect(screen.getByText(/Network request failed/)).toBeInTheDocument();
    expect(screen.getByText('Build {{request}}')).toBeInTheDocument();
  });

  it('disables compile for a stale candidate while retaining its last result', async () => {
    fetchPreviewMock.mockResolvedValueOnce(response());
    const candidate = workspace();
    const view = render(
      <PromptCompilePreviewDrawer candidate={candidate} onOpenChange={vi.fn()} open />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Compile current candidate' }));
    expect(await screen.findByText('Build {{request}}')).toBeInTheDocument();

    const stale = structuredClone(candidate);
    stale.schemaCandidate.fields = [];
    stale.schemaCandidate.summary = 'Schema binding changed. Regenerate the candidate.';
    stale.schemaReview.summary = 'The previous candidate is stale.';
    view.rerender(<PromptCompilePreviewDrawer candidate={stale} onOpenChange={vi.fn()} open />);

    expect(screen.getByText('Candidate is stale — compile disabled')).toBeInTheDocument();
    expect(screen.getByText('Build {{request}}')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recompile current candidate' })).toBeDisabled();
    expect(fetchPreviewMock).toHaveBeenCalledTimes(1);
  });

  it('shows an unavailable runtime state and never calls the API', () => {
    const candidate = workspace();
    candidate.schemaBindings[0]!.version = 'v2';

    render(<PromptCompilePreviewDrawer candidate={candidate} onOpenChange={vi.fn()} open />);

    expect(screen.getByText('Runtime unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compile current candidate' })).toBeDisabled();
    expect(fetchPreviewMock).not.toHaveBeenCalled();
  });

  it('distinguishes an unavailable API response from a network error', async () => {
    fetchPreviewMock.mockRejectedValue(
      new ApiError('INVALID_REQUEST', 'Prompt compiler runtime is unavailable for t3x/prompt@v1')
    );

    render(<PromptCompilePreviewDrawer candidate={workspace()} onOpenChange={vi.fn()} open />);

    fireEvent.click(screen.getByRole('button', { name: 'Compile current candidate' }));
    await waitFor(() => expect(screen.getByText('Runtime unavailable')).toBeInTheDocument());
    expect(screen.queryByText('Preview request failed')).not.toBeInTheDocument();
  });
});
