import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockClient = vi.hoisted(() => ({
  workspaces: {
    authoring: {
      read: vi.fn(),
      publish: vi.fn(),
      publishSchema: vi.fn(),
      prepareReconciliation: vi.fn(),
      decideReconciliation: vi.fn(),
    },
  },
}));
vi.mock('@t3x-dev/api-client', () => ({ createClient: vi.fn(() => mockClient) }));
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

import { registerWorkspaceCommands } from '../../commands/workspace.js';

function program() {
  const result = new Command();
  result.exitOverride();
  registerWorkspaceCommands(result);
  return result;
}

const guarded = [
  '--request-id',
  'request-1',
  '--expected-workspace-revision',
  '5',
  '--expected-revision',
  '3',
  '--empty-head',
];

describe('Workspace CLI guarded writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    mockClient.workspaces.authoring.publish.mockResolvedValue({ kind: 'published' });
    mockClient.workspaces.authoring.publishSchema.mockResolvedValue({ status: 'applied' });
    mockClient.workspaces.authoring.prepareReconciliation.mockResolvedValue({
      preparationDigest: `sha256:${'a'.repeat(64)}`,
    });
    mockClient.workspaces.authoring.decideReconciliation.mockResolvedValue({ kind: 'reconciled' });
  });

  it('sends Draft operations with the complete command facts', async () => {
    const operations = [{ set: { path: 'product/title', value: 'T3X' } }];
    await program().parseAsync([
      'node',
      'test',
      'workspace',
      'edit',
      'ws-1',
      '-p',
      'project-1',
      ...guarded,
      '--operations-json',
      JSON.stringify(operations),
    ]);
    expect(mockClient.workspaces.authoring.publish).toHaveBeenCalledWith('project-1', 'ws-1', {
      request_id: 'request-1',
      expected_workspace_revision: 5,
      expected_revision: 3,
      expected_ref_head: null,
      operations,
    });
  });

  it('uses the same Workspace command facts for an exact Schema action', async () => {
    const settings = {
      action: 'add_slot',
      nodePath: 'product',
      name: 'advantage',
      definition: { type: 'string' },
      intent: 'Add advantage',
    };
    await program().parseAsync([
      'node',
      'test',
      'workspace',
      'schema',
      'ws-1',
      '-p',
      'project-1',
      ...guarded,
      '--settings-json',
      JSON.stringify(settings),
    ]);
    expect(mockClient.workspaces.authoring.publishSchema).toHaveBeenCalledWith(
      'project-1',
      'ws-1',
      {
        request_id: 'request-1',
        expected_workspace_revision: 5,
        expected_revision: 3,
        expected_ref_head: null,
        settings,
      }
    );
  });

  it('previews and explicitly adopts one revision-bound branch synchronization', async () => {
    const head = `sha256:${'b'.repeat(64)}`;
    const digest = `sha256:${'a'.repeat(64)}`;
    await program().parseAsync([
      'node',
      'test',
      'workspace',
      'sync',
      'preview',
      'ws-1',
      '-p',
      'project-1',
      '--request-id',
      'preview-1',
      '--expected-workspace-revision',
      '5',
      '--expected-head',
      head,
    ]);
    expect(mockClient.workspaces.authoring.prepareReconciliation).toHaveBeenCalledWith(
      'project-1',
      'ws-1',
      { expected_workspace_revision: 5, expected_ref_head: head }
    );
    await program().parseAsync([
      'node',
      'test',
      'workspace',
      'sync',
      'adopt',
      'ws-1',
      '-p',
      'project-1',
      '--request-id',
      'adopt-1',
      '--expected-workspace-revision',
      '5',
      '--expected-head',
      head,
      '--preparation-digest',
      digest,
    ]);
    expect(mockClient.workspaces.authoring.decideReconciliation).toHaveBeenCalledWith(
      'project-1',
      'ws-1',
      {
        request_id: 'adopt-1',
        expected_workspace_revision: 5,
        expected_ref_head: head,
        preparation_digest: digest,
        action: 'adopt',
      }
    );
    const conflictId = `sha256:${'c'.repeat(64)}`;
    await program().parseAsync([
      'node',
      'test',
      'workspace',
      'sync',
      'resolve',
      'ws-1',
      '-p',
      'project-1',
      '--request-id',
      'resolve-1',
      '--expected-workspace-revision',
      '5',
      '--expected-head',
      head,
      '--preparation-digest',
      digest,
      '--resolutions-json',
      JSON.stringify([{ conflict_id: conflictId, choice: 'ours' }]),
    ]);
    expect(mockClient.workspaces.authoring.decideReconciliation).toHaveBeenLastCalledWith(
      'project-1',
      'ws-1',
      {
        request_id: 'resolve-1',
        expected_workspace_revision: 5,
        expected_ref_head: head,
        preparation_digest: digest,
        action: 'resolve',
        resolutions: [{ conflict_id: conflictId, choice: 'ours' }],
      }
    );
  });
});
