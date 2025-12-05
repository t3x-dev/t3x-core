/**
 * Export API Routes
 *
 * GET /api/v1/export/cfpack - Export project as .cfpack (JSON archive)
 * GET /api/v1/export/ledger - Export project as JSONL ledger
 *
 * Compatible with Python core_api/routes/export.py response format.
 */

import * as crypto from "node:crypto";
import type { ServerResponse } from "node:http";
import type { Router } from "../router";
import { sendJson } from "../router";
import { errorResponse } from "../types";
import { getDb } from "@contextflow/core";

// ============================================================================
// Types (matching Python schemas)
// ============================================================================

interface Entity {
  text: string;
  type: string;
  start?: number;
  end?: number;
}

interface PreferenceKeyword {
  keyword: string;
  polarity: string;
  lemma: string;
}

interface Segment {
  id: string;
  text: string;
}

interface Ring1 {
  keywords: string[];
  entities: Entity[];
  time_anchor?: string;
  preference_keywords: PreferenceKeyword[];
}

interface Ring2 {
  intent_seed?: string;
  time_window?: string;
  preference_soft: string[];
  unknown_slot: string[];
  facets: string[];
}

interface Ring3 {
  segments: Segment[];
}

interface Rings {
  ring1: Ring1;
  ring2: Ring2;
  ring3: Ring3;
}

interface TurnWindow {
  start_turn_hash: string;
  end_turn_hash: string;
}

interface EvidenceRef {
  turn_hash: string;
  segment_id: string;
  similarity_score: number;
}

interface FacetSnapshot {
  facet: string;
  text: string;
  keywords: string[];
  evidence: EvidenceRef[];
}

interface PipelineConfig {
  id: string;
  sha256: string;
}

interface CfpackTurn {
  turn_hash: string;
  parent_turn_hash: string | null;
  role: string;
  content: string;
  created_at: string;
  rings: Rings | null;
}

interface CfpackCommit {
  commit_hash: string;
  parent_hashes: string[];
  branch: string;
  turn_window: TurnWindow;
  facet_snapshot: FacetSnapshot[];
  pipeline_config: PipelineConfig | null;
  created_at: string;
}

interface CfpackProject {
  project_id: string;
  name: string;
  created_at: string;
}

interface CfpackFindings {
  aggregated_keywords: Array<{ lemma: string; count: number; polarity: string }>;
  must_have: string[];
  mustnt_have: string[];
  evidence_refs: EvidenceRef[];
}

interface CfpackMeta {
  exported_at: string;
  exported_by: string;
}

interface CfpackHash {
  algorithm: string;
  pack_hash: string;
}

interface CfpackResponse {
  version: string;
  cfpack_schema_version: string;
  project: CfpackProject;
  turns: CfpackTurn[];
  findings: CfpackFindings;
  commits: CfpackCommit[];
  hash: CfpackHash | null;
  meta: CfpackMeta;
}

// ============================================================================
// Helpers
// ============================================================================

function parseRings(ringsJson: string | null): Rings | null {
  if (!ringsJson) return null;

  try {
    const data = JSON.parse(ringsJson);
    const ring1 = data.ring1 ?? {};
    const ring2 = data.ring2 ?? {};
    const ring3 = data.ring3 ?? {};

    return {
      ring1: {
        keywords: ring1.keywords ?? [],
        entities: (ring1.entities ?? []).map((e: Entity) => ({
          text: e.text,
          type: e.type,
          start: e.start,
          end: e.end,
        })),
        time_anchor: ring1.time_anchor,
        preference_keywords: (ring1.preference_keywords ?? []).map((pk: PreferenceKeyword) => ({
          keyword: pk.keyword,
          polarity: pk.polarity,
          lemma: pk.lemma,
        })),
      },
      ring2: {
        intent_seed: ring2.intent_seed,
        time_window: ring2.time_window,
        preference_soft: ring2.preference_soft ?? [],
        unknown_slot: ring2.unknown_slot ?? [],
        facets: ring2.facets ?? [],
      },
      ring3: {
        segments: (ring3.segments ?? []).map((s: Segment) => ({
          id: s.id,
          text: s.text,
        })),
      },
    };
  } catch {
    return null;
  }
}

function computeJcsHash(obj: unknown): string {
  // JCS (JSON Canonicalization Scheme): sorted keys, no extra whitespace
  const canonical = JSON.stringify(obj, Object.keys(obj as object).sort(), 0);
  const hash = crypto.createHash("sha256").update(canonical).digest("hex");
  return `sha256:${hash}`;
}

// ============================================================================
// Route Registration
// ============================================================================

export function registerExportRoutes(router: Router): void {
  // GET /api/v1/export/cfpack - Export as .cfpack
  router.get("/api/v1/export/cfpack", async (ctx, _req, res) => {
    const projectId = ctx.query.get("project_id");

    if (!projectId) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "project_id query param is required"));
      return;
    }

    try {
      const db = getDb();

      // Get project
      const project = db.prepare(
        "SELECT project_id, name, created_at FROM projects WHERE project_id = ?"
      ).get(projectId) as { project_id: string; name: string; created_at: string } | undefined;

      if (!project) {
        sendJson(res, 404, errorResponse("NOT_FOUND", `Project ${projectId} not found`));
        return;
      }

      // Get all turns
      const turnRows = db.prepare(`
        SELECT turn_hash, parent_turn_hash, role, content, rings_json, created_at
        FROM turns_v2
        WHERE project_id = ?
        ORDER BY created_at ASC
      `).all(projectId) as Array<{
        turn_hash: string;
        parent_turn_hash: string | null;
        role: string;
        content: string;
        rings_json: string | null;
        created_at: string;
      }>;

      const turns: CfpackTurn[] = [];
      const allKeywords: Map<string, { count: number; polarity: string }> = new Map();

      for (const row of turnRows) {
        const rings = parseRings(row.rings_json);

        turns.push({
          turn_hash: row.turn_hash,
          parent_turn_hash: row.parent_turn_hash,
          role: row.role,
          content: row.content,
          created_at: row.created_at,
          rings,
        });

        // Aggregate keywords for findings
        if (rings?.ring1.keywords) {
          for (const kw of rings.ring1.keywords) {
            const existing = allKeywords.get(kw);
            if (existing) {
              existing.count++;
            } else {
              allKeywords.set(kw, { count: 1, polarity: "neutral" });
            }
          }
        }
      }

      // Get all commits
      const commitRows = db.prepare(`
        SELECT commit_hash, parents_json, branch, turn_window_json,
               facet_snapshot_json, pipeline_config_json, created_at
        FROM commits_v2
        WHERE project_id = ?
        ORDER BY created_at ASC
      `).all(projectId) as Array<{
        commit_hash: string;
        parents_json: string;
        branch: string;
        turn_window_json: string;
        facet_snapshot_json: string;
        pipeline_config_json: string | null;
        created_at: string;
      }>;

      const commits: CfpackCommit[] = [];
      for (const row of commitRows) {
        const turnWindow = JSON.parse(row.turn_window_json) as TurnWindow;
        const facetSnapshotData = JSON.parse(row.facet_snapshot_json) as FacetSnapshot[];
        const pipelineConfig = row.pipeline_config_json
          ? (JSON.parse(row.pipeline_config_json) as PipelineConfig)
          : null;

        commits.push({
          commit_hash: row.commit_hash,
          parent_hashes: JSON.parse(row.parents_json),
          branch: row.branch,
          turn_window: turnWindow,
          facet_snapshot: facetSnapshotData,
          pipeline_config: pipelineConfig,
          created_at: row.created_at,
        });
      }

      // Build findings
      const aggregatedKeywords = Array.from(allKeywords.entries())
        .map(([lemma, data]) => ({
          lemma,
          count: data.count,
          polarity: data.polarity,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 50);

      const mustHave = Array.from(allKeywords.entries())
        .filter(([, data]) => data.count >= 2)
        .map(([kw]) => kw)
        .slice(0, 20);

      const findings: CfpackFindings = {
        aggregated_keywords: aggregatedKeywords,
        must_have: mustHave,
        mustnt_have: [],
        evidence_refs: [],
      };

      // Build response (without hash first)
      const cfpack: CfpackResponse = {
        version: "1.0.0",
        cfpack_schema_version: "1.0.0",
        project: {
          project_id: project.project_id,
          name: project.name,
          created_at: project.created_at,
        },
        turns,
        findings,
        commits,
        hash: null,
        meta: {
          exported_at: new Date().toISOString(),
          exported_by: "contextflow-cli@1.0.0",
        },
      };

      // Compute hash
      const { hash: _, ...contentForHash } = cfpack;
      const packHash = computeJcsHash(contentForHash);

      cfpack.hash = {
        algorithm: "sha256-jcs-v1",
        pack_hash: packHash,
      };

      // Send response with custom MIME type
      res.writeHead(200, {
        "Content-Type": "application/vnd.contextflow.cfpack+json",
        "Content-Disposition": `attachment; filename="${projectId}.cfpack"`,
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify(cfpack));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("EXPORT_FAILED", message));
    }
  });

  // GET /api/v1/export/ledger - Export as JSONL
  router.get("/api/v1/export/ledger", async (ctx, _req, res) => {
    const projectId = ctx.query.get("project_id");

    if (!projectId) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "project_id query param is required"));
      return;
    }

    try {
      const db = getDb();

      // Check project exists
      const project = db.prepare(
        "SELECT project_id, name, created_at FROM projects WHERE project_id = ?"
      ).get(projectId) as { project_id: string; name: string; created_at: string } | undefined;

      if (!project) {
        sendJson(res, 404, errorResponse("NOT_FOUND", `Project ${projectId} not found`));
        return;
      }

      // Set streaming headers
      res.writeHead(200, {
        "Content-Type": "application/x-ndjson",
        "Content-Disposition": `attachment; filename="${projectId}.jsonl"`,
        "Access-Control-Allow-Origin": "*",
      });

      // Stream JSONL

      // 1. Project metadata
      res.write(JSON.stringify({
        type: "project",
        project_id: project.project_id,
        name: project.name,
        created_at: project.created_at,
      }) + "\n");

      // 2. Conversations
      const conversations = db.prepare(`
        SELECT conversation_id, project_id, title, created_at
        FROM conversations
        WHERE project_id = ?
        ORDER BY created_at ASC
      `).all(projectId) as Array<{
        conversation_id: string;
        project_id: string;
        title: string | null;
        created_at: string;
      }>;

      for (const conv of conversations) {
        res.write(JSON.stringify({
          type: "conversation",
          conversation_id: conv.conversation_id,
          project_id: conv.project_id,
          title: conv.title,
          created_at: conv.created_at,
        }) + "\n");
      }

      // 3. Turns
      const turns = db.prepare(`
        SELECT turn_hash, parent_turn_hash, project_id, conversation_id,
               role, content, rings_json, created_at
        FROM turns_v2
        WHERE project_id = ?
        ORDER BY created_at ASC
      `).all(projectId) as Array<{
        turn_hash: string;
        parent_turn_hash: string | null;
        project_id: string;
        conversation_id: string;
        role: string;
        content: string;
        rings_json: string | null;
        created_at: string;
      }>;

      for (const turn of turns) {
        const rings = turn.rings_json ? JSON.parse(turn.rings_json) : null;
        res.write(JSON.stringify({
          type: "turn",
          turn_hash: turn.turn_hash,
          parent_turn_hash: turn.parent_turn_hash,
          project_id: turn.project_id,
          conversation_id: turn.conversation_id,
          role: turn.role,
          content: turn.content,
          rings,
          created_at: turn.created_at,
        }) + "\n");
      }

      // 4. Commits
      const commits = db.prepare(`
        SELECT commit_hash, project_id, branch, message, parents_json,
               turn_window_json, facet_snapshot_json, pipeline_config_json,
               draft_id, draft_text_hash, created_at
        FROM commits_v2
        WHERE project_id = ?
        ORDER BY created_at ASC
      `).all(projectId) as Array<{
        commit_hash: string;
        project_id: string;
        branch: string;
        message: string | null;
        parents_json: string;
        turn_window_json: string;
        facet_snapshot_json: string;
        pipeline_config_json: string | null;
        draft_id: string | null;
        draft_text_hash: string | null;
        created_at: string;
      }>;

      for (const commit of commits) {
        res.write(JSON.stringify({
          type: "commit",
          commit_hash: commit.commit_hash,
          project_id: commit.project_id,
          branch: commit.branch,
          message: commit.message,
          parent_hashes: JSON.parse(commit.parents_json),
          turn_window: JSON.parse(commit.turn_window_json),
          facet_snapshot: JSON.parse(commit.facet_snapshot_json),
          pipeline_config: commit.pipeline_config_json
            ? JSON.parse(commit.pipeline_config_json)
            : null,
          draft_id: commit.draft_id,
          draft_text_hash: commit.draft_text_hash,
          created_at: commit.created_at,
        }) + "\n");
      }

      res.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      // If headers already sent, just end
      if (res.headersSent) {
        res.end();
      } else {
        sendJson(res, 500, errorResponse("EXPORT_FAILED", message));
      }
    }
  });
}
