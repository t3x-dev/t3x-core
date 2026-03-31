/**
 * Commit Rewrites Queries — Append-Only Rewrite Log
 *
 * Records squash, rebase, amend operations. Never updated or deleted.
 */

import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { commitRewrites, type RewriteRecord } from '../schema-commits';

// ── Types ──

export interface InsertRewriteInput {
  projectId: string;
  branch: string;
  operation: 'squash' | 'rebase' | 'amend' | 'cherry_pick';
  sourceHashes: string[];
  resultHash: string;
  baseHash: string | null;
  opsReplayed: number;
  yopsLogIds: string[];
  author: { type: 'human' | 'agent' | 'system'; id?: string; name?: string };
}

// ── Queries ──

export async function insertRewrite(db: AnyDB, input: InsertRewriteInput): Promise<RewriteRecord> {
  const id = `rw_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const [row] = await db
    .insert(commitRewrites)
    .values({
      id,
      projectId: input.projectId,
      branch: input.branch,
      operation: input.operation,
      sourceHashes: input.sourceHashes,
      resultHash: input.resultHash,
      baseHash: input.baseHash,
      opsReplayed: input.opsReplayed,
      yopsLogIds: input.yopsLogIds,
      author: input.author,
    })
    .returning();
  return row;
}

export async function isCommitSuperseded(
  db: AnyDB,
  projectId: string,
  hash: string
): Promise<boolean> {
  const rewrites = await db
    .select({ sourceHashes: commitRewrites.sourceHashes })
    .from(commitRewrites)
    .where(eq(commitRewrites.projectId, projectId));

  for (const rw of rewrites) {
    if ((rw.sourceHashes as string[]).includes(hash)) return true;
  }
  return false;
}

export async function getSupersededHashes(db: AnyDB, projectId: string): Promise<Set<string>> {
  const rewrites = await db
    .select({ sourceHashes: commitRewrites.sourceHashes })
    .from(commitRewrites)
    .where(eq(commitRewrites.projectId, projectId));

  const hashes = new Set<string>();
  for (const rw of rewrites) {
    for (const h of rw.sourceHashes as string[]) {
      hashes.add(h);
    }
  }
  return hashes;
}

export async function listRewrites(db: AnyDB, projectId: string): Promise<RewriteRecord[]> {
  return db
    .select()
    .from(commitRewrites)
    .where(eq(commitRewrites.projectId, projectId))
    .orderBy(asc(commitRewrites.createdAt));
}
