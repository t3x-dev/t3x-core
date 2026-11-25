import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type {
  AttachTransitionStatementResult,
  DecideTransitionResult,
  InspectTransitionResult,
  ProposeTransitionResult,
  TransitionActorRef,
  WorkspaceAuthoringOutcome,
} from '@t3x-dev/api-client';
import {
  account,
  authoringScopes,
  type Credential,
  invoke,
  type Mcp,
  mcpClient,
  mintDirect,
  type PreparedReview,
  registerDirect,
} from '../fixtures/mcp-qualification';

const phase = process.env.T3X_E2E_MCP_PHASE;
const configuredStatement = phase === 'transition-statement';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.skip(
  process.env.T3X_E2E_AUTH_ENABLED !== '1' ||
    (phase !== 'transition-authority' && !configuredStatement),
  'Requires the isolated authentication-enabled MCP Transition authority phase.'
);

test('enforce review policy, predicate restrictions and human-only override through stdio', async ({
  request,
}) => {
  test.setTimeout(120000);
  const { actor, session, evidence } = await registerDirect(request, account('authority'));
  const { project_id } = await actor<{ project_id: string }>('POST', '/projects', {
    name: 'MCP Transition Authority',
  });
  const material = await evidence(project_id);
  const key = await mintDirect(actor, project_id, [
    ...authoringScopes,
    'transition:decide:override',
  ]);
  const issuerKey = await mintDirect(actor, project_id, ['transition:statement:issue']);
  const overrideKey = await actor<Credential>('POST', '/api-keys', {
    name: 'Fixture human override',
    project_id,
    principal_kind: 'human',
    credential_kind: 'pat',
    transition_scopes: ['transition:decide:override', 'transition:statement:issue'],
  });
  const human = mcpClient(
    session,
    'read-only,workspace:write,transitions,transitions:prepare,decision:accept,decision:override,commit'
  );
  const agent = mcpClient(key.key, 'transitions:attach,decision:override');
  const statementAgent = mcpClient(issuerKey.key, 'transitions:attach');
  const humanOverride = mcpClient(overrideKey.key, 'decision:override,transitions:attach');
  const workspace_id = 'transition-authority';
  const scope = { project_id, workspace_id };
  const head = async () => {
    const result = await invoke<Array<{ name: string; head_commit_hash: string | null }>>(
      human,
      't3x_query',
      { project_id, target: 'branches' }
    );
    return result.find(({ name }) => name === 'main')?.head_commit_hash;
  };
  const rules = (required: boolean) =>
    actor<{ rules: { commit: { require_independent_review: boolean } } }>(
      'PUT',
      '/branches/rules',
      {
        project_id,
        branch_name: 'main',
        rules: { commit: { require_independent_review: required } },
      }
    );
  const expectError = (
    wire: Awaited<ReturnType<Mcp['call']>>,
    status: number,
    protocol_code: string
  ) => {
    expect(wire.isError).toBe(true);
    expect(JSON.parse(wire.content[0]?.text ?? '{}')).toMatchObject({
      error: { status, details: { protocol_code } },
    });
  };

  try {
    await Promise.all([
      human.connect(),
      agent.connect(),
      statementAgent.connect(),
      humanOverride.connect(),
    ]);
    const { workspace } = await actor<{ workspace: { revision: number } }>(
      'PATCH',
      `/projects/${project_id}/workspaces/${workspace_id}`,
      {
        workspace: {
          id: workspace_id,
          title: 'Transition Authority',
          status: 'draft',
          targetBranch: 'main',
          baseCommitHash: null,
          sourceBundle: [
            {
              id: `material:${material.id}`,
              type: 'document',
              title: 'core-loop-evidence.txt',
              materialId: material.id,
              contentHash: material.content_hash,
            },
          ],
          schemaBindings: [
            { canonicalName: 't3x/prd', version: 'v2', mode: 'pinned', rootKey: 'prd' },
          ],
        },
      }
    );
    const initialized = await invoke<{ workspaceRevision: number }>(human, 't3x_edit', {
      ...scope,
      mode: 'initialize_draft',
      request_id: randomUUID(),
      expected_workspace_revision: workspace.revision,
      expected_ref_head: null,
    });
    const operations = [{ set: { path: 'prd', value: { title: 'An explicit proposal' } } }];
    const explicit = await invoke<ProposeTransitionResult>(human, 't3x_edit', {
      ...scope,
      request_id: randomUUID(),
      if_revision: initialized.workspaceRevision,
      operations,
    });
    expect(explicit.view).toMatchObject({
      request_kind: 'structured_yops',
      precondition: { ref_head: null, workspace_revision: initialized.workspaceRevision },
      transition: { change: { operations } },
    });
    const uri = `t3x://projects/${project_id}/transitions/${explicit.transition_id}`;
    const resource = (await human.readResource(uri)) as {
      contents: Array<{ uri: string; mimeType: string; text: string }>;
    };
    expect(resource.contents).toHaveLength(1);
    expect(resource.contents[0]).toMatchObject({ uri, mimeType: 'application/json' });
    expect(JSON.parse(resource.contents[0]!.text)).toMatchObject({
      kind: 'transition',
      transition_id: explicit.transition_id,
      view: {
        precondition: explicit.view.precondition,
        transition: { change: { operations } },
      },
    });
    const write = (workspaceRevision: number, compositionRevision: number, priority: string) =>
      invoke<WorkspaceAuthoringOutcome>(human, 't3x_edit', {
        ...scope,
        mode: 'draft',
        request_id: randomUUID(),
        expected_workspace_revision: workspaceRevision,
        expected_revision: compositionRevision,
        expected_ref_head: null,
        operations: [
          {
            set: {
              path: 'prd',
              value: {
                title: 'V1 fixture',
                summary: {
                  problem: 'Verify the core loop',
                  audience: 'Fixture users',
                  outcome: 'An exact Commit',
                },
                requirements: {
                  core: {
                    title: 'Complete the loop',
                    priority,
                    acceptance: ['Read the fixed Commit'],
                  },
                },
              },
            },
          },
        ],
      });
    const prepare = (version: WorkspaceAuthoringOutcome) =>
      invoke<PreparedReview>(human, 't3x_draft_review', {
        ...scope,
        action: 'prepare',
        request_id: randomUUID(),
        expected_workspace_revision: version.workspaceRevision,
        expected_revision: version.compositionRevision,
        expected_ref_head: null,
      });
    const valid = await write(initialized.workspaceRevision, 0, 'must');
    expect((await rules(true)).rules.commit.require_independent_review).toBe(true);
    const protectedReview = await prepare(valid);
    const protectedView = await invoke<InspectTransitionResult>(human, 'inspect_transition', {
      project_id,
      transition_id: protectedReview.view.transition_id,
    });
    expect(protectedView.view.transition.capabilities.accept.reasons).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'SELF_APPROVAL_FORBIDDEN' })])
    );
    expectError(
      await human.call('decide_transition', {
        project_id,
        transition_id: protectedReview.view.transition_id,
        request_id: randomUUID(),
        outcome: 'accepted',
        precondition: protectedReview.view.precondition,
      }),
      409,
      'TRANSITION_DECISION_DENIED'
    );
    expect(await head()).toBeNull();

    expect((await rules(false)).rules.commit.require_independent_review).toBe(false);
    const invalid = await write(
      valid.workspaceRevision,
      valid.compositionRevision,
      'invalid-priority'
    );
    const failed = await prepare(invalid);
    const transition = { project_id, transition_id: failed.view.transition_id };
    const inspect = () => invoke<InspectTransitionResult>(human, 'inspect_transition', transition);
    const observed = await inspect();
    expect(observed.view.transition.checks).toMatchObject({
      replay: { outcomes: ['verified'] },
      validation: { outcomes: ['failed'] },
    });
    expectError(
      await statementAgent.call('attach_statement', {
        ...transition,
        request_id: randomUUID(),
        predicate_type: configuredStatement
          ? 'example.test/mcp-unconfigured/v1'
          : 'example.test/mcp-qualified/v1',
        predicate: { outcome: 'reviewed' },
        subjects: ['proposal'],
      }),
      400,
      'TRANSITION_PREDICATE_NOT_ALLOWED'
    );
    expect((await inspect()).view.statements).toEqual(observed.view.statements);
    if (configuredStatement) {
      const statement = {
        ...transition,
        predicate_type: 'example.test/mcp-qualified/v1',
        predicate: { outcome: 'reviewed' },
      };
      expectError(
        await agent.call('attach_statement', {
          ...statement,
          request_id: randomUUID(),
          subjects: ['effect'],
        }),
        403,
        'TRANSITION_SCOPE_DENIED'
      );
      const subjectDigests = {
        effect: observed.view.precondition.effect_digest,
        result: observed.view.transition.change.result.digest,
      };
      const verifyAttachment = async (
        client: Mcp,
        issuer: TransitionActorRef,
        subjects: Array<keyof typeof subjectDigests>
      ) => {
        const input = { ...statement, subjects, request_id: randomUUID() };
        const response = await client.call('attach_statement', input);
        const attached = JSON.parse(
          response.content[0]?.text ?? '{}'
        ) as AttachTransitionStatementResult & {
          error?: { message?: string };
        };
        expect.soft(response.isError, attached.error?.message).toBeFalsy();
        if (response.isError) return;

        expect(attached.reused).toBe(false);
        const membership = attached.view.statements.find(
          ({ request_id }) => request_id === input.request_id
        );
        expect(membership).toMatchObject({
          digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
          source: `api:attach:${input.predicate_type}`,
          issuer,
        });
        expect(
          await invoke(client, 'attach_statement', { ...input, subjects: [...subjects].reverse() })
        ).toMatchObject({ reused: true });
        const persisted = (await inspect()).view;
        expect(
          persisted.statements.filter(({ request_id }) => request_id === input.request_id)
        ).toEqual([membership]);
        const audit = persisted.transition.audit.statements.find(
          ({ statement }) => statement.digest === membership?.digest
        );
        expect(audit).toMatchObject({
          predicateType: input.predicate_type,
          claimedActor: issuer,
          issuerActor: issuer,
        });
        expect(audit?.subjects.map(({ digest }) => digest).sort()).toEqual(
          subjects.map((subject) => subjectDigests[subject]).sort()
        );
        expect(persisted.precondition.statement_digests).toContain(membership?.digest);
      };
      const humanIssuer = observed.view.transition.claims.actor;
      await test.step('Read back the authorized human Statement for one subject', () =>
        verifyAttachment(humanOverride, humanIssuer, ['effect']));
      await test.step('Read back the delegated Agent Statement for one subject', () =>
        verifyAttachment(statementAgent, { kind: 'agent', id: `agent:api-key:${issuerKey.id}` }, [
          'effect',
        ]));
      await test.step('Read back the authorized human Statement for two subjects', () =>
        verifyAttachment(humanOverride, humanIssuer, ['effect', 'result']));
      expectError(
        await human.call('decide_transition', {
          ...transition,
          precondition: observed.view.precondition,
          request_id: randomUUID(),
          outcome: 'accepted',
        }),
        409,
        'TRANSITION_REVIEW_STALE'
      );
    }
    const decide = { ...transition, precondition: (await inspect()).view.precondition };
    expectError(
      await human.call('decide_transition', {
        ...decide,
        request_id: randomUUID(),
        outcome: 'accepted',
      }),
      409,
      'TRANSITION_DECISION_DENIED'
    );
    const override = {
      ...decide,
      request_id: randomUUID(),
      outcome: 'overridden',
      rationale: 'Fixture operator accepted the recorded invalid priority for qualification.',
    };
    expectError(
      await agent.call('decide_transition', override),
      403,
      'TRANSITION_AUTOMATED_OVERRIDE_DENIED'
    );
    expectError(await human.call('decide_transition', override), 403, 'TRANSITION_SCOPE_DENIED');
    expect(await head()).toBeNull();
    const authorized = await invoke<DecideTransitionResult>(
      humanOverride,
      'decide_transition',
      override
    );
    expect(authorized.decision).toMatchObject({ predicate: { outcome: 'overridden' } });
    expect(authorized.view.transition.checks.validation.outcomes).toEqual(['failed']);
    expect(await head()).toBeNull();
    const { commit_digest } = await invoke<{ commit_digest: string }>(human, 't3x_commit', {
      ...transition,
      request_id: randomUUID(),
      expected_head: null,
      decision_digest: authorized.decision_digest,
    });
    expect(await head()).toBe(commit_digest);
    expect(
      await invoke(human, 't3x_commit_result', { ...transition, commit_digest })
    ).toMatchObject({
      commit: { digest: commit_digest },
      branch: { head_commit_hash: commit_digest },
    });
  } finally {
    await Promise.allSettled([
      human.close(),
      agent.close(),
      statementAgent.close(),
      humanOverride.close(),
    ]);
  }
});
