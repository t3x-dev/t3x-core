/**
 * Export Ledger API Route
 *
 * GET /api/v1/export/ledger - Export project as JSONL ledger
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import {
  findProjectById,
  findTurnsByProject,
  findCommitsByProject,
  findConversationsByProject,
} from '@t3x/storage';

function errorResponse(code: string, message: string) {
  return { success: false, error: { code, message } };
}

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

    // Check project exists
    const project = await findProjectById(db, projectId);
    if (!project) {
      return NextResponse.json(
        errorResponse('NOT_FOUND', `Project ${projectId} not found`),
        { status: 404 }
      );
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
    const turns = await findTurnsByProject(db, projectId, 10000);
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

    // 4. Commits
    const commits = await findCommitsByProject(db, { projectId, limit: 10000 });
    for (const commit of commits) {
      lines.push(
        JSON.stringify({
          type: 'commit',
          commit_hash: commit.commitHash,
          project_id: commit.projectId,
          branch: commit.branch,
          message: commit.message,
          parent_hashes: commit.parentsJson ? JSON.parse(commit.parentsJson) : [],
          turn_window: commit.turnWindowJson ? JSON.parse(commit.turnWindowJson) : null,
          facet_snapshot: commit.facetSnapshotJson ? JSON.parse(commit.facetSnapshotJson) : [],
          pipeline_config: commit.pipelineConfigJson ? JSON.parse(commit.pipelineConfigJson) : null,
          draft_id: commit.draftId,
          draft_text_hash: commit.draftTextHash,
          created_at: commit.createdAt.toISOString(),
        })
      );
    }

    // Join with newlines
    const jsonlContent = lines.join('\n') + '\n';

    return new NextResponse(jsonlContent, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Content-Disposition': `attachment; filename="${projectId}.jsonl"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorResponse('EXPORT_FAILED', message), { status: 500 });
  }
}
