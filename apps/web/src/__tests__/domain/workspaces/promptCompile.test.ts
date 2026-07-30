import { describe, expect, it } from 'vitest';
import {
  describePromptWorkspaceCompile,
  isPromptWorkspace,
} from '@/domain/workspaces/promptCompile';
import type { WorkspaceCandidate } from '@/types/workspaces';

function promptWorkspace(): WorkspaceCandidate {
  return {
    id: 'workspace_prompt',
    projectId: 'proj_1',
    title: 'Requirement extractor prompt',
    summary: 'Compile a deterministic prompt preview.',
    status: 'schema_review',
    updatedAt: '2026-07-30T10:00:00.000Z',
    baseCommitHash: null,
    targetBranch: 'prompt/extractor',
    sourceBundle: [{ id: 'source_1', type: 'text', title: 'Fixture input' }],
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
      proposalMode: 'fixture',
      summary: 'Ready prompt fixture.',
      promptCompileInputs: {
        relations: [{ type: 'uses_variable', from: 'messages/user_task', to: 'variables/request' }],
        variableValues: { request: 'Build the preview.' },
        contextContents: { project_sources: 'Source content.' },
        resourceContents: { response_schema: '{"type":"object"}' },
      },
      fields: [
        {
          id: 'manifest',
          path: 'manifest',
          label: 'Manifest',
          type: 'object',
          required: true,
          status: 'covered',
          children: [
            {
              id: 'manifest-name',
              path: 'manifest.name',
              label: 'Name',
              type: 'string',
              required: true,
              status: 'covered',
              value: 'requirement-extractor',
              evidence: 'Fixture name.',
            },
          ],
        },
        {
          id: 'message-sequence',
          path: 'messages.user_task.sequence',
          label: 'Sequence',
          type: 'integer',
          required: true,
          status: 'covered',
          value: '2',
        },
        {
          id: 'runtime-streaming',
          path: 'runtime.streaming',
          label: 'Streaming',
          type: 'boolean',
          required: true,
          status: 'covered',
          value: 'false',
        },
        {
          id: 'contract-inputs',
          path: 'contract.inputs',
          label: 'Inputs',
          type: 'array',
          required: true,
          status: 'covered',
          value: '["request"]',
        },
      ],
    },
    schemaReview: { verdict: 'ready', summary: 'Ready.', gaps: [] },
    yopsDraft: { id: 'draft_prompt', operations: [] },
    outputTargets: [],
  };
}

describe('Prompt Workspace compile descriptor', () => {
  it('projects typed candidate fields and compile inputs without compiling them', () => {
    const workspace = promptWorkspace();
    const descriptor = describePromptWorkspaceCompile(workspace);

    expect(isPromptWorkspace(workspace)).toBe(true);
    expect(descriptor.available).toBe(true);
    expect(descriptor.candidateStale).toBe(false);
    expect(descriptor.request).toMatchObject({
      schema_name: 't3x/prompt',
      schema_version: 'v1',
      candidate: {
        manifest: { name: 'requirement-extractor' },
        messages: { user_task: { sequence: 2 } },
        runtime: { streaming: false },
        contract: { inputs: ['request'] },
      },
      input_source: { kind: 'fixture', label: 'Workspace fixture proposal', sourceCount: 1 },
      variable_values: { request: 'Build the preview.' },
      resource_contents: { response_schema: '{"type":"object"}' },
    });
    expect(descriptor.request.provenance_by_path['manifest/name']).toEqual([
      expect.objectContaining({ sourceId: 'workspace_prompt:manifest-name' }),
    ]);
  });

  it('invalidates the fingerprint when candidate input changes', () => {
    const workspace = promptWorkspace();
    const first = describePromptWorkspaceCompile(workspace);
    const changed = structuredClone(workspace);
    changed.schemaCandidate.fields[1]!.value = '3';

    expect(describePromptWorkspaceCompile(changed).fingerprint).not.toBe(first.fingerprint);
  });

  it('detects stale bound candidates and unavailable prompt versions', () => {
    const workspace = promptWorkspace();
    workspace.schemaCandidate.fields = [];
    workspace.schemaCandidate.summary = 'Schema binding changed. Regenerate the candidate.';

    expect(describePromptWorkspaceCompile(workspace).candidateStale).toBe(true);

    workspace.schemaBindings[0]!.version = 'v2';
    expect(describePromptWorkspaceCompile(workspace).available).toBe(false);
  });
});
