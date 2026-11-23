import { randomUUID } from 'node:crypto';
import type {
  SchemaPreparationInput,
  SchemaPreparationPreview,
  StudioPreview,
  StudioSchemaEditCandidateSaveResult,
} from '@t3x-dev/api-client';
import { expect, type Page, test } from '@playwright/test';
import {
  account,
  authoringScopes,
  denied,
  type DraftVersion,
  invoke,
  type Mcp,
  mcpClient,
  mintDirect,
  type PreparedReview,
  registerBrowser,
  registerDirect,
} from '../fixtures/mcp-qualification';

type Activity = DraftVersion & {
  current: Record<string, unknown>;
  currentSchema: { schemaHash: string | null; definition: Record<string, unknown> | null };
};

async function openPreparation(page: Page, studioUrl: string) {
  await page.goto(studioUrl);
  await page.getByRole('button', { name: /^(Save and review|Review) in Workspace$/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Prepare Schema content', exact: true })
  ).toBeVisible();
}

async function submitPreparation(page: Page, path: string, previewHash: string) {
  const save = page.getByRole('button', { name: 'Save prepared Draft', exact: true });
  const response = page.waitForResponse(
    (result) =>
      result.request().method() === 'POST' && new URL(result.url()).pathname === `/api/v1${path}`
  );
  await save.click();
  const applied = await response;
  expect(applied.ok(), `Schema preparation status ${applied.status()}`).toBe(true);
  const sent = applied.request().postDataJSON();
  expect(sent.previewHash).toBe(previewHash);
  return sent as SchemaPreparationInput & { previewHash: string; requestId: string };
}

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.skip(
  process.env.T3X_E2E_AUTH_ENABLED !== '1' || process.env.T3X_E2E_MCP_PHASE !== 'schema-authoring',
  'Requires an isolated authentication-enabled Schema authoring qualification stack.'
);

test('saved Schema candidate, read-only stdio preview, explicit Web adoption, and fixed Review', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const identity = account('schema');
  const owner = await registerBrowser(page, identity);
  const outsider = await registerDirect(request, account('visitor'));
  const { project_id } = await owner.actor<{ project_id: string }>('POST', '/projects', {
    name: 'Schema Authoring Fixture',
    namespace: identity.namespace,
  });
  const agent = await mintDirect(owner.actor, project_id, authoringScopes);
  const human = mcpClient(
    owner.session,
    'workspace,workspace:write,schemas,transitions,transitions:prepare'
  );
  const machine = mcpClient(agent.key, 'workspace,schemas,schemas:candidates:write');
  const foreign = mcpClient(outsider.session, 'schemas');
  const reader = mcpClient(agent.key, 'schemas');
  await Promise.all([human, machine, foreign, reader].map((client) => client.connect()));
  try {
    const { workspace_id } = await invoke<{ workspace_id: string }>(human, 't3x_open_workspace', {
      project_id,
      ref: 'main',
      expected_head: null,
      request_id: randomUUID(),
    });
    const scope = { project_id, workspace_id };
    const schemaPath = `/projects/${project_id}/schema-studio`;
    const encodedId = encodeURIComponent(workspace_id);
    const preparePath = `${schemaPath}/preparation/${encodedId}`;
    const studioUrl = `/project/${project_id}?tab=schemas&schemaView=studio&workspace=${encodedId}&branch=main`;
    const activity = () =>
      invoke<Activity>(human, 't3x_query', {
        target: 'workspace_activity',
        project_id,
        id: workspace_id,
      });
    const previewDefinition = (
      client: Mcp,
      schemaEditCandidate?: { candidateId: string; revision: number }
    ) =>
      invoke<StudioPreview>(client, 't3x_schema_candidate', {
        ...scope,
        action: 'preview',
        input: { candidateIds: [], ...(schemaEditCandidate ? { schemaEditCandidate } : {}) },
      });
    const prepareInput = (
      preview: StudioPreview,
      schemaEditCandidate: { candidateId: string; revision: number }
    ): SchemaPreparationInput => {
      if (!preview.workspace) throw new Error('Expected a persisted Workspace in the preview.');
      return {
        target: {
          kind: 'studio',
          candidateIds: [],
          schemaEditCandidate,
          reviewHash: preview.reviewHash,
        },
        ifRevision: preview.workspace.revision,
        commands: [],
        confirmedChanges: [],
      };
    };
    const previewPreparation = (input: SchemaPreparationInput) =>
      invoke<SchemaPreparationPreview>(machine, 't3x_schema_preparation', {
        ...scope,
        action: 'preview',
        input,
      });

    const base = await previewDefinition(machine);
    const initialSchema = {
      ...base.schema,
      nodes: { item: { slots: { title: { type: 'string' }, obsolete: { type: 'string' } } } },
    };
    const saved = await owner.actor<StudioSchemaEditCandidateSaveResult>(
      'PUT',
      `${schemaPath}/edit-candidates/${encodedId}`,
      {
        workspaceId: workspace_id,
        candidateIds: [],
        ifRevision: 0,
        retryKey: randomUUID(),
        intent: 'Saved Schema candidate before MCP integration',
        origin: 'studio',
        localContribution: {},
        baseSchemaHash: base.schemaHash,
        schemaDefinition: initialSchema,
      }
    );
    const existingRef = {
      candidateId: saved.candidate.candidateId,
      revision: saved.candidate.revision,
    };
    const existingInput = prepareInput(await previewDefinition(machine, existingRef), existingRef);
    const initialPreview = await previewPreparation(existingInput);
    expect(initialPreview.canPrepare).toBe(true);
    expect(initialPreview.before).toEqual(initialPreview.after);
    const unattached = await activity();
    await denied(machine, 't3x_schema_preparation', {
      ...scope,
      action: 'apply',
      input: existingInput,
    });
    await denied(foreign, 't3x_schema_preparation', {
      ...scope,
      action: 'preview',
      input: existingInput,
    });
    expect(await activity()).toEqual(unattached);

    await openPreparation(page, studioUrl);
    await page.getByRole('button', { name: 'Preview changes', exact: true }).click();
    await submitPreparation(page, preparePath, initialPreview.previewHash);
    const adopted = await activity();
    expect(adopted.currentSchema.schemaHash).toBe(initialPreview.schemaHash);
    expect(adopted.current).toEqual(unattached.current);

    await invoke(human, 't3x_edit', {
      ...scope,
      mode: 'draft',
      request_id: randomUUID(),
      expected_workspace_revision: adopted.workspaceRevision,
      expected_revision: adopted.compositionRevision,
      expected_ref_head: adopted.basis.refHead,
      operations: [
        {
          set: {
            path: 'candidate',
            value: { item: { title: 'Retained', obsolete: 'Remove this value' } },
          },
        },
      ],
    });
    const previous = await activity();
    const exactBase = await previewDefinition(machine);
    const saveInput = {
      candidateIds: [],
      ifRevision: existingRef.revision,
      retryKey: randomUUID(),
      intent: 'Remove the obsolete slot',
      rebase: true,
      localContribution: {},
      baseSchemaHash: exactBase.schemaHash,
      schemaDefinition: {
        ...exactBase.schema,
        nodes: { item: { slots: { title: { type: 'string' } } } },
      },
    };
    const saveArgs = { ...scope, action: 'save', input: saveInput };
    await denied(reader, 't3x_schema_candidate', saveArgs);
    const wrongBase = await machine.call('t3x_schema_candidate', {
      ...saveArgs,
      input: { ...saveInput, baseSchemaHash: `sha256:${'f'.repeat(64)}` },
    });
    expect(wrongBase.isError).toBe(true);
    expect(JSON.parse(wrongBase.content[0]?.text ?? '{}')).toMatchObject({
      error: { status: 409 },
    });
    const edited = await invoke<StudioSchemaEditCandidateSaveResult>(
      machine,
      't3x_schema_candidate',
      saveArgs
    );
    expect(edited.outcome).toBe('updated');
    expect(await invoke(machine, 't3x_schema_candidate', saveArgs)).toMatchObject({
      outcome: 'reused',
      candidate: edited.candidate,
    });
    expect(
      await invoke(machine, 't3x_schema_candidate', { ...scope, action: 'read' })
    ).toMatchObject({
      candidateId: edited.candidate.candidateId,
      revision: edited.candidate.revision,
      requestDigest: edited.candidate.requestDigest,
    });
    await denied(machine, 't3x_schema_candidate', {
      ...saveArgs,
      input: { ...saveInput, retryKey: randomUUID() },
    });
    await denied(machine, 't3x_schema_preparation', {
      ...scope,
      action: 'preview',
      input: existingInput,
    });
    expect(await activity()).toMatchObject({
      current: previous.current,
      currentSchema: previous.currentSchema,
      compositionRevision: previous.compositionRevision,
    });

    const updatedRef = {
      candidateId: edited.candidate.candidateId,
      revision: edited.candidate.revision,
    };
    const updated = prepareInput(await previewDefinition(machine, updatedRef), updatedRef);
    const blocked = await previewPreparation(updated);
    expect(blocked.canPrepare).toBe(false);
    const mappingPaths = [
      ...new Set(
        blocked.impact.items.filter(({ kind }) => kind === 'needs_mapping').map(({ path }) => path)
      ),
    ];
    expect(mappingPaths.length).toBeGreaterThan(0);
    const contentPath = 'candidate/item/obsolete';
    const planned = {
      ...updated,
      commands: [{ kind: 'remove' as const, path: contentPath }],
      confirmedChanges: mappingPaths,
    };
    const confirmedPreview = await previewPreparation(planned);
    expect(confirmedPreview.issues).toEqual([]);
    expect(confirmedPreview.canPrepare).toBe(true);
    expect(confirmedPreview.after).toMatchObject({ candidate: { item: { title: 'Retained' } } });

    await openPreparation(page, studioUrl);
    const save = page.getByRole('button', { name: 'Save prepared Draft', exact: true });
    await expect(save).toBeDisabled();
    await page.getByText('Advanced content edits', { exact: true }).click();
    await page.getByRole('button', { name: '+ Add change', exact: true }).click();
    await page.getByLabel('Action for change 1').selectOption('remove');
    await page.getByLabel('Content path for change 1').fill(contentPath);
    for (const checkbox of await page
      .getByRole('group', { name: 'Confirm affected mappings' })
      .getByRole('checkbox')
      .all()) {
      await checkbox.check();
    }
    await page.getByRole('button', { name: 'Preview changes', exact: true }).click();
    await expect(save).toBeEnabled();
    await page.screenshot({
      path: testInfo.outputPath('schema-adoption-preview.png'),
      animations: 'disabled',
    });
    const exactRequest = await submitPreparation(page, preparePath, confirmedPreview.previewHash);
    expect(await owner.actor('POST', preparePath, exactRequest)).toMatchObject({
      outcome: 'reused',
    });
    const prepared = await activity();
    expect(prepared.currentSchema.schemaHash).toBe(confirmedPreview.schemaHash);
    expect(prepared.current).toEqual({ candidate: { item: { title: 'Retained' } } });
    const fixed = await invoke<PreparedReview>(human, 't3x_draft_review', {
      ...scope,
      action: 'prepare',
      request_id: randomUUID(),
      expected_workspace_revision: prepared.workspaceRevision,
      expected_revision: prepared.compositionRevision,
      expected_ref_head: prepared.basis.refHead,
    });
    const frozen = await invoke(human, 't3x_draft_review', {
      ...scope,
      action: 'read',
      snapshot_id: fixed.review.snapshot_id,
    });
    expect(frozen).toMatchObject({ snapshot_digest: fixed.review.snapshot_digest });
    expect(JSON.stringify(frozen)).toContain(confirmedPreview.schemaHash);
    expect((await activity()).basis.refHead).toBeNull();
  } finally {
    await Promise.allSettled([human, machine, foreign, reader].map((client) => client.close()));
  }
});
