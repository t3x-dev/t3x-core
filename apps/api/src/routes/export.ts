/**
 * Export Routes
 *
 * GET /v1/export/cfpack - Export project as .cfpack (JSON archive)
 * GET /v1/export/ledger - Export project as JSONL ledger
 */

import { buildDraft } from '@t3x/core';
import { listDeltaLogByConversation } from '@t3x/storage';
import {
  findConversationsByProject,
  findProjectById,
  findTurnsByProject,
  listCommitsV3,
} from '@t3x/storage/pglite';
import * as crypto from 'crypto';
import { Hono } from 'hono';
import { getDB } from '../lib/db';
import { toDeltaLogEntries } from '../lib/delta-log-utils';
import { jsonError } from '../lib/response';

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
  const hash = crypto.createHash('sha256').update(canonical).digest('hex');
  return `sha256:${hash}`;
}

// ============================================================================
// Routes
// ============================================================================

export const exportRoutes = new Hono();

/**
 * GET /v1/export/cfpack - Export project as .cfpack (JSON archive)
 */
exportRoutes.get('/v1/export/cfpack', async (c) => {
  const projectId = c.req.query('project_id');

  if (!projectId) {
    return jsonError(c, 'INVALID_REQUEST', 'project_id query param is required', 400);
  }

  try {
    const db = await getDB();

    // Get project
    const project = await findProjectById(db, projectId);
    if (!project) {
      return jsonError(c, 'NOT_FOUND', `Project ${projectId} not found`, 404);
    }

    // Get all turns
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

      // Aggregate keywords for findings
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

    // Get all commits (V3 format)
    const commitRows = await listCommitsV3(db, { projectId, limit: 10000 });

    const commits: CfpackCommit[] = [];
    for (const row of commitRows) {
      // Derive turn_window from V3 sentences
      const sentences = row.content.sentences || [];
      const firstSentence = sentences[0];
      const lastSentence = sentences[sentences.length - 1];
      const turnWindow: TurnWindow = {
        start_turn_hash: firstSentence?.source?.turn_hash || '',
        end_turn_hash: lastSentence?.source?.turn_hash || firstSentence?.source?.turn_hash || '',
      };

      // V3 uses sentences/constraints instead of facet_snapshot
      // Create simplified facet snapshot from sentences for export compatibility
      const facetSnapshotData: FacetSnapshot[] = sentences.map((s, i) => ({
        facet: `sentence_${i + 1}`,
        text: s.text,
        keywords: [],
        evidence: s.source?.turn_hash
          ? [
              {
                turn_hash: s.source.turn_hash,
                segment_id: s.id,
                similarity_score: 1.0,
              },
            ]
          : [],
      }));

      commits.push({
        commit_hash: row.hash,
        parent_hashes: row.parents,
        branch: row.branch || 'main',
        turn_window: turnWindow,
        facet_snapshot: facetSnapshotData,
        pipeline_config: null, // V3 doesn't use pipeline_config
        created_at: row.created_at,
      });
    }

    // Build semantic snapshots from delta logs (Frame data)
    const semanticSnapshots: Record<string, unknown> = {};
    for (const conv of await findConversationsByProject(db, { projectId, limit: 10000 })) {
      const deltaLogs = await listDeltaLogByConversation(db, conv.conversationId);
      if (deltaLogs.length > 0) {
        const snapshot = buildDraft(toDeltaLogEntries(deltaLogs));
        semanticSnapshots[conv.conversationId] = {
          frames: snapshot.frames,
          relations: snapshot.relations,
          delta_count: deltaLogs.length,
        };
      }
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
    const cfpack: CfpackResponse & { semantic_snapshots?: Record<string, unknown> } = {
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

    // Compute hash (destructure to exclude hash field)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { hash: _discarded, ...contentForHash } = cfpack;
    const packHash = computeJcsHash(contentForHash);

    cfpack.hash = {
      algorithm: 'sha256-jcs-v1',
      pack_hash: packHash,
    };

    // Send response with custom MIME type
    return new Response(JSON.stringify(cfpack), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.t3x.cfpack+json',
        'Content-Disposition': `attachment; filename="${projectId}.cfpack"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'EXPORT_FAILED', message, 500);
  }
});

/**
 * GET /v1/export/ledger - Export project as JSONL ledger
 */
exportRoutes.get('/v1/export/ledger', async (c) => {
  const projectId = c.req.query('project_id');

  if (!projectId) {
    return jsonError(c, 'INVALID_REQUEST', 'project_id query param is required', 400);
  }

  try {
    const db = await getDB();

    // Check project exists
    const project = await findProjectById(db, projectId);
    if (!project) {
      return jsonError(c, 'NOT_FOUND', `Project ${projectId} not found`, 404);
    }

    // Build JSONL content
    const lines: string[] = [];

    // 1. Project metadata
    lines.push(
      JSON.stringify({
        type: 'project',
        project_id: project.projectId,
        name: project.name,
        created_at: project.createdAt.toISOString(),
      })
    );

    // 2. Conversations
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

    // 3. Turns
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

    // 4. Commits (V3 format)
    const commits = await listCommitsV3(db, { projectId, limit: 10000 });
    for (const commit of commits) {
      // Derive turn_window from V3 sentences for backward compatibility
      const sentences = commit.content.sentences || [];
      const firstSource = sentences[0]?.source;
      const lastSource = sentences[sentences.length - 1]?.source || firstSource;

      lines.push(
        JSON.stringify({
          type: 'commit',
          schema: 't3x/commit/v3',
          commit_hash: commit.hash,
          project_id: commit.project_id,
          branch: commit.branch || 'main',
          message: commit.message,
          parent_hashes: commit.parents,
          author: commit.author,
          content: commit.content,
          // Legacy fields for backward compatibility
          turn_window: firstSource
            ? {
                start_turn_hash: firstSource.turn_hash,
                end_turn_hash: lastSource?.turn_hash || firstSource.turn_hash,
              }
            : null,
          created_at: commit.created_at,
        })
      );
    }

    // 5. Semantic snapshots (Frame data)
    for (const conv of conversations) {
      const deltaLogs = await listDeltaLogByConversation(db, conv.conversationId);
      if (deltaLogs.length > 0) {
        const snapshot = buildDraft(toDeltaLogEntries(deltaLogs));
        lines.push(
          JSON.stringify({
            type: 'semantic_snapshot',
            conversation_id: conv.conversationId,
            frames: snapshot.frames,
            relations: snapshot.relations,
            delta_count: deltaLogs.length,
          })
        );
      }
    }

    // Join with newlines
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
    return jsonError(c, 'EXPORT_FAILED', message, 500);
  }
});
