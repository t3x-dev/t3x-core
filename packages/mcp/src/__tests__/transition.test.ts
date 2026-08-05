import { T3xApiError } from '@t3x-dev/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiClient, getApiClientMock, isApiBackendMock } = vi.hoisted(() => {
  const client = {
    proposeTransition: vi.fn(),
    inspectTransition: vi.fn(),
    verifyTransition: vi.fn(),
    attachTransitionStatement: vi.fn(),
  };
  return {
    apiClient: client,
    getApiClientMock: vi.fn(() => client),
    isApiBackendMock: vi.fn(() => true),
  };
});

vi.mock('../backend.js', () => ({
  getApiClient: getApiClientMock,
  isApiBackend: isApiBackendMock,
}));

import {
  API_BACKEND_REQUIRED,
  attachStatementDef,
  attachStatementHandler,
  inspectTransitionDef,
  inspectTransitionHandler,
  proposeTransitionDef,
  proposeTransitionHandler,
  verifyTransitionDef,
  verifyTransitionHandler,
} from '../tools/transition/index.js';

function parse(result: Awaited<ReturnType<typeof proposeTransitionHandler>>) {
  return JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  isApiBackendMock.mockReturnValue(true);
});

describe('Transition MCP tools', () => {
  it('defines exactly the four opt-in lifecycle adapters', () => {
    expect([
      proposeTransitionDef.name,
      inspectTransitionDef.name,
      verifyTransitionDef.name,
      attachStatementDef.name,
    ]).toEqual([
      'propose_transition',
      'inspect_transition',
      'verify_transition',
      'attach_statement',
    ]);
  });

  it('fails every Transition handler before validation on direct-storage mode', async () => {
    isApiBackendMock.mockReturnValue(false);
    for (const handler of [
      proposeTransitionHandler,
      inspectTransitionHandler,
      verifyTransitionHandler,
      attachStatementHandler,
    ]) {
      const result = await handler({});
      expect(result.isError).toBe(true);
      expect(parse(result)).toEqual({
        error: {
          code: API_BACKEND_REQUIRED,
          message:
            'Transition tools require T3X_MCP_BACKEND=api so authority stays at the API boundary.',
        },
      });
    }
    expect(getApiClientMock).not.toHaveBeenCalled();
  });

  it('maps the closed Proposal request without forwarding caller authority fields', async () => {
    apiClient.proposeTransition.mockResolvedValue({
      transition_id: 'trn_1',
      reused: false,
      view: { transition: { mode: 'transition' } },
    });

    const result = await proposeTransitionHandler({
      project_id: 'proj_1',
      request_id: 'proposal:1',
      workspace_id: 'ws_1',
      kind: 'structured_yops',
      operations: [{ set: { path: 'device/name', value: 'greenhouse' } }],
      why: 'Use the reviewed name.',
      if_revision: 2,
      actor: { kind: 'service', id: 'service:spoofed' },
      policy: { digest: 'sha256:spoofed' },
      observation_scope: { completeness: 'complete', sources: [] },
    });

    expect(result.isError).toBeUndefined();
    expect(apiClient.proposeTransition).toHaveBeenCalledWith('proj_1', {
      request_id: 'proposal:1',
      workspace_id: 'ws_1',
      kind: 'structured_yops',
      operations: [{ set: { path: 'device/name', value: 'greenhouse' } }],
      why: 'Use the reviewed name.',
      if_revision: 2,
    });
    expect(parse(result)).toMatchObject({ transition_id: 'trn_1', reused: false });
  });

  it('promotes a server-owned extraction candidate without forwarding operations', async () => {
    apiClient.proposeTransition.mockResolvedValue({
      transition_id: 'trn_2',
      reused: false,
      view: { transition: { mode: 'transition' } },
    });

    const result = await proposeTransitionHandler({
      project_id: 'proj_1',
      request_id: 'proposal:extraction:1',
      workspace_id: 'ws_1',
      kind: 'structured_yops',
      extraction_candidate_id: 'candidate:abc',
      if_revision: 4,
    });

    expect(result.isError).toBeUndefined();
    expect(apiClient.proposeTransition).toHaveBeenCalledWith('proj_1', {
      request_id: 'proposal:extraction:1',
      workspace_id: 'ws_1',
      kind: 'structured_yops',
      extraction_candidate_id: 'candidate:abc',
      if_revision: 4,
    });
  });

  it('rejects ambiguous structured_yops input with both operations and a candidate', async () => {
    const result = await proposeTransitionHandler({
      project_id: 'proj_1',
      request_id: 'proposal:ambiguous',
      workspace_id: 'ws_1',
      kind: 'structured_yops',
      extraction_candidate_id: 'candidate:abc',
      operations: [{ set: { path: 'device/name', value: 'spoofed' } }],
    });

    expect(result.isError).toBe(true);
    expect(parse(result)).toMatchObject({
      error: {
        code: 'INVALID_ARGUMENT',
        message: expect.stringContaining('exactly one'),
      },
    });
    expect(apiClient.proposeTransition).not.toHaveBeenCalled();
  });

  it('maps inspect and verify without collapsing the task-oriented view', async () => {
    apiClient.inspectTransition.mockResolvedValue({
      transition_id: 'trn_1',
      view: { transition: { mode: 'transition', checks: { replay: { outcomes: ['verified'] } } } },
    });
    apiClient.verifyTransition.mockResolvedValue({
      transition_id: 'trn_1',
      reused: false,
      view: { transition: { mode: 'transition', capabilities: { accept: 'not_evaluated' } } },
      statements: [{ source: 'server:replay' }],
      operational_results: [{ source: 'runner', outcome: 'failed', code: 'TIMEOUT' }],
    });

    const inspected = await inspectTransitionHandler({
      project_id: 'proj_1',
      transition_id: 'trn_1',
    });
    const verified = await verifyTransitionHandler({
      project_id: 'proj_1',
      transition_id: 'trn_1',
      request_id: 'verify:1',
    });

    expect(apiClient.inspectTransition).toHaveBeenCalledWith('proj_1', 'trn_1');
    expect(apiClient.verifyTransition).toHaveBeenCalledWith('proj_1', 'trn_1', {
      request_id: 'verify:1',
    });
    expect(parse(inspected)).toMatchObject({ view: { transition: { mode: 'transition' } } });
    expect(parse(verified)).toMatchObject({
      statements: [{ source: 'server:replay' }],
      operational_results: [{ outcome: 'failed', code: 'TIMEOUT' }],
    });
  });

  it('attaches only predicate content and graph roles, never an issuer envelope', async () => {
    apiClient.attachTransitionStatement.mockResolvedValue({
      transition_id: 'trn_1',
      reused: false,
      view: { transition: { mode: 'transition' } },
    });

    await attachStatementHandler({
      project_id: 'proj_1',
      transition_id: 'trn_1',
      request_id: 'statement:1',
      predicate_type: 'example.dev/review/v1',
      predicate: { outcome: 'reviewed' },
      subjects: ['proposal'],
      actor: { kind: 'service', id: 'service:spoofed' },
      issuer: { kind: 'service', id: 'service:spoofed' },
      statement: { schema: 't3x/statement/v1' },
    });

    expect(apiClient.attachTransitionStatement).toHaveBeenCalledWith('proj_1', 'trn_1', {
      request_id: 'statement:1',
      predicate_type: 'example.dev/review/v1',
      predicate: { outcome: 'reviewed' },
      subjects: ['proposal'],
    });
  });

  it('preserves API scope and project errors as structured MCP error codes', async () => {
    apiClient.inspectTransition.mockRejectedValue(
      new T3xApiError('FORBIDDEN', 'Missing transition:inspect scope', 403, {
        protocol_code: 'TRANSITION_SCOPE_DENIED',
      })
    );

    const result = await inspectTransitionHandler({
      project_id: 'proj_1',
      transition_id: 'trn_1',
    });

    expect(result.isError).toBe(true);
    expect(parse(result)).toEqual({
      error: {
        code: 'FORBIDDEN',
        message: 'Missing transition:inspect scope',
        status: 403,
        details: { protocol_code: 'TRANSITION_SCOPE_DENIED' },
      },
    });
  });
});
