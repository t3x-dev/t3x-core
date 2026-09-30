import { useRef, useState } from 'react';
import { createConversation } from '@/commands/conversations';
import { createProject } from '@/commands/projects';
import { getProjectWorkspaceStarterCandidate } from '@/data/workspaceCandidates';
import { API_V1, fetchWithTimeout, handleResponse } from '@/infrastructure/core';
import { type Material, uploadDocumentMaterial } from '@/infrastructure/materials';
import { changeProjectVisibility, updateProject } from '@/infrastructure/projects';
import { saveWorkspaceDraft } from '@/queries/workspaces';
import type { Project } from '@/types/api';
import type { WorkspaceCandidate } from '@/types/workspaces';

export interface RepositorySetupInput {
  name: string;
  description: string;
  owner: string;
  visibility: 'private' | 'unlisted' | 'public';
  provider: string;
  model: string;
  files: File[];
  schema: File | null;
}

export function useRepositorySetup() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const progress = useRef<{
    input?: RepositorySetupInput;
    project?: Project;
    materials: Material[];
    workspace?: WorkspaceCandidate;
    schemaBound?: boolean;
    conversation?: string;
  }>({ materials: [] });
  const busy = useRef(false);
  async function create(input: RepositorySetupInput) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    const state = progress.current;
    state.input ??= input;
    const config = state.input;
    if (!state.schemaBound) config.schema = input.schema;
    try {
      state.project ??= await createProject(
        config.name.trim(),
        { description: config.description.trim() },
        config.owner
      );
      setStarted(true);
      const id = state.project.project_id;
      await updateProject(id, {
        default_provider: config.provider || null,
        default_model: config.model || null,
      });
      while (state.materials.length < config.files.length) {
        state.materials.push(
          await uploadDocumentMaterial(id, config.files[state.materials.length]!)
        );
      }
      if (!state.workspace) {
        state.workspace = (
          await saveWorkspaceDraft(
            id,
            'workspace_branch:main',
            getProjectWorkspaceStarterCandidate(id, state.materials)
          )
        ).workspace;
      }
      if (config.schema && !state.schemaBound) {
        await handleResponse(
          await fetchWithTimeout(
            `${API_V1}/projects/${encodeURIComponent(id)}/schema-studio/initial-schema`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                workspaceId: state.workspace.id,
                ifRevision: state.workspace.revision,
                filename: config.schema.name,
                yaml: await config.schema.text(),
              }),
            }
          )
        );
        state.schemaBound = true;
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
