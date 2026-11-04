import { describe, expect, it } from 'vitest';
import { checkItems, checkRecordView, checksHref, checksReturnTo } from '@/domain/project/checks';
import {
  isSupportedRepositorySuffix,
  repositoryLocation,
} from '@/domain/project/repositoryLocation';

describe('Checks identity and navigation', () => {
  it('preserves encoded snapshot identity and return context through canonical routing', () => {
    const url = new URL(
      checksHref('p', {
        recordId: 'review:sha256:abc',
        returnTo: '/owner/repo/workspaces?workspace=ws%3Amain&workspaceMode=review',
      }),
      'http://localhost'
    );
    const suffix = url.pathname.slice('/project/p'.length);
    expect(isSupportedRepositorySuffix(suffix)).toBe(true);
    expect(repositoryLocation('/owner/renamed', suffix, url.search.slice(1))).toContain(
      '/checks/review%3Asha256%3Aabc?'
    );
    expect(checksReturnTo(url.searchParams.get('returnTo'), 'p', '/owner/repo/checks')).toContain(
      'workspace=ws%3Amain'
    );
    expect(repositoryLocation('/owner/repo', '', 'tab=checks&workspace=ws%3Amain')).toBe(
      '/owner/repo/checks?workspace=ws%3Amain'
    );
  });
  it.each([
    'https://example.com',
    '//example.com',
    '/project/other/checks',
    '/owner/repo/../other',
    '/owner/repo/%2e%2e/other',
    '/owner/repo\\evil',
  ])('rejects an unsafe return target %s', (value) => {
    expect(checksReturnTo(value, 'p', '/owner/repo/checks')).toBeNull();
  });
  it.each([
    [
      'not_applicable',
      { observation: 'not_observed', outcomes: [], runs: [] },
      'not_applicable',
      'passed',
    ],
    [
      undefined,
      { observation: 'not_observed', outcomes: [], runs: [] },
      'not_observed',
      'not_observed',
    ],
    [
      'not_applicable',
      { observation: 'observed', outcomes: ['failed'], runs: [{ predicate: {} }] },
      'failed',
      'failed',
    ],
    [
      'not_applicable',
      { observation: 'observed', outcomes: ['failed'], runs: [] },
      'failed',
      'failed',
    ],
    [
      'not_applicable',
      { observation: 'observed', outcomes: ['passed'], runs: [{ predicate: {} }] },
      'passed',
      'passed',
    ],
  ])('preserves applicability %s without hiding observed evidence %j', (applicability, validation, expected, overall) => {
    const view = checkRecordView({
      id: 'review:s',
      kind: 'review',
      created_at: '',
      payload: {
        content_validation: applicability,
        snapshot: {
          transition: {
            checks: {
              objectIntegrity: 'verified',
              replay: { observation: 'observed', outcomes: ['verified'] },
              validation,
            },
          },
        },
      },
    });
    const item = view.items.find((item) => item.id === 'validation')!;
    expect(item.status).toBe(expected);
    expect(view.status).toBe(overall);
    if (expected === 'not_applicable') {
      expect(item.title).toBe('Content validation');
      expect(item.summary).toContain('no business content');
    }
  });

  it('does not turn missing observations or a provider-free PR result into verified success', () => {
    expect(
      checkRecordView({
        id: 'review:s',
        kind: 'review',
        created_at: '',
        payload: { snapshot: { transition: { checks: {} } } },
      }).status
    ).toBe('not_observed');
    const items = checkItems({
      id: 'pull-request:p',
      kind: 'pull-request',
      created_at: '',
      payload: {
        checks: [
          {
            checkId: 'c',
            title: 'Constraints',
            status: 'passed',
            message: 'No CommitV2 Statement constraint provider configured',
          },
        ],
      },
    });
    expect(items[0].status).toBe('not_verified');
    expect(items[0].evidence).toMatchObject({ status: 'passed' });
  });
});
