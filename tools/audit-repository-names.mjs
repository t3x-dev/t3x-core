#!/usr/bin/env node
/** Read-only migration inventory. Never imports a bootstrap adapter. */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { inspectRepositoryName } from '../packages/application/dist/index.js';

export function auditRepositoryNames(rows, claims = []) {
  const byCandidate = new Map();
  for (const row of rows) {
    const key = `${row.namespace_id}\0${inspectRepositoryName(row.name).name.toLowerCase()}`;
    byCandidate.set(key, [...(byCandidate.get(key) ?? []), row.project_id]);
  }
  return rows.map((row) => {
    const naming = inspectRepositoryName(row.name);
    const reasons = [];
    if (naming.changed) reasons.push('NAME_REQUIRES_NORMALIZATION');
    if (naming.code) reasons.push(naming.code);
    if (!row.namespace) reasons.push('NAMESPACE_MISSING');
    const conflicts = (
      byCandidate.get(`${row.namespace_id}\0${naming.name.toLowerCase()}`) ?? []
    ).filter((id) => id !== row.project_id);
    const claim = claims.find(
      (p) => p.namespace_id === row.namespace_id && p.name_key === naming.name.toLowerCase()
    );
    if (claim && claim.project_id !== row.project_id) {
      if (claim.project_id && !conflicts.includes(claim.project_id))
        conflicts.push(claim.project_id);
      reasons.push(claim.project_id ? 'PATH_OCCUPIED' : 'PATH_BLOCKED');
    }
    if (conflicts.length) reasons.push('NORMALIZED_PATH_CONFLICT');
    const exactDuplicates = rows.filter(
      (p) =>
        p.project_id !== row.project_id &&
        p.namespace_id === row.namespace_id &&
        p.name.toLowerCase() === row.name.toLowerCase()
    );
    if (exactDuplicates.length) reasons.push('CASE_INSENSITIVE_DUPLICATE');
    const safe = reasons.length === 0;
    return {
      project_id: row.project_id,
      namespace: row.namespace,
      original_name: row.name,
      suggested_name: naming.valid ? naming.name : '需人工指定',
      reasons,
      normalized_conflicts: conflicts,
      deleted_at: row.deleted_at,
      can_establish_canonical_path: safe,
      canonical_path: safe ? `/${row.namespace}/${row.name}` : null,
      path_record_present: claim?.project_id === row.project_id,
    };
  });
}

async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error(
      'Set DATABASE_URL to the database to inspect. This tool never starts or migrates a database.'
    );
  const require = createRequire(new URL('../packages/storage/package.json', import.meta.url));
  const postgres = require('postgres');
  const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice() {} });
  try {
    const report = await sql.begin('isolation level repeatable read read only', async (tx) => {
      const rows =
        await tx`SELECT p.project_id, p.namespace_id, n.slug AS namespace, p.name, p.deleted_at FROM projects p LEFT JOIN namespaces n USING (namespace_id) ORDER BY p.project_id`;
      const [table] =
        await tx`SELECT to_regclass('public.repository_paths') IS NOT NULL AS present`;
      const claims = table.present
        ? await tx`SELECT namespace_id, name_key, project_id FROM repository_paths`
        : [];
      const entries = auditRepositoryNames(rows, claims);
      return {
        generated_at: new Date().toISOString(),
        read_only: true,
        path_schema_present: table.present,
        total: entries.length,
        anomalous: entries.filter((e) => e.reasons.length).length,
        entries,
      };
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await sql.end();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`Repository name audit failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
