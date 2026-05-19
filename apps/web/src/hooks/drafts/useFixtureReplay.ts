import { DEMO_WORKSPACE_FIXTURE } from '@t3x-dev/core';
import { useCallback, useState } from 'react';
import { createWorkbenchDraft, updateWorkbenchDraft } from '@/commands/drafts';
import { fetchProjects } from '@/queries/projects';
import type { DraftConstraint, DraftNode, Project } from '@/types/api';

export interface FixtureReplayResult {
  projectId: string;
  draftId: string;
  href: string;
  label: string;
}

function isDemoProject(project: Project): boolean {
  const metadata = project.metadata ?? {};
  return (
    metadata.demo_fixture_id === DEMO_WORKSPACE_FIXTURE.id ||
    (metadata.is_demo === true && project.name === DEMO_WORKSPACE_FIXTURE.project.name)
  );
}

function buildDraftNodes(): DraftNode[] {
  return DEMO_WORKSPACE_FIXTURE.replay.draft_nodes.map((node, index) => ({
    id: node.id,
    text: node.text,
    origin: { type: 'manual' },
    position: index,
    included: true,
  }));
}

function getConstraintReason(
  constraint: (typeof DEMO_WORKSPACE_FIXTURE.leaf.constraints)[number]
): string | undefined {
  if ('reason' in constraint && constraint.reason) {
    return constraint.reason;
  }
  return constraint.description;
}

function buildDraftConstraints(): DraftConstraint[] {
  return DEMO_WORKSPACE_FIXTURE.leaf.constraints.map((constraint) => {
    const reason = getConstraintReason(constraint);
    return {
      id: constraint.id.replace(/^cst_/, 'dc_'),
      type: constraint.type,
      match_mode: constraint.match_mode,
      value: constraint.value,
      ...(reason ? { reason } : {}),
    };
  });
}

export function useFixtureReplay() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async (): Promise<FixtureReplayResult> => {
    setLoading(true);
    setError(null);

    try {
      const { projects } = await fetchProjects(50, 0);
      const project = projects.find(isDemoProject);

      if (!project) {
        throw new Error('Demo workspace is unavailable. Refresh projects or reset the demo seed.');
      }

      const title = `Fixture replay: ${DEMO_WORKSPACE_FIXTURE.project.name}`;
      const draft = await createWorkbenchDraft({
        project_id: project.project_id,
        title,
        goal: DEMO_WORKSPACE_FIXTURE.replay.label,
        preview_type: DEMO_WORKSPACE_FIXTURE.leaf.type,
      });

      const updated = await updateWorkbenchDraft(draft.id, {
        title,
        goal: DEMO_WORKSPACE_FIXTURE.replay.label,
        nodes: buildDraftNodes(),
        constraints: buildDraftConstraints(),
        instructions: [
          DEMO_WORKSPACE_FIXTURE.replay.label,
          'Review the recorded YOps and commit this draft without calling a provider.',
        ].join('\n\n'),
        preview_type: DEMO_WORKSPACE_FIXTURE.leaf.type,
        if_revision: draft.revision,
      });

      const draftId = updated.id || draft.id;
      return {
        projectId: project.project_id,
        draftId,
        href: `/project/${project.project_id}/draft/${draftId}`,
        label: DEMO_WORKSPACE_FIXTURE.replay.label,
      };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to start fixture replay';
      setError(message);
      throw cause;
    } finally {
      setLoading(false);
    }
  }, []);

  return { start, loading, error };
}
