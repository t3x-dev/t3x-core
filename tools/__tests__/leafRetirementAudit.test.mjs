import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { aggregateQueries, inventoryRoutes, scanProject } from '../leaf-retirement-audit.mjs';

test('the API inventory contains all current Leaf routes and preserves readers only', async () => {
  const routes = await inventoryRoutes();
  assert.equal(routes.length, 16);
  assert.equal(routes.filter((r) => r.disposition === 'retain-read').length, 4);
  assert.ok(routes.some((r) => r.endpoint === 'POST /v1/commits/{hash}/leaves/batch'));
  assert.ok(
    routes.every((r) => r.endpoint.includes('leav') || r.endpoint.includes('leaf-history'))
  );
});

test('no database supplied is explicitly unscanned rather than zero usage', () => {
  const report = JSON.parse(execFileSync(process.execPath, ['tools/leaf-retirement-audit.mjs']));
  assert.deepEqual(report.data, { status: 'not-scanned', retirementAuthorized: false });
});

test('scan is read-only, project-bound and aggregate-only', async () => {
  const calls = [];
  const result = await scanProject(
    {
      async begin(mode, callback) {
        assert.equal(mode, 'isolation level repeatable read read only');
        return callback({
          async unsafe(query, params) {
            calls.push({ query, params });
            return [{ total: 3 }];
          },
        });
      },
    },
    "project-'--"
  );
  assert.equal(calls.length, 5);
  for (const call of calls.slice(1)) {
    assert.deepEqual(call.params, ["project-'--"]);
    assert.ok(call.query.includes('project_id = $1'));
    assert.ok(!call.query.includes("project-'--"));
    assert.ok(
      !/SELECT\s+(\*|output|prompt_used|original_output|modified_output)/i.test(call.query)
    );
  }
  assert.equal(result.retirementAuthorized, false);
  assert.equal(result.unresolved.length, 3);
  assert.equal(Object.keys(result.counts).length, Object.keys(aggregateQueries).length);
});

test('scan rejects an unscoped request before connecting', async () => {
  await assert.rejects(scanProject({}, ''), /Project is required/);
});
