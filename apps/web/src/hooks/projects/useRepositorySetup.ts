import { useRef, useState } from 'react';
import { createConversation } from '@/commands/conversations';
import { createProject } from '@/commands/projects';
import { getProjectWorkspaceStarterCandidate } from '@/data/workspaceCandidates';
import { changeProjectVisibility } from '@/infrastructure/projects';
import { saveWorkspaceDraft } from '@/queries/workspaces';
import { apiProjectToSummary, useProjectStore } from '@/store/projectStore';
import type { Project } from '@/types/api';
import type { WorkspaceCandidate } from '@/types/workspaces';

export interface RepositorySetupInput {
  name: string;
  description: string;
  owner: string;
  visibility: 'private' | 'unlisted' | 'public';
  initializeReadme?: boolean;
  tags?: string[];
}

export function useRepositorySetup() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const progress = useRef<{
    input?: RepositorySetupInput;
    project?: Project;
    workspace?: WorkspaceCandidate;
    conversation?: string;
  }>({});
  const busy = useRef(false);
  async function create(input: RepositorySetupInput) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    const state = progress.current;
    state.input ??= input;
    const config = state.input;
    try {
      state.project ??= await createProject(
        config.name.trim(),
        { description: config.description.trim() },
        config.owner,
        undefined,
        { initialize_readme: config.initializeReadme ?? false, tags: config.tags ?? [] }
      );
      setStarted(true);
      const id = state.project.project_id;
      const store = useProjectStore.getState();
      if (!store.projects.some((project) => project.id === id))
        store.addToProjects(apiProjectToSummary(state.project));
      if (!state.workspace) {
        state.workspace = (
          await saveWorkspaceDraft(
            id,
            'workspace_branch:main',
            getProjectWorkspaceStarterCandidate(id, [])
          )
        ).workspace;
      }
      if (!state.conversation) {
        const conversation = await createConversation(
          id,
          `${config.name} source chat`,
          undefined,
          undefined,
          { target_branch: 'main', workspace_id: state.workspace.id }
        );
        state.conversation = conversation.conversation_id;
      }
      if (config.visibility !== 'private')
        await changeProjectVisibility(id, {
          expected_visibility: 'private',
          visibility: config.visibility,
          confirm_publication: true,
        });
      return {
        project: state.project,
        workspaceId: state.workspace.id,
        conversationId: state.conversation,
      };
    } catch (cause) {
      setError(
        `${state.project ? 'Repository created; retry to finish setup. ' : ''}${cause instanceof Error ? cause.message : 'Setup failed.'}`
      );
      if (!state.project) state.input = undefined;
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return { create, pending, error, started };
}
