import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockClient, createClientMock } = vi.hoisted(() => ({
  mockClient: { commitTransition: vi.fn() },
  createClientMock: vi.fn(),
}));

createClientMock.mockImplementation(() => mockClient);
vi.mock('@t3x-dev/api-client', () => ({ createClient: createClientMock }));

const mockSpinner = { start: vi.fn(), stop: vi.fn(), succeed: vi.fn(), fail: vi.fn() };
vi.mock('ora', () => ({ default: vi.fn(() => mockSpinner) }));
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});
const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

import { Command } from 'commander';
import { registerCommitCommand } from '../../commands/commit.js';

function createProgram() {
  const program = new Command();
  program.exitOverride();
  registerCommitCommand(program);
  return program;
}

describe('registerCommitCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.T3X_API_KEY;
  });

  it('commits an accepted Transition with exact expected-head CAS', async () => {
    mockClient.commitTransition.mockResolvedValue({ transition_id: 'trn_1' });

    await createProgram().parseAsync([
      'node',
      'test',
      'commit',
      'trn_1',
      '-p',
      'proj_1',
      '--request-id',
      'req_1',
      '--decision-digest',
      'sha256:decision',
      '--expected-head',
      'sha256:head',
    ]);

    expect(mockClient.commitTransition).toHaveBeenCalledWith('proj_1', 'trn_1', {
      request_id: 'req_1',
      decision_digest: 'sha256:decision',
      expected_head: 'sha256:head',
    });
  });

  it('supports an explicitly empty target ref', async () => {
    mockClient.commitTransition.mockResolvedValue({ transition_id: 'trn_1' });

    await createProgram().parseAsync([
      'node',
      'test',
      'commit',
      'trn_1',
      '-p',
      'proj_1',
      '--request-id',
      'req_1',
      '--decision-digest',
      'sha256:decision',
      '--empty-head',
    ]);

    expect(mockClient.commitTransition).toHaveBeenCalledWith(
      'proj_1',
      'trn_1',
      expect.objectContaining({ expected_head: null })
    );
  });

  it('passes bearer auth via getClientWithAuth', async () => {
    process.env.T3X_API_KEY = 't3xk_test';
    mockClient.commitTransition.mockResolvedValue({ transition_id: 'trn_1' });

    await createProgram().parseAsync([
      'node',
      'test',
      'commit',
      'trn_1',
      '-p',
      'proj_1',
      '--request-id',
      'req_1',
      '--decision-digest',
      'sha256:decision',
      '--empty-head',
    ]);

    expect(createClientMock).toHaveBeenCalledWith({
      baseUrl: 'http://localhost:8000/api',
      headers: { Authorization: 'Bearer t3xk_test' },
    });
  });

  it('rejects a commit without an explicit expected head', async () => {
    await createProgram().parseAsync([
      'node',
      'test',
      'commit',
      'trn_1',
      '-p',
      'proj_1',
      '--request-id',
      'req_1',
      '--decision-digest',
      'sha256:decision',
    ]);

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockClient.commitTransition).not.toHaveBeenCalled();
  });
});
