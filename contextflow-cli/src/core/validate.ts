import { getDb } from './db';

export interface ValidationResult {
  ok: boolean;
  report: string[];
}

export function validateAll(): ValidationResult {
  const report: string[] = [];

  try {
    const db = getDb();

    const duplicateTurnHashes = db
      .prepare(`SELECT hash, COUNT(*) as c FROM turns GROUP BY hash HAVING c > 1`)
      .all() as { hash: string; c: number }[];
    if (duplicateTurnHashes.length > 0) {
      report.push(`发现重复 turn hash: ${duplicateTurnHashes.map((row) => `${row.hash}(${row.c})`).join(', ')}`);
    }

    const invalidDraftStates = db
      .prepare(`SELECT id, state FROM drafts WHERE state NOT IN ('open','ready','committed')`)
      .all() as { id: number; state: string }[];
    if (invalidDraftStates.length > 0) {
      report.push(
        `存在非法 draft state: ${invalidDraftStates.map((row) => `#${row.id}:${row.state}`).join(', ')}`,
      );
    }

    const duplicateCommitHashes = db
      .prepare(`SELECT hash, COUNT(*) as c FROM commits GROUP BY hash HAVING c > 1`)
      .all() as { hash: string; c: number }[];
    if (duplicateCommitHashes.length > 0) {
      report.push(
        `发现重复 commit hash: ${duplicateCommitHashes.map((row) => `${row.hash}(${row.c})`).join(', ')}`,
      );
    }

    const metaRow = db.prepare(`SELECT value FROM meta WHERE key='generation'`).get() as { value?: string } | undefined;
    if (!metaRow || Number(metaRow.value) < 0) {
      report.push('meta.generation 缺失或非法。');
    }
  } catch (error) {
    report.push(`validate 执行失败: ${(error as Error).message}`);
  }

  return {
    ok: report.length === 0,
    report: report.length === 0 ? ['validate: OK'] : report,
  };
}
