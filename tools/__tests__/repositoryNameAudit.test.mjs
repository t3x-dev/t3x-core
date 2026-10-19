import assert from 'node:assert/strict';
import test from 'node:test';
import { auditRepositoryClaims, auditRepositoryNames } from '../audit-repository-names.mjs';

test('read-only inventory reports normalization, conflicts, reserved and ownerless rows', () => {
  const rows = [
    'Demo',
    'demo',
    'My Project',
    'My-Project',
    '项目计划',
    'a'.repeat(101),
    'NEW',
    'HoloCure_fishing_auto',
  ].map((name, i) => ({
    project_id: `p${i}`,
    namespace_id: 'n',
    namespace: 'team',
    name,
    deleted_at: null,
  }));
  rows.push({
    project_id: 'unowned',
    namespace_id: null,
    namespace: null,
    name: 'Orphan',
    deleted_at: null,
  });
  const original = JSON.stringify(rows);
  const report = auditRepositoryNames(rows);
  assert.equal(JSON.stringify(rows), original);
  assert.ok(report[0].reasons.includes('CASE_INSENSITIVE_DUPLICATE'));
  assert.deepEqual(report[2].normalized_conflicts, ['p3']);
  assert.equal(report[4].suggested_name, '需人工指定');
  assert.ok(report[5].reasons.includes('NAME_TOO_LONG'));
  assert.ok(report[6].reasons.includes('NAME_RESERVED'));
  assert.equal(report[7].canonical_path, '/team/HoloCure_fishing_auto');
  assert.equal(report[8].can_establish_canonical_path, false);
});

test('historical claims and tombstones also appear as migration conflicts', () => {
  const rows = [
    { project_id: 'p', namespace_id: 'n', namespace: 'team', name: 'Old', deleted_at: null },
  ];
  const occupied = auditRepositoryNames(rows, [
    { namespace_id: 'n', name_key: 'old', project_id: 'other' },
  ]);
  assert.deepEqual(occupied[0].normalized_conflicts, ['other']);
  assert.equal(occupied[0].can_establish_canonical_path, false);
  const blocked = auditRepositoryNames(rows, [
    { namespace_id: 'n', name_key: 'old', project_id: null },
  ]);
  assert.ok(blocked[0].reasons.includes('PATH_BLOCKED'));
});

test('audits detached claims without inferring their origin or releasing them', () => {
  const rows = [
    { project_id: 'p', namespace_id: 'n', name: 'Deleted', deleted_at: '2026-10-19T00:00:00Z' },
  ];
  const claims = [
    { namespace_id: 'n', name_key: 'old', project_id: 'p', resolvable: true },
    { namespace_id: 'n', name_key: 'deleted', project_id: 'p', resolvable: true },
    { namespace_id: 'n', name_key: 'tombstone', project_id: null, resolvable: true },
    { namespace_id: 'n', name_key: 'collision', project_id: null, resolvable: false },
    { namespace_id: 'n', name_key: 'early-v76', project_id: null },
  ];
  const original = JSON.stringify({ rows, claims });
  const report = auditRepositoryClaims(rows, claims);
  assert.deepEqual(
    report.map((claim) => claim.classification),
    [
      'soft_deleted_project',
      'soft_deleted_project',
      'unknown_origin',
      'unknown_origin',
      'unknown_origin',
    ]
  );
  assert.ok(report.every((claim) => claim.action === 'retain'));
  assert.equal(JSON.stringify({ rows, claims }), original);
});
