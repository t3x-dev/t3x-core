import { T3xApiError } from '@t3x-dev/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiClient, getApiClientMock, isApiBackendMock } = vi.hoisted(() => {
  const client = {
    proposeTransition: vi.fn(),
    inspectTransition: vi.fn(),
    verifyTransition: vi.fn(),
    attachTransitionStatement: vi.fn(),
    decideTransition: vi.fn(),
    commitTransition: vi.fn(),
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
  commitTransitionDef,
  commitTransitionHandler,
  decideTransitionDef,
  decideTransitionHandler,
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

const REVIEW_PRECONDITION = {
  workspace_revision: 3,
  ref_name: 'main',
  ref_head: null,
  effect_digest: `sha256:${'a'.repeat(64)}`,
  proposal_digest: `sha256:${'b'.repeat(64)}`,
  statement_digests: [`sha256:${'c'.repeat(64)}`],
  policy_digest: `sha256:${'d'.repeat(64)}`,
  review_digest: `sha256:${'e'.repeat(64)}`,
};

const SOURCE_ARTIFACT = {
  format: 't3x.dev/workspace-source-artifact/v1',
  root_path: 'requirements/device.yaml',
  resources: [
    {
      path: 'requirements/device.yaml',
      material_id: 'material:source:device',
      content_hash: `sha256:${'1'.repeat(64)}`,
    },
  ],
};

const SOURCE_ROOT = {
  material_id: 'material:source:root',
  content_hash: `sha256:${'2'.repeat(64)}`,
};

beforeEach(() => {
  vi.clearAllMocks();
  isApiBackendMock.mockReturnValue(true);
});

describe('Transition MCP tools', () => {
  it('defines exactly the six opt-in lifecycle adapters', () => {
    expect([
      proposeTransitionDef.name,
      inspectTransitionDef.name,
      verifyTransitionDef.name,
      attachStatementDef.name,
      decideTransitionDef.name,
      commitTransitionDef.name,
    ]).toEqual([
      'propose_transition',
      'inspect_transition',
      'verify_transition',
      'attach_statement',
      'decide_transition',
      'commit_transition',
    ]);
  });

  it('fails every Transition handler before validation on direct-storage mode', async () => {
    isApiBackendMock.mockReturnValue(false);
    for (const handler of [
      proposeTransitionHandler,
      inspectTransitionHandler,
      verifyTransitionHandler,
      attachStatementHandler,
      decideTransitionHandler,
      commitTransitionHandler,
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

  it('maps exact-source imports through the closed Proposal request', async () => {
    apiClient.proposeTransition.mockResolvedValue({
      transition_id: 'trn_1',
      reused: false,
      view: { transition: { mode: 'transition' } },
    });

    const result = await proposeTransitionHandler({
      project_id: 'proj_1',
      request_id: 'proposal:import',
      workspace_id: 'ws_1',
      kind: 'exact_source_import',
      artifact: SOURCE_ARTIFACT,
      root: SOURCE_ROOT,
      why: 'Import reviewed source material.',
      if_revision: 7,
      actor: { kind: 'service', id: 'service:spoofed' },
    });

    expect(result.isError).toBeUndefined();
    expect(apiClient.proposeTransition).toHaveBeenCalledWith('proj_1', {
      request_id: 'proposal:import',
      workspace_id: 'ws_1',
      kind: 'exact_source_import',
      artifact: SOURCE_ARTIFACT,
      root: SOURCE_ROOT,
      why: 'Import reviewed source material.',
      if_revision: 7,
    });
  });

  it('maps exact-source edits without accepting server-derived root material facts', async () => {
    const operations = [
      {
        op: 'replace_scalar',
        path: ['frontmatter', 'title'],
        expect: 'Draft title',
        value: 'Reviewed title',
      },
    ];
    apiClient.proposeTransition.mockResolvedValue({
      transition_id: 'trn_1',
      reused: false,
      view: { transition: { mode: 'transition' } },
    });

    const result = await proposeTransitionHandler({
      project_id: 'proj_1',
      request_id: 'proposal:edit',
      workspace_id: 'ws_1',
      kind: 'exact_source_edit',
      artifact: SOURCE_ARTIFACT,
      operations,
      root: { material_id: 'caller:root-spoof' },
      observation_scope: { completeness: 'complete', sources: [] },
    });

    expect(result.isError).toBeUndefined();
    expect(apiClient.proposeTransition).toHaveBeenCalledWith('proj_1', {
      request_id: 'proposal:edit',
      workspace_id: 'ws_1',
      kind: 'exact_source_edit',
      artifact: SOURCE_ARTIFACT,
      operations,
    });
  });

  it('maps exact-source reverts from a CommitV2 id only', async () => {
    apiClient.proposeTransition.mockResolvedValue({
      transition_id: 'trn_1',
      reused: false,
      view: { transition: { mode: 'transition' } },
    });

    const result = await proposeTransitionHandler({
      project_id: 'proj_1',
      request_id: 'proposal:revert',
      workspace_id: 'ws_1',
      kind: 'exact_source_revert',
      commit_id: `sha256:${'3'.repeat(64)}`,
      artifact: SOURCE_ARTIFACT,
      operations: [{ replace_scalar: { path: ['spoofed'], value: 'ignored' } }],
    });

    expect(result.isError).toBeUndefined();
    expect(apiClient.proposeTransition).toHaveBeenCalledWith('proj_1', {
      request_id: 'proposal:revert',
      workspace_id: 'ws_1',
      kind: 'exact_source_revert',
      commit_id: `sha256:${'3'.repeat(64)}`,
    });
  });

  it('rejects incomplete exact-source proposal requests before touching the API client', async () => {
    const missingImportSelector = await proposeTransitionHandler({
      project_id: 'proj_1',
      request_id: 'proposal:import:missing',
      workspace_id: 'ws_1',
      kind: 'exact_source_import',
      artifact: SOURCE_ARTIFACT,
    });
    const missingRevertCommit = await proposeTransitionHandler({
      project_id: 'proj_1',
      request_id: 'proposal:revert:missing',
      workspace_id: 'ws_1',
      kind: 'exact_source_revert',
    });

    expect(missingImportSelector.isError).toBe(true);
    expect(missingRevertCommit.isError).toBe(true);
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

  it('rejects Statement attachment without valid graph roles before touching the API client', async () => {
    const missingSubjects = await attachStatementHandler({
      project_id: 'proj_1',
      transition_id: 'trn_1',
      request_id: 'statement:missing-subjects',
      predicate_type: 'example.dev/review/v1',
      predicate: { outcome: 'reviewed' },
      subjects: [],
    });
    const invalidSubject = await attachStatementHandler({
      project_id: 'proj_1',
      transition_id: 'trn_1',
      request_id: 'statement:invalid-subject',
      predicate_type: 'example.dev/review/v1',
      predicate: { outcome: 'reviewed' },
      subjects: ['actor'],
    });
    const missingPredicate = await attachStatementHandler({
      project_id: 'proj_1',
      transition_id: 'trn_1',
      request_id: 'statement:missing-predicate',
      predicate_type: 'example.dev/review/v1',
      subjects: ['effect'],
    });

    expect(missingSubjects.isError).toBe(true);
    expect(invalidSubject.isError).toBe(true);
    expect(missingPredicate.isError).toBe(true);
    expect(apiClient.attachTransitionStatement).not.toHaveBeenCalled();
  });

  it('records Decisions from review preconditions without forwarding caller authority fields', async () => {
    apiClient.decideTransition.mockResolvedValue({
      transition_id: 'trn_1',
      reused: false,
      decision_digest: `sha256:${'f'.repeat(64)}`,
      review_digest: REVIEW_PRECONDITION.review_digest,
      decision: { schema: 't3x/statement/v1' },
      view: { transition: { mode: 'transition' } },
    });

    const result = await decideTransitionHandler({
      project_id: 'proj_1',
      transition_id: 'trn_1',
      request_id: 'decision:1',
      outcome: 'accepted',
      precondition: REVIEW_PRECONDITION,
      actor: { kind: 'service', id: 'service:spoofed' },
      policy: { digest: 'sha256:spoofed' },
      observation_scope: { completeness: 'complete', sources: [] },
    });

    expect(result.isError).toBeUndefined();
    expect(apiClient.decideTransition).toHaveBeenCalledWith('proj_1', 'trn_1', {
      request_id: 'decision:1',
      outcome: 'accepted',
      precondition: REVIEW_PRECONDITION,
    });
    expect(parse(result)).toMatchObject({
      transition_id: 'trn_1',
      decision_digest: `sha256:${'f'.repeat(64)}`,
    });
  });

  it('requires override rationale and rejects rationale on non-override Decisions', async () => {
    const missing = await decideTransitionHandler({
      project_id: 'proj_1',
      transition_id: 'trn_1',
      request_id: 'decision:override',
      outcome: 'overridden',
      precondition: REVIEW_PRECONDITION,
    });
    const extra = await decideTransitionHandler({
      project_id: 'proj_1',
      transition_id: 'trn_1',
      request_id: 'decision:accept',
      outcome: 'accepted',
      rationale: 'not allowed',
      precondition: REVIEW_PRECONDITION,
    });

    expect(missing.isError).toBe(true);
    expect(extra.isError).toBe(true);
    expect(apiClient.decideTransition).not.toHaveBeenCalled();
  });

  it('commits accepted Decisions through canonical API CAS without forwarding workspace facts', async () => {
    apiClient.commitTransition.mockResolvedValue({
      transition_id: 'trn_1',
      reused: false,
      commit_digest: `sha256:${'1'.repeat(64)}`,
      commit: { schema: 't3x/commit/v2' },
      transition: { mode: 'transition' },
      workspace: { source_commit_id: 'sha256:source' },
    });

    const result = await commitTransitionHandler({
      project_id: 'proj_1',
      transition_id: 'trn_1',
      request_id: 'commit:1',
      decision_digest: `sha256:${'f'.repeat(64)}`,
      expected_head: null,
      actor: { kind: 'service', id: 'service:spoofed' },
      workspace_projection: { forged: true },
      policy: { digest: 'sha256:spoofed' },
    });

    expect(result.isError).toBeUndefined();
    expect(apiClient.commitTransition).toHaveBeenCalledWith('proj_1', 'trn_1', {
      request_id: 'commit:1',
      decision_digest: `sha256:${'f'.repeat(64)}`,
      expected_head: null,
    });
    expect(parse(result)).toMatchObject({
      transition_id: 'trn_1',
      commit_digest: `sha256:${'1'.repeat(64)}`,
      workspace: { source_commit_id: 'sha256:source' },
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
