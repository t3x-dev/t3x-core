import type { Commit, Leaf, SourcedYOp } from '@t3x-dev/core';
import { DEMO_WORKSPACE_FIXTURE, verifyDemoWorkspaceFixture } from '@t3x-dev/core';
import type { AnyDB } from '../adapters';
import type { Conversation, Project, Turn } from '../schema';
import { ensureMainBranch, updateBranchHead } from './branches';
import { createCommit } from './commits';
import { insertConversation } from './conversations';
import { getGlobalSetting, setGlobalSetting } from './global-settings';
import { createLeaf, updateLeafAtomic } from './leaves';
import { findProjectByIdIncludingDeleted, insertProject } from './projects';
import { insertTurn } from './turns';
import { insertYOpsLogEntry } from './yops-log';

export interface DemoWorkspaceSeedMarker {
  fixture_id: string;
  fixture_version: number;
  owner_id: string | null;
  project_id: string;
  status: 'active' | 'deleted';
  seeded_at: string;
  deleted_at?: string;
}

export interface SeedDemoWorkspaceOptions {
  ownerId?: string | null;
  resetDeleted?: boolean;
}

export interface SeedDemoWorkspaceResult {
  status: 'created' | 'exists' | 'skipped_deleted';
  project: Project | null;
  conversation?: Conversation;
  turn?: Turn;
  commit?: Commit;
  leaf?: Leaf;
}

export function getDemoWorkspaceSeedKey(ownerId: string | null | undefined): string {
  return ownerId ? `demo_workspace_seed:user:${ownerId}` : 'demo_workspace_seed:auth_disabled';
}

export async function seedDemoWorkspace(
  db: AnyDB,
  options: SeedDemoWorkspaceOptions = {}
): Promise<SeedDemoWorkspaceResult> {
  const ownerId = options.ownerId ?? null;
  const settingKey = getDemoWorkspaceSeedKey(ownerId);
  const existingMarker = await getGlobalSetting<DemoWorkspaceSeedMarker>(db, settingKey);

  if (existingMarker && !(options.resetDeleted && existingMarker.status === 'deleted')) {
    const existingProject = await findProjectByIdIncludingDeleted(db, existingMarker.project_id);
    if (existingMarker.status === 'active' && existingProject && !existingProject.deletedAt) {
      return { status: 'exists', project: existingProject };
    }

    const deletedMarker: DemoWorkspaceSeedMarker = {
      ...existingMarker,
      status: 'deleted',
      deleted_at: existingMarker.deleted_at ?? new Date().toISOString(),
    };
    await setGlobalSetting(db, settingKey, deletedMarker);
    return { status: 'skipped_deleted', project: null };
  }

  const created = await createDemoWorkspaceRows(db, ownerId);
  await setGlobalSetting(db, settingKey, {
    fixture_id: DEMO_WORKSPACE_FIXTURE.id,
    fixture_version: DEMO_WORKSPACE_FIXTURE.project.metadata.demo_fixture_version,
    owner_id: ownerId,
    project_id: created.project.projectId,
    status: 'active',
    seeded_at: getMetadataString(created.project.metadataJson, 'demo_seeded_at'),
  } satisfies DemoWorkspaceSeedMarker);

  return { status: 'created', ...created };
}

async function createDemoWorkspaceRows(
  db: AnyDB,
  ownerId: string | null
): Promise<{
  project: Project;
  conversation: Conversation;
  turn: Turn;
  commit: Commit;
  leaf: Leaf;
}> {
  const seededAt = new Date().toISOString();
  const replayedContent = verifyDemoWorkspaceFixture(DEMO_WORKSPACE_FIXTURE);
  const metadata = {
    ...DEMO_WORKSPACE_FIXTURE.project.metadata,
    demo_seeded_at: seededAt,
  };

  const project = await insertProject(db, {
    name: DEMO_WORKSPACE_FIXTURE.project.name,
    metadata,
    ownerId: ownerId ?? undefined,
  });
  await ensureMainBranch(db, project.projectId);

  const conversation = await insertConversation(db, {
    projectId: project.projectId,
    title: DEMO_WORKSPACE_FIXTURE.source.title,
    metadata: {
      is_demo: true,
      demo_fixture_id: DEMO_WORKSPACE_FIXTURE.id,
      replay_label: DEMO_WORKSPACE_FIXTURE.replay.label,
    },
  });

  const turn = await insertTurn(db, {
    projectId: project.projectId,
    conversationId: conversation.conversationId,
    role: 'user',
    content: DEMO_WORKSPACE_FIXTURE.source.text,
  });

  const yopsLogEntry = await insertYOpsLogEntry(db, {
    conversationId: conversation.conversationId,
    projectId: project.projectId,
    source: 'manual',
    turnHash: turn.turnHash,
    yops: DEMO_WORKSPACE_FIXTURE.replay.yops.map((op) => ({
      ...op,
      source: {
        type: 'human',
        author: 'T3X fixture replay',
        at: seededAt,
        surface: 'script',
      },
    })) satisfies SourcedYOp[],
    version: 1,
    pipelineState: 'completed',
    metadata: {
      fixture_id: DEMO_WORKSPACE_FIXTURE.id,
      replay_label: DEMO_WORKSPACE_FIXTURE.replay.label,
      no_llm_call: true,
    },
  });

  const commit = await createCommit(db, {
    parents: [],
    author: DEMO_WORKSPACE_FIXTURE.commit.author,
    content: replayedContent,
    project_id: project.projectId,
    message: DEMO_WORKSPACE_FIXTURE.commit.message,
    branch: 'main',
    provenance: DEMO_WORKSPACE_FIXTURE.commit.provenance,
    yops_log_ids: [yopsLogEntry.id],
    sources: [
      {
        type: 'conversation',
        id: conversation.conversationId,
        title: conversation.title ?? DEMO_WORKSPACE_FIXTURE.source.title,
      },
    ],
    enforceBranchLinearity: true,
  });
  await updateBranchHead(db, project.projectId, 'main', commit.hash);

  const createdLeaf = await createLeaf(db, {
    commit_hash: commit.hash,
    type: DEMO_WORKSPACE_FIXTURE.leaf.type,
    title: DEMO_WORKSPACE_FIXTURE.leaf.title,
    constraints: DEMO_WORKSPACE_FIXTURE.leaf.constraints,
    config: DEMO_WORKSPACE_FIXTURE.leaf.config,
    project_id: project.projectId,
    created_by: 'fixture-replay',
  });
  const leaf =
    (await updateLeafAtomic(db, createdLeaf.id, {
      output: DEMO_WORKSPACE_FIXTURE.leaf.output,
      assertions: DEMO_WORKSPACE_FIXTURE.leaf.assertions,
    })) ?? createdLeaf;

  return { project, conversation, turn, commit, leaf };
}

function getMetadataString(metadataJson: string | null, key: string): string {
  if (!metadataJson) return new Date().toISOString();
  const metadata = JSON.parse(metadataJson) as Record<string, unknown>;
  const value = metadata[key];
  return typeof value === 'string' ? value : new Date().toISOString();
}
