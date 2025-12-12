/**
 * Commits V2 API Routes
 */

import type { Router } from "../router";
import { sendJson } from "../router";
import { successResponse, errorResponse, ProviderConfig } from "../types";
import {
  createCommitV2,
  getCommitV2,
  listCommitsV2,
  getCommitParents,
  getCommitHistory,
  updateCommitPosition,
  findCommonAncestor,
  getProject,
  getTurnV2,
  getTurnsInWindow,
  getDraftV2,
  getDraftTextHash,
  getBranch,
  TurnWindowError,
  CommitError,
} from "../../core/storage";

/**
 * Register commits V2 routes
 */
export function registerCommitsV2Routes(router: Router, _providers: ProviderConfig): void {
  // POST /api/v1/commits - Create commit
  // Supports two modes:
  // 1. Regular commit: requires turn_window, facet_snapshot is auto-generated
  // 2. Merge commit: requires merge_parents + facet_snapshot (resolved facets)
  router.post("/api/v1/commits", async (ctx, _req, res) => {
    const body = ctx.body as {
      project_id?: string;
      branch?: string;
      message?: string;
      turn_window?: {
        start_turn_hash: string;
        end_turn_hash: string;
      };
      // Merge commit fields
      merge_parents?: string[];  // [source_hash, target_hash]
      facet_snapshot?: unknown[];  // Required for merge commits, auto-generated for regular
      draft_id?: string;
      pipeline_config?: unknown;
      signature?: unknown;
      source_excerpt?: string[];
      must_have?: string[];
      mustnt_have?: string[];
      position_x?: number;
      position_y?: number;
    } | null;

    if (!body?.project_id) {
      sendJson(res, 400, errorResponse(
        "INVALID_REQUEST",
        "project_id is required"
      ));
      return;
    }

    // Determine commit type - enforce mutual exclusivity
    const hasMergeParents = body.merge_parents && body.merge_parents.length > 0;
    const hasTurnWindow = !!body.turn_window;

    // Mutual exclusivity check
    if (hasMergeParents && hasTurnWindow) {
      sendJson(res, 400, errorResponse(
        "INVALID_REQUEST",
        "Cannot specify both merge_parents and turn_window. Use one or the other."
      ));
      return;
    }

    const isMergeCommit = hasMergeParents;

    // Validate based on commit type
    if (isMergeCommit) {
      // Merge commit requires facet_snapshot
      if (!body.facet_snapshot || !Array.isArray(body.facet_snapshot)) {
        sendJson(res, 400, errorResponse(
          "INVALID_REQUEST",
          "merge commits require facet_snapshot with resolved facets"
        ));
        return;
      }
      if (body.merge_parents!.length < 2) {
        sendJson(res, 400, errorResponse(
          "INVALID_REQUEST",
          "merge_parents must contain at least 2 commit hashes"
        ));
        return;
      }
    } else {
      // Regular commit requires turn_window
      if (!body.turn_window) {
        sendJson(res, 400, errorResponse(
          "INVALID_REQUEST",
          "turn_window is required for regular commits (or use merge_parents for merge commits)"
        ));
        return;
      }
    }

    // Verify project exists
    const project = getProject(body.project_id);
    if (!project) {
      sendJson(res, 404, errorResponse("NOT_FOUND", `Project ${body.project_id} not found`));
      return;
    }

    // For merge commits: verify parent commits exist
    if (isMergeCommit) {
      for (const parentHash of body.merge_parents!) {
        const parentCommit = getCommitV2(parentHash);
        if (!parentCommit) {
          sendJson(res, 404, errorResponse(
            "NOT_FOUND",
            `Parent commit ${parentHash} not found`
          ));
          return;
        }
        if (parentCommit.project_id !== body.project_id) {
          sendJson(res, 400, errorResponse(
            "INVALID_REQUEST",
            `Parent commit ${parentHash} does not belong to project ${body.project_id}`
          ));
          return;
        }
      }
    }

    // For regular commits: verify turns exist and belong to same conversation
    if (!isMergeCommit && body.turn_window) {
      const startTurn = getTurnV2(body.turn_window.start_turn_hash);
      const endTurn = getTurnV2(body.turn_window.end_turn_hash);

      if (!startTurn || !endTurn) {
        sendJson(res, 404, errorResponse("NOT_FOUND", "Start or end turn not found"));
        return;
      }

      if (startTurn.conversation_id !== endTurn.conversation_id) {
        sendJson(res, 400, errorResponse(
          "INVALID_REQUEST",
          "Start and end turns must be in the same conversation"
        ));
        return;
      }

      if (startTurn.project_id !== body.project_id || endTurn.project_id !== body.project_id) {
        sendJson(res, 400, errorResponse(
          "INVALID_REQUEST",
          "Turns must belong to the specified project"
        ));
        return;
      }
    }

    // Verify branch exists (if specified and not 'main')
    const targetBranch = body.branch ?? "main";
    if (targetBranch !== "main") {
      const branch = getBranch(body.project_id, targetBranch);
      if (!branch) {
        sendJson(res, 404, errorResponse(
          "NOT_FOUND",
          `Branch '${targetBranch}' does not exist`
        ));
        return;
      }
    }

    // Validate draft belongs to same project if specified
    let draft_text_hash: string | undefined;
    if (body.draft_id) {
      const draft = getDraftV2(body.draft_id);
      if (!draft) {
        sendJson(res, 404, errorResponse("NOT_FOUND", `Draft ${body.draft_id} not found`));
        return;
      }
      if (draft.project_id !== body.project_id) {
        sendJson(res, 400, errorResponse(
          "INVALID_REQUEST",
          "Draft does not belong to the specified project"
        ));
        return;
      }
      draft_text_hash = getDraftTextHash(body.draft_id) ?? undefined;
    }

    try {
      let facet_snapshot: unknown[];

      if (isMergeCommit) {
        // Use provided facet_snapshot for merge commits
        facet_snapshot = body.facet_snapshot!;
      } else {
        // Get turns in window for facet aggregation (regular commits)
        const turns = getTurnsInWindow(
          body.turn_window!.start_turn_hash,
          body.turn_window!.end_turn_hash
        );
        // Aggregate facet snapshot from turns' rings
        facet_snapshot = aggregateFacets(turns);
      }

      const commit = createCommitV2({
        project_id: body.project_id,
        branch: targetBranch,
        message: body.message,
        turn_window: body.turn_window,
        merge_parents: body.merge_parents,
        facet_snapshot,
        pipeline_config: body.pipeline_config,
        draft_id: body.draft_id,
        draft_text_hash,
        signature: body.signature,
        source_excerpt: body.source_excerpt,
        must_have: body.must_have,
        mustnt_have: body.mustnt_have,
        position_x: body.position_x,
        position_y: body.position_y,
      });

      // Parse parents for response
      const parents = JSON.parse(commit.parents_json) as string[];

      // Add metadata about commit lineage
      const response = {
        ...commit,
        _meta: {
          is_root_commit: parents.length === 0,
          parent_count: parents.length,
          is_merge_commit: isMergeCommit,
          ...(parents.length === 0 && {
            note: "This is the first commit on this branch (root commit)",
          }),
          ...(isMergeCommit && {
            note: "This is a merge commit combining multiple parent commits",
          }),
        },
      };

      sendJson(res, 201, successResponse(response));
    } catch (err) {
      // Handle specific error types
      if (err instanceof TurnWindowError) {
        sendJson(res, 400, errorResponse("INVALID_TURN_WINDOW", err.message));
        return;
      }
      if (err instanceof CommitError) {
        const status = err.code === "BRANCH_NOT_FOUND" ? 404 : 400;
        sendJson(res, status, errorResponse(err.code, err.message));
        return;
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("CREATE_FAILED", message));
    }
  });

  // GET /api/v1/commits - List commits
  router.get("/api/v1/commits", async (ctx, _req, res) => {
    const project_id = ctx.query.get("project_id");

    if (!project_id) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "project_id query param is required"));
      return;
    }

    const branch = ctx.query.get("branch") ?? undefined;
    const limit = parseInt(ctx.query.get("limit") ?? "100", 10);
    const offset = parseInt(ctx.query.get("offset") ?? "0", 10);

    try {
      const commits = listCommitsV2({ project_id, branch, limit, offset });
      sendJson(res, 200, successResponse({ commits, project_id, branch, limit, offset }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("LIST_FAILED", message));
    }
  });

  // GET /api/v1/commits/:hash - Get commit
  router.get(/^\/api\/v1\/commits\/(sha256:[a-f0-9]+)$/, async (ctx, _req, res) => {
    const match = ctx.path.match(/^\/api\/v1\/commits\/(sha256:[a-f0-9]+)$/);
    const commit_hash = match?.[1];

    if (!commit_hash) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "commit_hash is required"));
      return;
    }

    try {
      const commit = getCommitV2(commit_hash);
      if (!commit) {
        sendJson(res, 404, errorResponse("NOT_FOUND", `Commit ${commit_hash} not found`));
        return;
      }
      sendJson(res, 200, successResponse(commit));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("GET_FAILED", message));
    }
  });

  // PATCH /api/v1/commits/:hash/position - Update commit position
  router.patch(/^\/api\/v1\/commits\/(sha256:[a-f0-9]+)\/position$/, async (ctx, _req, res) => {
    const match = ctx.path.match(/^\/api\/v1\/commits\/(sha256:[a-f0-9]+)\/position$/);
    const commit_hash = match?.[1];

    if (!commit_hash) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "commit_hash is required"));
      return;
    }

    const body = ctx.body as { position_x?: number; position_y?: number } | null;

    try {
      const commit = updateCommitPosition(commit_hash, {
        x: body?.position_x,
        y: body?.position_y,
      });
      if (!commit) {
        sendJson(res, 404, errorResponse("NOT_FOUND", `Commit ${commit_hash} not found`));
        return;
      }
      sendJson(res, 200, successResponse(commit));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("UPDATE_FAILED", message));
    }
  });

  // GET /api/v1/commits/:hash/parents - Get commit parents
  router.get(/^\/api\/v1\/commits\/(sha256:[a-f0-9]+)\/parents$/, async (ctx, _req, res) => {
    const match = ctx.path.match(/^\/api\/v1\/commits\/(sha256:[a-f0-9]+)\/parents$/);
    const commit_hash = match?.[1];

    if (!commit_hash) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "commit_hash is required"));
      return;
    }

    try {
      const parents = getCommitParents(commit_hash);
      sendJson(res, 200, successResponse({ parents, commit_hash }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("GET_FAILED", message));
    }
  });

  // GET /api/v1/commits/:hash/history - Get commit history
  router.get(/^\/api\/v1\/commits\/(sha256:[a-f0-9]+)\/history$/, async (ctx, _req, res) => {
    const match = ctx.path.match(/^\/api\/v1\/commits\/(sha256:[a-f0-9]+)\/history$/);
    const commit_hash = match?.[1];

    if (!commit_hash) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "commit_hash is required"));
      return;
    }

    const limit = parseInt(ctx.query.get("limit") ?? "50", 10);

    try {
      const history = getCommitHistory(commit_hash, limit);
      sendJson(res, 200, successResponse({ history, commit_hash }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("GET_FAILED", message));
    }
  });

  // GET /api/v1/commits/common-ancestor - Find common ancestor
  router.get("/api/v1/commits/common-ancestor", async (ctx, _req, res) => {
    const hash1 = ctx.query.get("hash1");
    const hash2 = ctx.query.get("hash2");

    if (!hash1 || !hash2) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "hash1 and hash2 query params are required"));
      return;
    }

    try {
      const ancestor = findCommonAncestor(hash1, hash2);
      if (!ancestor) {
        sendJson(res, 404, errorResponse("NOT_FOUND", "No common ancestor found"));
        return;
      }
      sendJson(res, 200, successResponse(ancestor));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("GET_FAILED", message));
    }
  });
}

/**
 * Aggregate facets from turns' ring data
 * Primary source: ring3.segments (semantic segments)
 * Fallback: ring2.facets, ring2.intent_seeds, ring2.preferences, ring1.keywords
 */
function aggregateFacets(turns: Array<{ rings_json: string | null }>): unknown[] {
  const facets: unknown[] = [];

  for (const turn of turns) {
    if (!turn.rings_json) continue;

    try {
      const rings = JSON.parse(turn.rings_json);
      const sourceTurn = (turn as any).turn_hash;

      // Primary: Extract segments from ring3 (main facet data)
      if (rings.ring3?.segments && Array.isArray(rings.ring3.segments)) {
        // Extract keywords from ring1 for enrichment
        const keywords = rings.ring1?.keywords?.map((kw: any) => kw.lemma || kw.text) ?? [];

        for (const seg of rings.ring3.segments) {
          facets.push({
            facet: seg.segmentId,
            text: seg.text,
            keywords,
            source_turn: sourceTurn,
          });
        }
      }

      // Fallback: Extract facets from ring2 if present
      if (rings.ring2?.facets && Array.isArray(rings.ring2.facets)) {
        for (const facet of rings.ring2.facets) {
          // Avoid duplicates if already extracted from ring3
          if (!facets.some((f: any) => f.text === facet.text)) {
            facets.push({
              facet: facet.id || "ring2-facet",
              text: facet.text,
              confidence: facet.confidence,
              source_turn: sourceTurn,
            });
          }
        }
      }

      // Legacy: Extract goal facets from ring2 intents
      if (rings.ring2?.intent_seeds) {
        for (const seed of rings.ring2.intent_seeds) {
          facets.push({
            facet: "goal",
            text: seed.text,
            confidence: seed.confidence,
            source_turn: sourceTurn,
          });
        }
      }

      // Legacy: Extract preference facets from ring2 preferences
      if (rings.ring2?.preferences) {
        for (const pref of rings.ring2.preferences) {
          facets.push({
            facet: "preference",
            key: pref.key,
            value: pref.value,
            confidence: pref.confidence,
            source_turn: sourceTurn,
          });
        }
      }

      // Legacy: Extract context facets from ring1 entities
      if (rings.ring1?.keywords) {
        const entities = rings.ring1.keywords.filter((k: any) => k.entity_type);
        for (const entity of entities) {
          facets.push({
            facet: "context",
            entity_type: entity.entity_type,
            text: entity.text,
            confidence: entity.confidence,
            source_turn: sourceTurn,
          });
        }
      }
    } catch {
      // Skip malformed ring data
    }
  }

  return facets;
}
