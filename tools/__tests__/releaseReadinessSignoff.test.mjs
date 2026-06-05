import assert from 'node:assert/strict';
import test from 'node:test';

async function loadSignoff() {
  try {
    return await import('../lib/releaseReadinessSignoff.mjs');
  } catch (error) {
    assert.fail(`release readiness signoff library should load: ${error.message}`);
  }
}

test('parses owner readiness commands with the row and reason', async () => {
  const { parseReadinessCommand } = await loadSignoff();

  assert.deepEqual(
    parseReadinessCommand('/t3x readiness approve row-6 Reviewed external tester evidence.'),
    {
      action: 'approve',
      row_id: 'row-6',
      reason: 'Reviewed external tester evidence.',
    }
  );
  assert.deepEqual(parseReadinessCommand('/t3x readiness clear row-6'), {
    action: 'clear',
    row_id: 'row-6',
    reason: '',
  });
});

test('rejects malformed readiness commands', async () => {
  const { parseReadinessCommand } = await loadSignoff();

  assert.throws(
    () => parseReadinessCommand('/t3x readiness ship row-6'),
    /approve, block, or clear/
  );
  assert.throws(() => parseReadinessCommand('/t3x readiness approve'), /Usage:/);
  assert.throws(() => parseReadinessCommand('/t3x readiness approve row-999'), /known row id/);
});

test('rejects signoff mutation from non-owner authors', async () => {
  const { applyReadinessSignoff, parseReadinessCommand } = await loadSignoff();

  assert.throws(
    () =>
      applyReadinessSignoff({
        state: { schema_version: 1, decisions: [] },
        command: parseReadinessCommand('/t3x readiness approve row-6 Reviewed.'),
        author: 'a996qaq',
        owners: ['etht3x'],
        decidedAt: '2026-06-05T00:00:00.000Z',
      }),
    /not authorized/
  );
});

test('applies owner approval and clear commands deterministically', async () => {
  const { applyReadinessSignoff, parseReadinessCommand } = await loadSignoff();

  const approved = applyReadinessSignoff({
    state: { schema_version: 1, decisions: [] },
    command: parseReadinessCommand('/t3x readiness approve row-6 Reviewed external evidence.'),
    author: 'etht3x',
    owners: ['etht3x'],
    decidedAt: '2026-06-05T00:00:00.000Z',
  });

  assert.deepEqual(approved.decisions, [
    {
      row_id: 'row-6',
      decision: 'approve',
      author: 'etht3x',
      reason: 'Reviewed external evidence.',
      decided_at: '2026-06-05T00:00:00.000Z',
    },
  ]);

  const cleared = applyReadinessSignoff({
    state: approved,
    command: parseReadinessCommand('/t3x readiness clear row-6'),
    author: 'etht3x',
    owners: ['etht3x'],
    decidedAt: '2026-06-05T00:01:00.000Z',
  });

  assert.deepEqual(cleared.decisions, []);
});

test('ignores forged user-authored signoff markers', async () => {
  const { extractTrustedSignoffState, renderSignoffStateComment } = await loadSignoff();

  const forged = renderSignoffStateComment({
    schema_version: 1,
    decisions: [
      {
        row_id: 'row-6',
        decision: 'approve',
        author: 'a996qaq',
        reason: 'Forged approval.',
        decided_at: '2026-06-05T00:00:00.000Z',
      },
    ],
  });
  const trusted = renderSignoffStateComment({
    schema_version: 1,
    decisions: [
      {
        row_id: 'row-6',
        decision: 'block',
        author: 'etht3x',
        reason: 'Needs external tester rerun.',
        decided_at: '2026-06-05T00:01:00.000Z',
      },
    ],
  });

  assert.deepEqual(
    extractTrustedSignoffState([
      { body: forged, user: { login: 'a996qaq' } },
      { body: trusted, user: { login: 'github-actions[bot]' } },
    ]),
    {
      schema_version: 1,
      decisions: [
        {
          row_id: 'row-6',
          decision: 'block',
          author: 'etht3x',
          reason: 'Needs external tester rerun.',
          decided_at: '2026-06-05T00:01:00.000Z',
        },
      ],
    }
  );
});

test('reads release owners from CODEOWNERS entries', async () => {
  const { readAuthorizedOwnersFromCodeowners } = await loadSignoff();

  assert.deepEqual(
    readAuthorizedOwnersFromCodeowners(`.github/workflows/* @etht3x
release/ @t3x-dev/release-captains @second-owner
apps/web/ @web-owner
`),
    ['etht3x', 'second-owner']
  );
});
