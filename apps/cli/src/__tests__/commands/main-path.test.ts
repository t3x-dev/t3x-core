import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockClient, createClientMock } = vi.hoisted(() => ({
  mockClient: {
    workspaces: { createExtractionProposal: vi.fn() },
    proposeTransition: vi.fn(),
    commitTransition: vi.fn(),
  },
  createClientMock: vi.fn(),
}));

createClientMock.mockImplementation(() => mockClient);
vi.mock('@t3x-dev/api-client', () => ({ createClient: createClientMock }));
const mockSpinner = { start: vi.fn(), stop: vi.fn(), succeed: vi.fn(), fail: vi.fn() };
vi.mock('ora', () => ({ default: vi.fn(() => mockSpinner) }));
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() => 'yops:\n  - set:\n      path: trip/budget\n      value: 5000\n'),
}));
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

import { Command } from 'commander';
import { registerCommitCommand } from '../../commands/commit.js';
import { registerExtractCommands } from '../../commands/extract.js';
import { registerYopsCommands } from '../../commands/yops.js';

function createProgram() {
  const program = new Command();
  program.exitOverride();
  registerExtractCommands(program);
  registerYopsCommands(program);
  registerCommitCommand(program);
  return program;
}

describe('canonical main path smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.T3X_API_KEY = 't3xk_test';
  });

  it('uses Workspace extraction, Transition proposal, and exact-head commit', async () => {
    mockClient.workspaces.createExtractionProposal.mockResolvedValue({
      candidate_id: 'candidate_1',
      workspace: { id: 'workspace_1', revision: 4 },
    });
    mockClient.proposeTransition.mockResolvedValue({ transition_id: 'trn_1' });
    mockClient.commitTransition.mockResolvedValue({ transition_id: 'trn_1' });

    await createProgram().parseAsync([
      'node',
      'test',
      'extract',
      '-p',
      'proj_1',
      '--workspace',
      'workspace_1',
      '--source-thread',
      'conv_1',
      '--turn-hash',
      'sha256:turn-1',
    ]);
    await createProgram().parseAsync([
      'node',
      'test',
      'yops',
      'apply',
      'workspace_1',
      '-p',
      'proj_1',
      '--request-id',
      'req_propose',
      '--file',
      'ops.yaml',
    ]);
    await createProgram().parseAsync([
      'node',
      'test',
      'commit',
      'trn_1',
      '-p',
      'proj_1',
      '--request-id',
      'req_commit',
      '--decision-digest',
      'sha256:decision',
      '--expected-head',
      'sha256:head',
    ]);

    expect(mockClient.workspaces.createExtractionProposal).toHaveBeenCalledOnce();
    expect(mockClient.proposeTransition).toHaveBeenCalledOnce();
    expect(mockClient.commitTransition).toHaveBeenCalledOnce();
    expect(createClientMock).toHaveBeenCalledTimes(3);
  });
});
