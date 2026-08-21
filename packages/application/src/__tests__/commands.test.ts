import {
  createAcceptancePolicyResource,
  createYOpsEffect,
  createYOpsState,
  type ProposalStatement,
  parseAcceptancePolicy,
} from '@t3x-dev/core';
import {
  describeProtocolObject,
  type Effect,
  type ProtocolValue,
  parseProposalStatement,
  parseStatement,
  type State,
} from '@t3x-dev/transition';
import { describe, expect, it, vi } from 'vitest';
import {
  attachTransitionStatementCommand,
  proposeTransitionCommand,
  TransitionApplicationRequestConflictError,
  type TransitionExternalStatementProvider,
  type TransitionNativeStatementProvider,
  TransitionPredicateNotAllowedError,
  type TransitionStatementRecordInput,
  verifyTransitionCommand,
} from '../transition/commands';
import type { TransitionActorRef, TransitionInspectionGraph } from '../transition/inspect';

const REQUEST_DIGEST = `sha256:${'b'.repeat(64)}` as const;

function transitionGraph(input?: { falseReplay?: boolean }): {
  base: State;
  result: State;
  effect: Effect;
  proposal: ProposalStatement;
} {
  const base = createYOpsState({ name: 'before' });
  const valid = createYOpsEffect({
    base,
    operations: [{ set: { path: 'name', value: 'after' } }],
    expectedBase: describeProtocolObject(base),
  });
  const result = input?.falseReplay
    ? createYOpsState({ name: 'not-the-replayed-result' })
    : valid.result;
  const effect = input?.falseReplay
    ? { ...valid.effect, result: describeProtocolObject(result) }
    : valid.effect;
  const proposal = parseProposalStatement({
    schema: 't3x/statement/v1',
    subjects: [describeProtocolObject(effect)],
    actor: { kind: 'agent', id: 'agent:planner' },
    predicateType: 't3x.proposal/v1',
    predicate: {
      intent: { mode: 'inferred', value: 'Rename the record', evidence: [] },
      rationale: { mode: 'authored', value: 'Requested in review', evidence: [] },
    },
  });
  return { base, result, effect, proposal };
}

function graph(input?: { falseReplay?: boolean }): TransitionInspectionGraph {
  const subject = transitionGraph(input);
  return {
    membership: {
      transitionId: 'trn_00000000000000000000000000000001',
      projectId: 'project_1',
      workspaceId: 'workspace_1',
      workspaceRevision: 7,
      refName: 'main',
      refHead: null,
      requestKind: 'structured_yops',
      requestId: 'request_1',
      requestCanonicalJson: '{"kind":"structured_yops"}',
      effectDigest: describeProtocolObject(subject.effect).digest,
      proposalDigest: describeProtocolObject(subject.proposal).digest,
      createdAt: '2026-08-17T00:00:00.000Z',
    },
    preparation: { canonicalJson: '{"schema":"test/preparation"}' },
    base: subject.base,
    result: subject.result,
    effect: subject.effect,
    proposal: subject.proposal,
    observations: [],
  };
}

function policyDigest() {
  return createAcceptancePolicyResource({
    uri: 't3x://project/policies/default',
    policy: parseAcceptancePolicy({
      schema: 't3x.dev/acceptance-policy/v1',
      version: 1,
      authorization: {
        decide: { actors: { mode: 'any' } },
        override: { actors: { mode: 'any' } },
        allowSelfApproval: false,
      },
      claims: {
        intent: {
          allowedModes: ['authored', 'inferred', 'stated', 'unspecified'],
          minimumEvidence: 0,
          humanConfirmation: 'not_required',
        },
        rationale: {
          allowedModes: ['authored', 'inferred', 'stated', 'unspecified'],
          minimumEvidence: 0,
          humanConfirmation: 'not_required',
        },
      },
      checks: {
        replay: {
          issuers: { mode: 'any' },
          tools: { mode: 'any' },
          environments: { mode: 'any' },
        },
        validation: {
          requirement: 'optional',
          issuers: { mode: 'any' },
          tools: { mode: 'any' },
          environments: { mode: 'any' },
          profiles: { mode: 'any' },
          schemas: { mode: 'any' },
          contexts: { mode: 'any' },
        },
        humanConfirmation: { issuers: { mode: 'any' } },
      },
      override: {
        allowClaimFailures: false,
        allowFailedValidation: true,
        allowMissingHumanConfirmation: false,
        allowMissingValidation: true,
      },
    }),
  }).digest;
}

function recordedMembership(input: TransitionStatementRecordInput) {
  return {
    statementDigest: describeProtocolObject(input.statement).digest,
    source: input.source,
    issuer: input.issuer,
    requestId: input.requestId,
    createdAt: '2026-08-17T00:00:00.000Z',
  };
}

describe('transition commands', () => {
  it('rejects reused propose request ids with different canonical digests', async () => {
    const actor: TransitionActorRef = { kind: 'human', id: 'human:maintainer' };

    await expect(
      proposeTransitionCommand({
        projectId: 'project_1',
        requestId: 'request_1',
        actor,
        request: {
          kind: 'structured_yops',
          workspaceId: 'workspace_1',
          operations: [{ op: 'set', path: ['name'], value: 'after' }],
        },
        ports: {
          canonicalTransitionRequest: () => ({
            canonicalJson: '{"operation":"test"}',
            digest: REQUEST_DIGEST,
          }),
          findTransitionProposalByRequest: vi.fn(async () => ({
            transitionId: 'trn_00000000000000000000000000000001',
            requestDigest: `sha256:${'c'.repeat(64)}`,
          })),
          buildProposal: vi.fn(),
          materializeTransitionProposal: vi.fn(),
          inspectTransition: vi.fn(),
        },
      })
    ).rejects.toBeInstanceOf(TransitionApplicationRequestConflictError);
  });

  it('canonicalizes exact source proposal facts before idempotency lookup', async () => {
    const actor: TransitionActorRef = { kind: 'human', id: 'human:maintainer' };
    const canonicalTransitionRequest = vi.fn(() => ({
      canonicalJson: '{"operation":"test"}',
      digest: REQUEST_DIGEST,
    }));
    const subject = transitionGraph();

    const result = await proposeTransitionCommand({
      projectId: 'project_1',
      requestId: 'request_1',
      actor,
      request: {
        kind: 'exact_source_import',
        workspaceId: 'workspace_1',
        artifact: {
          format: 't3x.dev/workspace-source-artifact/v1',
          rootPath: '/',
          resources: [
            { path: 'z.yaml', materialId: 'mat_z', contentHash: `sha256:${'z'.repeat(64)}` },
            { path: 'a.yaml', materialId: 'mat_a', contentHash: `sha256:${'a'.repeat(64)}` },
          ],
        },
        root: { materialId: 'mat_root', contentHash: `sha256:${'r'.repeat(64)}` },
        why: 'Import selected source bundle',
        ifRevision: 7,
      },
      ports: {
        canonicalTransitionRequest,
        findTransitionProposalByRequest: vi.fn(async () => null),
        buildProposal: vi.fn(async () => ({
          workspaceId: 'workspace_1',
          workspaceRevision: 7,
          refName: 'main',
          refHead: null,
          base: subject.base,
          result: subject.result,
          effect: subject.effect,
          proposal: subject.proposal,
        })),
        materializeTransitionProposal: vi.fn(async () => ({
          membership: { transitionId: 'trn_00000000000000000000000000000001' },
          reused: false,
        })),
        inspectTransition: vi.fn(async () => ({
          transitionId: 'trn_00000000000000000000000000000001',
        })),
      },
    });

    expect(result.reused).toBe(false);
    expect(canonicalTransitionRequest).toHaveBeenCalledWith({
      kind: 'exact_source_import',
      workspace_id: 'workspace_1',
      artifact: {
        format: 't3x.dev/workspace-source-artifact/v1',
        root_path: '/',
        resources: [
          { path: 'a.yaml', material_id: 'mat_a', content_hash: `sha256:${'a'.repeat(64)}` },
          { path: 'z.yaml', material_id: 'mat_z', content_hash: `sha256:${'z'.repeat(64)}` },
        ],
      },
      root: { material_id: 'mat_root', content_hash: `sha256:${'r'.repeat(64)}` },
      why: 'Import selected source bundle',
      if_revision: 7,
    });
  });

  it('rejects changed verify retries before replaying or invoking providers', async () => {
    const resolveTransitionProposalGraph = vi.fn(async () => graph());
    const providerVerify = vi.fn();

    await expect(
      verifyTransitionCommand({
        projectId: 'project_1',
        transitionId: 'trn_00000000000000000000000000000001',
        requestId: 'request_1',
        options: {
          allowedExternalPredicateTypes: ['example.test/support/v1'],
          providers: [
            {
              source: 'provider:support',
              issuer: { kind: 'service', id: 'service:support-verifier' },
              predicateTypes: ['example.test/support/v1'],
              verify: providerVerify,
            },
          ],
        },
        ports: {
          canonicalTransitionRequest: () => ({
            canonicalJson: '{"operation":"verify"}',
            digest: REQUEST_DIGEST,
          }),
          findTransitionStatementsByRequest: vi.fn(async () => []),
          findTransitionVerificationReceipt: vi.fn(async () => ({
            requestDigest: `sha256:${'e'.repeat(64)}`,
            operationalResults: [],
          })),
          resolveTransitionProposalGraph,
          recordTransitionVerification: vi.fn(),
          inspectTransition: vi.fn(),
          nowIso: () => '2026-08-17T00:00:00.000Z',
          nativeProviderContext: {},
        },
      })
    ).rejects.toBeInstanceOf(TransitionApplicationRequestConflictError);
    expect(resolveTransitionProposalGraph).not.toHaveBeenCalled();
    expect(providerVerify).not.toHaveBeenCalled();
  });

  it('records replay false statements without advancing provider facts', async () => {
    const recorded: TransitionStatementRecordInput[] = [];

    const result = await verifyTransitionCommand({
      projectId: 'project_1',
      transitionId: 'trn_00000000000000000000000000000001',
      requestId: 'request_1',
      ports: {
        canonicalTransitionRequest: () => ({
          canonicalJson: '{"operation":"verify"}',
          digest: REQUEST_DIGEST,
        }),
        findTransitionStatementsByRequest: vi.fn(async () => []),
        findTransitionVerificationReceipt: vi.fn(async () => null),
        resolveTransitionProposalGraph: vi.fn(async () => graph({ falseReplay: true })),
        recordTransitionVerification: vi.fn(async ({ statementInputs, receipt }) => {
          recorded.push(...statementInputs);
          return {
            statements: [
              {
                statementDigest: `sha256:${'d'.repeat(64)}`,
                source: 'server:replay',
                issuer: { kind: 'service', id: 'service:t3x-transition-replay' },
                requestId: receipt.requestId,
                createdAt: '2026-08-17T00:00:00.000Z',
              },
            ],
            operationalResults: receipt.operationalResults,
          };
        }),
        inspectTransition: vi.fn(async () => ({
          precondition: { policyDigest: policyDigest() },
        })),
        nowIso: () => '2026-08-17T00:00:00.000Z',
        nativeProviderContext: {},
      },
    });

    expect(result.reused).toBe(false);
    expect(recorded).toHaveLength(1);
    expect((recorded[0]!.statement.predicate as { outcome: string }).outcome).toBe('false');
    expect(result.operationalResults).toEqual([]);
  });

  it('issues external provider statements with the server configured issuer', async () => {
    const recorded: TransitionStatementRecordInput[] = [];
    const caller: TransitionActorRef = { kind: 'human', id: 'human:reviewer' };
    const providerIssuer: TransitionActorRef = { kind: 'service', id: 'service:support-verifier' };
    const provider: TransitionExternalStatementProvider = {
      source: 'provider:support',
      issuer: providerIssuer,
      predicateTypes: ['example.test/support/v1'],
      verify: vi.fn(async () => ({
        outcome: 'statement',
        statement: {
          predicateType: 'example.test/support/v1',
          predicate: { outcome: 'supported' },
          subjects: ['effect', 'result'],
        },
      })),
    };

    await verifyTransitionCommand({
      projectId: 'project_1',
      transitionId: 'trn_00000000000000000000000000000001',
      requestId: 'request_1',
      actor: caller,
      options: {
        allowedExternalPredicateTypes: ['example.test/support/v1'],
        providers: [provider],
      },
      ports: {
        canonicalTransitionRequest: () => ({
          canonicalJson: '{"operation":"verify"}',
          digest: REQUEST_DIGEST,
        }),
        findTransitionStatementsByRequest: vi.fn(async () => []),
        findTransitionVerificationReceipt: vi.fn(async () => null),
        resolveTransitionProposalGraph: vi.fn(async () => graph()),
        recordTransitionVerification: vi.fn(async ({ statementInputs, receipt }) => {
          recorded.push(...statementInputs);
          return {
            statements: statementInputs.map(recordedMembership),
            operationalResults: receipt.operationalResults,
          };
        }),
        inspectTransition: vi.fn(async () => ({
          precondition: { policyDigest: policyDigest() },
        })),
        nowIso: () => '2026-08-17T00:00:00.000Z',
        nativeProviderContext: {},
      },
    });

    const providerRecord = recorded.find((item) => item.source === 'provider:support');
    expect(provider.verify).toHaveBeenCalledWith(
      expect.objectContaining({
        transitionId: 'trn_00000000000000000000000000000001',
        projectId: 'project_1',
        workspaceId: 'workspace_1',
      })
    );
    expect(providerRecord).toBeDefined();
    expect(providerRecord?.issuer).toEqual(providerIssuer);
    expect(providerRecord?.statement.actor).toEqual(providerIssuer);
  });

  it('quarantines native provider statements issued as another actor', async () => {
    const recorded: TransitionStatementRecordInput[] = [];
    const providerIssuer: TransitionActorRef = { kind: 'service', id: 'service:native-verifier' };
    const nativeProvider: TransitionNativeStatementProvider<unknown> = {
      source: 'provider:native',
      issuer: providerIssuer,
      predicateTypes: ['example.test/native/v1'],
      verify: vi.fn(async () => ({
        outcome: 'statement',
        statement: parseStatement({
          schema: 't3x/statement/v1',
          subjects: [describeProtocolObject(graph().effect)],
          actor: { kind: 'service', id: 'service:spoofed-verifier' },
          predicateType: 'example.test/native/v1',
          predicate: { outcome: 'passed' },
        }),
      })),
    };

    const result = await verifyTransitionCommand({
      projectId: 'project_1',
      transitionId: 'trn_00000000000000000000000000000001',
      requestId: 'request_1',
      options: { nativeProviders: [nativeProvider] },
      ports: {
        canonicalTransitionRequest: () => ({
          canonicalJson: '{"operation":"verify"}',
          digest: REQUEST_DIGEST,
        }),
        findTransitionStatementsByRequest: vi.fn(async () => []),
        findTransitionVerificationReceipt: vi.fn(async () => null),
        resolveTransitionProposalGraph: vi.fn(async () => graph()),
        recordTransitionVerification: vi.fn(async ({ statementInputs, receipt }) => {
          recorded.push(...statementInputs);
          return {
            statements: statementInputs.map(recordedMembership),
            operationalResults: receipt.operationalResults,
          };
        }),
        inspectTransition: vi.fn(async () => ({
          precondition: { policyDigest: policyDigest() },
        })),
        nowIso: () => '2026-08-17T00:00:00.000Z',
        nativeProviderContext: {},
      },
    });

    expect(recorded.map((item) => item.source)).toEqual(['server:replay']);
    expect(result.operationalResults).toEqual([
      {
        source: 'provider:native',
        outcome: 'failed',
        code: 'PROVIDER_FAILED',
        message: 'Native provider provider:native issued as another actor',
      },
    ]);
  });

  it('refuses attached Statements for reserved core predicates', async () => {
    const actor: TransitionActorRef = { kind: 'human', id: 'human:maintainer' };

    await expect(
      attachTransitionStatementCommand({
        projectId: 'project_1',
        transitionId: 'trn_00000000000000000000000000000001',
        requestId: 'request_1',
        actor,
        statement: {
          predicateType: 't3x.proposal/v1',
          predicate: { value: true } as ProtocolValue,
          subjects: ['proposal'],
        },
        options: { allowedExternalPredicateTypes: ['t3x.proposal/v1'] },
        ports: {
          canonicalTransitionRequest: () => ({
            canonicalJson: '{"operation":"attach_statement"}',
            digest: REQUEST_DIGEST,
          }),
          findTransitionStatementsByRequest: vi.fn(async () => []),
          resolveTransitionProposalGraph: vi.fn(async () => graph()),
          recordTransitionStatementMembership: vi.fn(),
          inspectTransition: vi.fn(),
        },
      })
    ).rejects.toBeInstanceOf(TransitionPredicateNotAllowedError);
  });
});
