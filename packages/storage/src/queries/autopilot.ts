/**
 * Autopilot Configuration Queries
 *
 * CRUD for project-level autopilot settings.
 */

import { type AutopilotConfig, DEFAULT_AUTOPILOT_CONFIG } from '@t3x-dev/core';
import { eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { projects } from '../schema';

export type AutopilotConfigOutput = AutopilotConfig;

/**
 * Get autopilot config for a project. Returns null if not configured.
 */
export async function getAutopilotConfig(
  db: AnyDB,
  projectId: string
): Promise<AutopilotConfigOutput | null> {
  const [row] = await db
    .select({ autopilotConfig: projects.autopilotConfig })
    .from(projects)
    .where(eq(projects.projectId, projectId))
    .limit(1);

  if (!row || !row.autopilotConfig) return null;
  return row.autopilotConfig as AutopilotConfigOutput;
}

/**
 * Update autopilot config for a project. Merges with existing config.
 * Throws if project does not exist.
 */
export async function updateAutopilotConfig(
  db: AnyDB,
  projectId: string,
  config: Partial<AutopilotConfigOutput>
): Promise<AutopilotConfigOutput> {
  const existing = await getAutopilotConfig(db, projectId);

  const merged: AutopilotConfigOutput = {
    ...DEFAULT_AUTOPILOT_CONFIG,
    ...(existing ?? {}),
    ...config,
  };

  const result = await db
    .update(projects)
    .set({ autopilotConfig: merged })
    .where(eq(projects.projectId, projectId))
    .returning();

  if (result.length === 0) {
    throw new Error(`Project not found: ${projectId}`);
  }

  return merged;
}
