/**
 * Materials Queries
 *
 * CRUD operations for raw imported source materials.
 */

import {
  type CreateMaterialInput,
  generateMaterialId,
  type Material,
  type MaterialSourceType,
} from '@t3x-dev/core';
import { desc, eq, inArray } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type MaterialRecord, materials } from '../schema-trees';

export interface ListMaterialsOptions {
  limit?: number;
  offset?: number;
}

export async function createMaterial(db: AnyDB, input: CreateMaterialInput): Promise<Material> {
  const id = generateMaterialId();
  const now = new Date();

  const [row] = await db
    .insert(materials)
    .values({
      id,
      projectId: input.project_id,
      sourceType: input.source_type,
      title: input.title ?? null,
      filename: input.filename ?? null,
      mimeType: input.mime_type ?? null,
      contentText: input.content_text,
      contentHash: input.content_hash,
      metadata: input.metadata ?? {},
      tokenEstimate: input.token_estimate ?? 0,
      createdAt: now,
      createdBy: input.created_by ?? null,
    })
    .returning();

  return rowToMaterial(row);
}

export async function findMaterialById(db: AnyDB, id: string): Promise<Material | null> {
  const [row] = await db.select().from(materials).where(eq(materials.id, id)).limit(1);
  return row ? rowToMaterial(row) : null;
}

export async function findMaterialsByProject(
  db: AnyDB,
  projectId: string,
  options: ListMaterialsOptions = {}
): Promise<Material[]> {
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  const rows = await db
    .select()
    .from(materials)
    .where(eq(materials.projectId, projectId))
    .orderBy(desc(materials.createdAt), desc(materials.id))
    .limit(limit)
    .offset(offset);

  return rows.map(rowToMaterial);
}

export async function findMaterialsByIds(db: AnyDB, ids: string[]): Promise<Material[]> {
  if (ids.length === 0) return [];

  const rows = await db.select().from(materials).where(inArray(materials.id, ids));
  const byId = new Map(rows.map((row) => [row.id, rowToMaterial(row)]));

  return ids.flatMap((id) => {
    const material = byId.get(id);
    return material ? [material] : [];
  });
}

export async function deleteMaterial(db: AnyDB, id: string): Promise<boolean> {
  const result = await db.delete(materials).where(eq(materials.id, id)).returning();
  return result.length > 0;
}

function rowToMaterial(row: MaterialRecord): Material {
  return {
    id: row.id,
    project_id: row.projectId,
    source_type: row.sourceType as MaterialSourceType,
    title: row.title ?? undefined,
    filename: row.filename ?? undefined,
    mime_type: row.mimeType ?? undefined,
    content_text: row.contentText,
    content_hash: row.contentHash,
    metadata: row.metadata,
    token_estimate: row.tokenEstimate,
    created_at: row.createdAt.toISOString(),
    created_by: row.createdBy ?? undefined,
  };
}
