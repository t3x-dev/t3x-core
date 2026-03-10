/**
 * Export Routes with OpenAPI
 *
 * GET /v1/export/cfpack  - Export project as .cfpack (JSON archive)
 * GET /v1/export/ledger  - Export project as JSONL ledger
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  findConversationsByProject,
  findProjectById,
  findTurnsByProject,
  listCommitsV3,
} from '@t3x-dev/storage/pglite';
import * as crypto from 'crypto';
import { getDB } from '../lib/db';
import { zodErrorHook } from '../lib/errors';
import { ErrorResponseSchema } from '../schemas/common';
import { ExportQuery } from '../schemas/export-contracts';

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

exportRoutes.openapi(exportCfpackRoute, async (c) => {
  const { project_id: projectId } = c.req.valid('query');

  try {
    const db = await getDB();

    const project = await findProjectById(db, projectId);
    if (!project) {
      return c.json(
        {
          success: false as const,
          error: { code: 'NOT_FOUND', message: `Project ${projectId} not found` },
        },
        404
      );
    }

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

      if (rings?.ring1.keywords) {
        for (const kw of rings.ring1.keywords) {
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

    const commitRows = await listCommitsV3(db, { projectId, limit: 10000 });

    const commits: CfpackCommit[] = [];
    for (const row of commitRows) {
      const sentences = row.content.sentences || [];
      const firstSentence = sentences[0];
      const lastSentence = sentences[sentences.length - 1];
      const turnWindow: TurnWindow = {
        start_turn_hash: firstSentence?.source?.turn_hash || '',
        end_turn_hash: lastSentence?.source?.turn_hash || firstSentence?.source?.turn_hash || '',
      };

      const facetSnapshotData: FacetSnapshot[] = sentences.map(
        (s: { text: string; id: string; source?: { turn_hash: string } }, i: number) => ({
          facet: `sentence_${i + 1}`,
          text: s.text,
          keywords: [],
          evidence: s.source?.turn_hash
            ? [{ turn_hash: s.source.turn_hash, segment_id: s.id, similarity_score: 1.0 }]
            : [],
        })
      );

      commits.push({
        commit_hash: row.hash,
        parent_hashes: row.parents,
        branch: row.branch || 'main',
        turn_window: turnWindow,
        facet_snapshot: facetSnapshotData,
        pipeline_config: null,
        created_at: row.createdAt,
      });
    }

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

    const cfpack: CfpackResponseType = {
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

exportRoutes.openapi(exportLedgerRoute, async (c) => {
  const { project_id: projectId } = c.req.valid('query');

  try {
    const db = await getDB();

    const project = await findProjectById(db, projectId);
    if (!project) {
      return c.json(
        {
          success: false as const,
          error: { code: 'NOT_FOUND', message: `Project ${projectId} not found` },
        },
        404
      );
    }

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

    const commits = await listCommitsV3(db, { projectId, limit: 10000 });
    for (const commit of commits) {
      const sentences = commit.content.sentences || [];
      const firstSource = sentences[0]?.source;
      const lastSource = sentences[sentences.length - 1]?.source || firstSource;

      lines.push(
        JSON.stringify({
          type: 'commit',
          schema: 't3x/commit/v3',
          commit_hash: commit.hash,
          project_id: commit.projectId,
          branch: commit.branch || 'main',
          message: commit.message,
          parent_hashes: commit.parents,
          author: commit.author,
          content: commit.content,
          turn_window: firstSource
            ? {
                start_turn_hash: firstSource.turn_hash,
                end_turn_hash: lastSource?.turn_hash || firstSource.turn_hash,
              }
            : null,
          created_at: commit.createdAt,
        })
      );
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
