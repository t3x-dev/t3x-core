/**
 * CLI Transition command tests.
 */

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockClient, createClientMock } = vi.hoisted(() => ({
  mockClient: {
    proposeTransition: vi.fn(),
    inspectTransition: vi.fn(),
    verifyTransition: vi.fn(),
    decideTransition: vi.fn(),
    commitTransition: vi.fn(),
  },
  createClientMock: vi.fn(),
}));

createClientMock.mockImplementation(() => mockClient);

vi.mock('@t3x-dev/api-client', () => ({
  createClient: createClientMock,
}));

const mockSpinner = { start: vi.fn(), stop: vi.fn(), succeed: vi.fn(), fail: vi.fn() };
vi.mock('ora', () => ({
  default: vi.fn(() => mockSpinner),
}));

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});
const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

import { registerTransitionCommands } from '../../commands/transition.js';

const PRECONDITION = {
  workspace_revision: 3,
  ref_name: 'main',
  ref_head: null,
  effect_digest: `sha256:${'a'.repeat(64)}`,
  proposal_digest: `sha256:${'b'.repeat(64)}`,
  statement_digests: [`sha256:${'c'.repeat(64)}`],
  policy_digest: `sha256:${'d'.repeat(64)}`,
};

function createProgram() {
  const program = new Command();
  program.exitOverride();
  registerTransitionCommands(program);
  return program;
}

describe('registerTransitionCommands', () => {
  const originalApiKey = process.env.T3X_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.T3X_API_KEY;
    mockClient.proposeTransition.mockResolvedValue({ transition_id: 'trn_1', reused: false });
    mockClient.inspectTransition.mockResolvedValue({ transition_id: 'trn_1', view: {} });
    mockClient.verifyTransition.mockResolvedValue({
      transition_id: 'trn_1',
      reused: false,
      statements: [],
      operational_results: [],
    });
    mockClient.decideTransition.mockResolvedValue({
      transition_id: 'trn_1',
      reused: false,
      decision_digest: `sha256:${'e'.repeat(64)}`,
      review_digest: `sha256:${'f'.repeat(64)}`,
    });
    mockClient.commitTransition.mockResolvedValue({
      transition_id: 'trn_1',
      reused: false,
      commit_digest: `sha256:${'0'.repeat(64)}`,
    });
  });

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.T3X_API_KEY;
    else process.env.T3X_API_KEY = originalApiKey;
  });

  it('proposes structured YOps through the canonical API client', async () => {
    const operations = [{ set: { path: 'device/name', value: 'greenhouse' } }];
    const program = createProgram();

    await program.parseAsync([
      'node',
      'test',
      'transition',
      'propose',
      'ws_1',
      '-p',
      'proj_1',
      '--request-id',
      'proposal:1',
      '--operations-json',
      JSON.stringify(operations),
      '--why',
      'Use reviewed operations',
      '--if-revision',
      '4',
    ]);

    expect(mockClient.proposeTransition).toHaveBeenCalledWith('proj_1', {
      request_id: 'proposal:1',
      workspace_id: 'ws_1',
      kind: 'structured_yops',
      operations,
      why: 'Use reviewed operations',
      if_revision: 4,
    });
  });

  it('promotes an extraction candidate without forwarding operations', async () => {
    const program = createProgram();

    await program.parseAsync([
      'node',
      'test',
      'transition',
      'propose',
      'ws_1',
      '-p',
      'proj_1',
      '--request-id',
      'proposal:candidate',
      '--extraction-candidate-id',
      'candidate_1',
    ]);

    expect(mockClient.proposeTransition).toHaveBeenCalledWith('proj_1', {
      request_id: 'proposal:candidate',
      workspace_id: 'ws_1',
      kind: 'structured_yops',
      extraction_candidate_id: 'candidate_1',
    });
  });

  it('maps inspect and verify to project-scoped Transition endpoints', async () => {
    const program = createProgram();

    await program.parseAsync(['node', 'test', 'transition', 'inspect', 'trn_1', '-p', 'proj_1']);
    await program.parseAsync([
      'node',
      'test',
      'transition',
      'verify',
      'trn_1',
      '-p',
      'proj_1',
      '--request-id',
      'verify:1',
    ]);

    expect(mockClient.inspectTransition).toHaveBeenCalledWith('proj_1', 'trn_1');
    expect(mockClient.verifyTransition).toHaveBeenCalledWith('proj_1', 'trn_1', {
      request_id: 'verify:1',
    });
  });

  it('decides from a review precondition without caller-owned authority fields', async () => {
    const program = createProgram();

    await program.parseAsync([
      'node',
      'test',
      'transition',
      'decide',
      'trn_1',
      '-p',
      'proj_1',
      '--request-id',
      'decision:1',
      '--outcome',
      'accepted',
      '--precondition-json',
      JSON.stringify(PRECONDITION),
    ]);

    expect(mockClient.decideTransition).toHaveBeenCalledWith('proj_1', 'trn_1', {
      request_id: 'decision:1',
      outcome: 'accepted',
      precondition: PRECONDITION,
    });
  });

  it('commits with exact expected-head CAS', async () => {
    const program = createProgram();

    await program.parseAsync([
      'node',
      'test',
      'transition',
      'commit',
      'trn_1',
      '-p',
      'proj_1',
      '--request-id',
      'commit:1',
      '--decision-digest',
      `sha256:${'e'.repeat(64)}`,
      '--empty-head',
    ]);

    expect(mockClient.commitTransition).toHaveBeenCalledWith('proj_1', 'trn_1', {
      request_id: 'commit:1',
      decision_digest: `sha256:${'e'.repeat(64)}`,
      expected_head: null,
    });
  });

  it('fails closed for ambiguous propose and commit head inputs', async () => {
    let program = createProgram();
    await program.parseAsync([
      'node',
      'test',
      'transition',
      'propose',
      'ws_1',
      '-p',
      'proj_1',
      '--request-id',
      'proposal:bad',
      '--operations-json',
      '[{}]',
      '--extraction-candidate-id',
      'candidate_1',
    ]);
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockClient.proposeTransition).not.toHaveBeenCalled();

    vi.clearAllMocks();
    program = createProgram();
    await program.parseAsync([
      'node',
      'test',
      'transition',
      'commit',
      'trn_1',
      '-p',
      'proj_1',
      '--request-id',
      'commit:bad',
      '--decision-digest',
      `sha256:${'e'.repeat(64)}`,
      '--expected-head',
      `sha256:${'0'.repeat(64)}`,
      '--empty-head',
    ]);
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockClient.commitTransition).not.toHaveBeenCalled();
  });
});
