import { expect, type Page, test } from '@playwright/test';

const sourcePath = '/project/proj_source/sources/conversations/conv_source';
const sourceApiPattern = '**/api/v1/projects/proj_source/sources/conversations/conv_source**';

const sourceEvidence = {
  availability: { mode: 'available', reasons: [] },
  source: {
    type: 'conversation',
    id: 'conv_source',
    project_id: 'proj_source',
    title: 'Release review',
    alias: null,
    parent_commit_hash: null,
    committed_as: null,
    committed_at: null,
    created_at: '2026-08-01T08:00:00.000Z',
    metadata: null,
    provider: 'openai',
    model: 'gpt-5',
  },
  turns: {
    items: [
      {
        turn_hash: 'sha256:turn-1',
        parent_turn_hash: null,
        role: 'user',
        content: 'Raise the rollout to 20%.',
        language: 'en',
        rings: null,
        content_blocks: null,
        created_at: '2026-08-01T08:01:00.000Z',
      },
    ],
    total: 1,
    limit: 100,
    offset: 0,
    completeness: 'complete',
  },
  revisions: [],
  evidence_selection: { mode: 'immutable_refs', turn_hashes: [] },
  referring_commits: [],
};

async function fulfillEvidence(page: Page, data: unknown) {
  await page.route(sourceApiPattern, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data }),
    });
  });
}

test('repository source view renders immutable source evidence', async ({ page }) => {
  await fulfillEvidence(page, sourceEvidence);
  await page.goto(`${sourcePath}?branch=main&commit=sha256%3Acommit-1&turn=sha256%3Aturn-1`);

  await expect(page.getByRole('heading', { name: 'Release review' })).toBeVisible();
  await expect(page.getByText('Source is available')).toBeVisible();
  await expect(page.getByText('Raise the rollout to 20%.')).toBeVisible();
  await expect(page.getByText('Referenced turn')).toBeVisible();
});

test('repository source view renders CommitV2 evidence references', async ({ page }) => {
  await fulfillEvidence(page, {
    ...sourceEvidence,
    evidence_selection: { mode: 'immutable_refs', turn_hashes: ['sha256:turn-1'] },
    referring_commits: [
      {
        commit_digest: 'sha256:historical',
        intent: 'Historical policy change',
        recorded_at: '2026-07-01T00:00:00.000Z',
        evidence_refs: [
          {
            resource: {
              uri: 't3x://projects/proj_source/conversations/conv_source/turns/sha256%3Aturn-1',
              mediaType: 'text/plain;charset=utf-8',
              digest: 'sha256:evidence',
            },
            locator: { scheme: 't3x.text-quote/v1', value: { quote: 'Raise rollout' } },
          },
        ],
      },
    ],
  });
  await page.goto(sourcePath);

  await expect(page.getByText('Source is available')).toBeVisible();
  await expect(page.getByText('1 immutable turn referenced')).toBeVisible();
  await expect(page.getByText('Historical policy change')).toBeVisible();
});

test('repository source view distinguishes unavailable evidence', async ({ page }) => {
  await fulfillEvidence(page, {
    ...sourceEvidence,
    availability: { mode: 'unavailable', reasons: ['SOURCE_RECORD_MISSING'] },
    source: null,
    turns: { ...sourceEvidence.turns, items: [], total: 0 },
  });
  await page.goto(sourcePath);

  await expect(page.getByText('Source is unavailable')).toBeVisible();
  await expect(page.getByText('No turns are available.')).toBeVisible();
});

test('repository source view fails visibly when project access is denied', async ({ page }) => {
  await page.route(sourceApiPattern, async (route) => {
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Forbidden' },
      }),
    });
  });
  await page.goto(sourcePath);

  await expect(page.getByText('Something went wrong')).toBeVisible();
  await expect(page.getByText('Forbidden')).toBeVisible();
  await expect(page.getByText('Source is available')).not.toBeVisible();
});

test('explicit legacy provenance links redirect with source identity', async ({ page }) => {
  await fulfillEvidence(page, sourceEvidence);
  await page.goto(
    '/chat/conv_source?view=source&projectId=proj_source&branch=main&commit=sha256%3Acommit-1&turn=sha256%3Aturn-1'
  );

  await expect(page).toHaveURL(
    new RegExp(
      '/project/proj_source/sources/conversations/conv_source\\?branch=main&commit=sha256%3Acommit-1&turn=sha256%3Aturn-1$'
    )
  );
  await expect(page.getByRole('heading', { name: 'Release review' })).toBeVisible();
});
