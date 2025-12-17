/**
 * Status API Route
 *
 * GET /api/v1/status - System status and statistics
 */

import type { Router } from "../router";
import { sendJson } from "../router";
import { successResponse, errorResponse } from "../types";
import { getDb } from "@t3x/core";

interface StorageStats {
  database_size_bytes: number;
  ledger_files_count: number;
}

interface StatusData {
  projects_count: number;
  conversations_count: number;
  turns_count: number;
  commits_count: number;
  storage?: StorageStats;
}

/**
 * Get count from a table
 */
async function getCount(tableName: string, projectId?: string): Promise<number> {
  const db = getDb();

  if (projectId) {
    const stmt = db.prepare(`SELECT CAST(COUNT(*) AS INTEGER) as count FROM ${tableName} WHERE project_id = ?`);
    const row = await stmt.get(projectId) as { count: number } | undefined;
    return row?.count ?? 0;
  }

  const stmt = db.prepare(`SELECT CAST(COUNT(*) AS INTEGER) as count FROM ${tableName}`);
  const row = await stmt.get() as { count: number } | undefined;
  return row?.count ?? 0;
}

/**
 * Get database file size in bytes
 */
async function getDatabaseSize(): Promise<number> {
  try {
    const db = getDb();
    if (db.dialect === 'sqlite') {
      // Use PRAGMA to get page count and page size
      const pageCount = (await db.prepare("PRAGMA page_count").get() as { page_count: number })?.page_count ?? 0;
      const pageSize = (await db.prepare("PRAGMA page_size").get() as { page_size: number })?.page_size ?? 4096;
      return pageCount * pageSize;
    }

    // Postgres: query database size
    const row = await db
      .prepare("SELECT pg_database_size(current_database()) AS bytes")
      .get() as { bytes?: string | number } | undefined;
    const bytes = row?.bytes ?? 0;
    return typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  } catch {
    return 0;
  }
}

/**
 * Register status routes
 */
export function registerStatusRoutes(router: Router): void {
  // GET /api/v1/status - Get system status
  router.get("/api/v1/status", async (ctx, _req, res) => {
    try {
      const project_id = ctx.query.get("project_id") ?? undefined;

      let statusData: StatusData;

      if (project_id) {
        // Project-specific statistics
        // Check if project exists
        const db = getDb();
        const project = await db.prepare("SELECT 1 FROM projects WHERE project_id = ?").get(project_id);

        statusData = {
          projects_count: project ? 1 : 0,
          conversations_count: await getCount("conversations", project_id),
          turns_count: await getCount("turns_v2", project_id),
          commits_count: await getCount("commits_v2", project_id),
        };
      } else {
        // Global statistics
        statusData = {
          projects_count: await getCount("projects"),
          conversations_count: await getCount("conversations"),
          turns_count: await getCount("turns_v2"),
          commits_count: await getCount("commits_v2"),
          storage: {
            database_size_bytes: await getDatabaseSize(),
            ledger_files_count: 0, // TODO: Count ledger files if needed
          },
        };
      }

      sendJson(res, 200, successResponse(statusData));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("STATUS_ERROR", message));
    }
  });
}
