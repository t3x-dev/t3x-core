import { DEMO_WORKSPACE_FIXTURE, DEMO_WORKSPACE_REPLAY_GOAL } from '@t3x-dev/core';
import { useCallback, useState } from 'react';
import { createWorkbenchDraft, updateWorkbenchDraft } from '@/commands/drafts';
import { getOrCreateDemoProject } from '@/hooks/onboarding/useEnsureDemoProject';
import type { DraftConstraint, DraftNode } from '@/types/api';

export interface FixtureReplayResult {
  projectId: string;
  draftId: string;
  href: string;
  label: string;
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
      const project = await getOrCreateDemoProject();

      const title = `Fixture replay: ${DEMO_WORKSPACE_FIXTURE.project.name}`;
      const draft = await createWorkbenchDraft({
        project_id: project.project_id,
        title,
        goal: DEMO_WORKSPACE_REPLAY_GOAL,
        preview_type: DEMO_WORKSPACE_FIXTURE.leaf.type,
      });

      const updated = await updateWorkbenchDraft(draft.id, {
        title,
        goal: DEMO_WORKSPACE_REPLAY_GOAL,
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
