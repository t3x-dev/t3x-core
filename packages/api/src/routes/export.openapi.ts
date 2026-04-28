/**
 * Export Routes with OpenAPI
 *
 * GET /v1/export/cfpack  - Export project as .cfpack (JSON archive)
 * GET /v1/export/ledger  - Export project as JSONL ledger
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  findConversationsByProject,
  findTurnsByProject,
  listActiveYOpsLogByConversation,
} from '@t3x-dev/storage';
import * as crypto from 'crypto';
import { getDB } from '../lib/db';
import { zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import { replayActiveDraftOnBaseline } from '../lib/yops-log-utils';
import { ErrorResponseSchema } from '../schemas/common';
import { ExportQuery } from '../schemas/export-contracts';

// ============================================================================
// Types (matching Python schemas)
// ============================================================================

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
  rings: Record<string, unknown> | null;
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

interface CfpackResponseType {
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

/**
 * Parse legacy rings JSON from DB. Returns raw parsed data or null.
 * Ring extraction has been retired but existing data may still be in the DB.
 */
function parseRings(ringsJson: string | null): Record<string, unknown> | null {
  if (!ringsJson) return null;
  try {
    return JSON.parse(ringsJson) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function computeJcsHash(obj: unknown): string {
  const canonical = JSON.stringify(obj, Object.keys(obj as object).sort(), 0);
  const hash = crypto.createHash('sha256').update(canonical).digest('hex');
  return `sha256:${hash}`;
}

// ============================================================================
// Routes
// ============================================================================

export const exportRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// GET /v1/export/cfpack — Export as cfpack JSON archive
// ============================================================

const exportCfpackRoute = createRoute({
  method: 'get',
  path: '/v1/export/cfpack',
  tags: ['Export'],
  summary: 'Export project as cfpack',
  description:
    'Exports a complete project as a .cfpack JSON archive including turns, commits, and findings with integrity hash.',
  request: {
    query: ExportQuery,
  },
  responses: {
    200: {
      description: 'Cfpack JSON archive',
      content: {
        'application/vnd.t3x.cfpack+json': {
          schema: z.unknown(),
        },
      },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Project not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// @ts-expect-error - OpenAPI handler return type
exportRoutes.openapi(exportCfpackRoute, async (c) => {
  const { project_id: projectId } = c.req.valid('query');

  try {
    const db = await getDB();

    // Access control check
    const accessResult = await assertProjectAccess(c, db, projectId);
    if (accessResult instanceof Response) return accessResult;
    const project = accessResult;

    const turnRows = await findTurnsByProject(db, { projectId, limit: 10000 });

    const turns: CfpackTurn[] = [];
    const allKeywords: Map<string, { count: number; polarity: string }> = new Map();

    for (const row of turnRows) {
      const rings = parseRings(row.ringsJson);

      turns.push({
        turn_hash: row.turnHash,
        parent_turn_hash: row.parentTurnHash,
        role: row.role,
        content: row.content,
        created_at: row.createdAt.toISOString(),
        rings,
      });

      // Extract keywords from legacy ring data if present
      const ring1 = (rings as Record<string, unknown>)?.ring1 as
        | { keywords?: unknown[] }
        | undefined;
      if (ring1?.keywords) {
        for (const kw of ring1.keywords) {
          const kwStr = typeof kw === 'string' ? kw : (kw as { lemma: string }).lemma;
          const existing = allKeywords.get(kwStr);
          if (existing) {
            existing.count++;
          } else {
            allKeywords.set(kwStr, { count: 1, polarity: 'neutral' });
          }
        }
      }
    }

    const commits: CfpackCommit[] = [];

    const aggregatedKeywords = Array.from(allKeywords.entries())
      .map(([lemma, data]) => ({ lemma, count: data.count, polarity: data.polarity }))
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

    // Build semantic snapshots from yops logs
    const semanticSnapshots: Record<string, unknown> = {};
    for (const conv of await findConversationsByProject(db, { projectId, limit: 10000 })) {
      const yopsLogs = await listActiveYOpsLogByConversation(db, conv.conversationId);
      if (yopsLogs.length > 0 || conv.parentCommitHash) {
        const snapshot = await replayActiveDraftOnBaseline(db, conv.conversationId);
        if (snapshot.trees.length === 0 && snapshot.relations.length === 0) continue;
        semanticSnapshots[conv.conversationId] = {
          trees: snapshot.trees,
          relations: snapshot.relations,
          yops_count: yopsLogs.length,
        };
      }
    }

    const cfpack: CfpackResponseType & { semantic_snapshots?: Record<string, unknown> } = {
      version: '1.0.0',
      cfpack_schema_version: '1.0.0',
      project: {
        project_id: project.projectId,
        name: project.name,
        created_at: project.createdAt.toISOString(),
      },
      turns,
      findings,
      commits,
      // Include Frame semantic snapshots if any conversations have Frame data
      ...(Object.keys(semanticSnapshots).length > 0
        ? { semantic_snapshots: semanticSnapshots }
        : {}),
      hash: null,
      meta: {
        exported_at: new Date().toISOString(),
        exported_by: 't3x-api@1.0.0',
      },
    };

    const { hash: _discarded, ...contentForHash } = cfpack;
    const packHash = computeJcsHash(contentForHash);

    cfpack.hash = {
      algorithm: 'sha256-jcs-v1',
      pack_hash: packHash,
    };

    return new Response(JSON.stringify(cfpack), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.t3x.cfpack+json',
        'Content-Disposition': `attachment; filename="${projectId}.cfpack"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'INTERNAL_ERROR', message } }, 500);
  }
});

// ============================================================
// GET /v1/export/ledger — Export as JSONL ledger
// ============================================================

const exportLedgerRoute = createRoute({
  method: 'get',
  path: '/v1/export/ledger',
  tags: ['Export'],
  summary: 'Export project as JSONL ledger',
  description:
    'Exports a project as a newline-delimited JSON ledger including project metadata, conversations, turns, and commits.',
  request: {
    query: ExportQuery,
  },
  responses: {
    200: {
      description: 'JSONL ledger file',
      content: {
        'application/x-ndjson': {
          schema: z.unknown(),
        },
      },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Project not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// @ts-expect-error - OpenAPI handler return type
exportRoutes.openapi(exportLedgerRoute, async (c) => {
  const { project_id: projectId } = c.req.valid('query');

  try {
    const db = await getDB();

    // Access control check
    const accessResult = await assertProjectAccess(c, db, projectId);
    if (accessResult instanceof Response) return accessResult;
    const project = accessResult;

    const lines: string[] = [];

    lines.push(
      JSON.stringify({
        type: 'project',
        project_id: project.projectId,
        name: project.name,
        created_at: project.createdAt.toISOString(),
      })
    );

    const conversations = await findConversationsByProject(db, { projectId, limit: 10000 });
    for (const conv of conversations) {
      lines.push(
        JSON.stringify({
          type: 'conversation',
          conversation_id: conv.conversationId,
          project_id: conv.projectId,
          title: conv.title,
          created_at: conv.createdAt.toISOString(),
        })
      );
    }

    const turns = await findTurnsByProject(db, { projectId, limit: 10000 });
    for (const turn of turns) {
      const rings = turn.ringsJson ? JSON.parse(turn.ringsJson) : null;
      lines.push(
        JSON.stringify({
          type: 'turn',
          turn_hash: turn.turnHash,
          parent_turn_hash: turn.parentTurnHash,
          project_id: turn.projectId,
          conversation_id: turn.conversationId,
          role: turn.role,
          content: turn.content,
          rings,
          created_at: turn.createdAt.toISOString(),
        })
      );
    }

    // Semantic snapshots
    for (const conv of conversations) {
      const yopsLogs = await listActiveYOpsLogByConversation(db, conv.conversationId);
      if (yopsLogs.length > 0 || conv.parentCommitHash) {
        const snapshot = await replayActiveDraftOnBaseline(db, conv.conversationId);
        if (snapshot.trees.length === 0 && snapshot.relations.length === 0) continue;
        lines.push(
          JSON.stringify({
            type: 'semantic_snapshot',
            conversation_id: conv.conversationId,
            trees: snapshot.trees,
            relations: snapshot.relations,
            yops_count: yopsLogs.length,
          })
        );
      }
    }

    const jsonlContent = lines.join('\n') + '\n';

    return new Response(jsonlContent, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Content-Disposition': `attachment; filename="${projectId}.jsonl"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'INTERNAL_ERROR', message } }, 500);
  }
});
