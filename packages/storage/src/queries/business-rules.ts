/**
 * Business Rules Queries
 *
 * CRUD for project-level business rules (Gate 3 configuration).
 */

import { eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { projects } from '../schema';

export interface BusinessRuleConfig {
  id: string;
  type: 'rule' | 'llm';
  rule?: string;
  prompt?: string;
  message?: string;
  severity: 'error' | 'warning';
}

/**
 * Get business rules for a project. Returns empty array if none configured.
 */
export async function getBusinessRules(
  db: AnyDB,
  projectId: string
): Promise<BusinessRuleConfig[]> {
  const rows = await db
    .select({ businessRules: projects.businessRules })
    .from(projects)
    .where(eq(projects.projectId, projectId))
    .limit(1);
  return (rows[0]?.businessRules as BusinessRuleConfig[] | null) ?? [];
}

/**
 * Replace all business rules for a project.
 * Returns the updated rules array, or empty array if project not found.
 * Callers should verify project existence before calling.
 */
export async function putBusinessRules(
  db: AnyDB,
  projectId: string,
  rules: BusinessRuleConfig[]
): Promise<BusinessRuleConfig[]> {
  const rows = await db
    .update(projects)
    .set({ businessRules: rules })
    .where(eq(projects.projectId, projectId))
    .returning();
  return (rows[0]?.businessRules as BusinessRuleConfig[] | null) ?? [];
}
