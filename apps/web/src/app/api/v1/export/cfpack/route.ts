/**
 * Export CFPack API Route
 *
 * GET /api/v1/export/cfpack - Export project as .cfpack (JSON archive)
 */

import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';
import { getDB } from '@/lib/db';
import {
  findProjectById,
  findTurnsByProject,
  findCommitsByProject,
} from '@t3x/storage/pglite';

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

function errorResponse(code: string, message: string) {
  return { success: false, error: { code, message } };
}

// ============================================================================
// Route Handler
// ============================================================================

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const projectId = searchParams.get('project_id');

  if (!projectId) {
    return NextResponse.json(
      errorResponse('INVALID_REQUEST', 'project_id query param is required'),
      { status: 400 }
    );
  }

  try {
    const db = await getDB();

    // Get project
    const project = await findProjectById(db, projectId);
    if (!project) {
      return NextResponse.json(
        errorResponse('NOT_FOUND', `Project ${projectId} not found`),
        { status: 404 }
      );
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

    // Get all commits
    const commitRows = await findCommitsByProject(db, { projectId, limit: 10000 });

    const commits: CfpackCommit[] = [];
    for (const row of commitRows) {
      const turnWindow = row.turnWindowJson
        ? (JSON.parse(row.turnWindowJson) as TurnWindow)
        : { start_turn_hash: '', end_turn_hash: '' };
      const facetSnapshotData = row.facetSnapshotJson
        ? (JSON.parse(row.facetSnapshotJson) as FacetSnapshot[])
        : [];
      const pipelineConfig = row.pipelineConfigJson
        ? (JSON.parse(row.pipelineConfigJson) as PipelineConfig)
        : null;

      commits.push({
        commit_hash: row.commitHash,
        parent_hashes: row.parentsJson ? JSON.parse(row.parentsJson) : [],
        branch: row.branch,
        turn_window: turnWindow,
        facet_snapshot: facetSnapshotData,
        pipeline_config: pipelineConfig,
        created_at: row.createdAt.toISOString(),
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
        exported_by: 't3x-webui@1.0.0',
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
    return new NextResponse(JSON.stringify(cfpack), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.t3x.cfpack+json',
        'Content-Disposition': `attachment; filename="${projectId}.cfpack"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorResponse('EXPORT_FAILED', message), { status: 500 });
  }
}
