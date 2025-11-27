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
      report.push(`Found duplicate turn hash: ${duplicateTurnHashes.map((row) => `${row.hash}(${row.c})`).join(', ')}`);
    }

    const invalidDraftStates = db
      .prepare(`SELECT id, state FROM drafts WHERE state NOT IN ('open','ready','committed')`)
      .all() as { id: number; state: string }[];
    if (invalidDraftStates.length > 0) {
      report.push(
        `Invalid draft state found: ${invalidDraftStates.map((row) => `#${row.id}:${row.state}`).join(', ')}`,
      );
    }

    const duplicateCommitHashes = db
      .prepare(`SELECT hash, COUNT(*) as c FROM commits GROUP BY hash HAVING c > 1`)
      .all() as { hash: string; c: number }[];
    if (duplicateCommitHashes.length > 0) {
      report.push(
        `Found duplicate commit hash: ${duplicateCommitHashes.map((row) => `${row.hash}(${row.c})`).join(', ')}`,
      );
    }

    const metaRow = db.prepare(`SELECT value FROM meta WHERE key='generation'`).get() as { value?: string } | undefined;
    if (!metaRow || Number(metaRow.value) < 0) {
      report.push('meta.generation missing or invalid.');
    }
  } catch (error) {
    report.push(`Validation execution failed: ${(error as Error).message}`);
  }

  return {
    ok: report.length === 0,
    report: report.length === 0 ? ['Validation: OK'] : report,
  };
}
