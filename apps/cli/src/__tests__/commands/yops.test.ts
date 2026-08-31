import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockClient = { proposeTransition: vi.fn() };
vi.mock('@t3x-dev/api-client', () => ({ createClient: vi.fn(() => mockClient) }));
const mockSpinner = { start: vi.fn(), stop: vi.fn(), succeed: vi.fn(), fail: vi.fn() };
vi.mock('ora', () => ({ default: vi.fn(() => mockSpinner) }));
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

vi.mock('node:fs', () => ({
  readFileSync: vi.fn((path: string) => {
    if (String(path).endsWith('.yaml')) {
      return 'yops:\n  - set:\n      path: trip/budget\n      value: 5000\n';
    }
    throw new Error(`unexpected path: ${path}`);
  }),
}));

import { Command } from 'commander';
import { registerYopsCommands } from '../../commands/yops.js';

function createProgram() {
  const program = new Command();
  program.exitOverride();
  registerYopsCommands(program);
  return program;
}

describe('yops apply', () => {
  beforeEach(() => vi.clearAllMocks());

  it('proposes file YOps through Transition authority', async () => {
    mockClient.proposeTransition.mockResolvedValue({ transition_id: 'trn_1' });

    await createProgram().parseAsync([
      'node',
      'test',
      'yops',
      'apply',
      'workspace_1',
      '-p',
      'proj_1',
      '--request-id',
      'req_1',
      '--file',
      'ops.yaml',
      '--if-revision',
      '7',
      '--why',
      'Refine budget',
    ]);

    expect(mockClient.proposeTransition).toHaveBeenCalledWith('proj_1', {
      kind: 'structured_yops',
      request_id: 'req_1',
      workspace_id: 'workspace_1',
      operations: [{ set: { path: 'trip/budget', value: 5000 } }],
      if_revision: 7,
      why: 'Refine budget',
    });
  });

  it('does not call the legacy Draft apply method', async () => {
    mockClient.proposeTransition.mockResolvedValue({ transition_id: 'trn_1' });

    await createProgram().parseAsync([
      'node',
      'test',
      'yops',
      'apply',
      'workspace_1',
      '-p',
      'proj_1',
      '--request-id',
      'req_1',
      '--file',
      'ops.yaml',
    ]);

    expect(mockClient.proposeTransition).toHaveBeenCalledOnce();
    expect('applyYOps' in mockClient).toBe(false);
  });
});
