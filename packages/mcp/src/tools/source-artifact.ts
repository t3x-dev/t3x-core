import { createHash } from 'node:crypto';
import {
  T3xApiError,
  type TransitionResourceSelector,
  type TransitionSourceArtifactSelector,
} from '@t3x-dev/api-client';
import { isSafeBusinessIdentifier, isSafeWorkspaceIdentifier } from '../business-capabilities.js';
import { findApiBranch } from './repository-location.js';
import { withTransitionApi } from './transition/index.js';
import type { ToolDef, ToolHandler } from './types.js';

const format = 't3x.dev/workspace-source-artifact/v1';
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const materialProperties = {
  material_id: { type: 'string' },
  content_hash: { type: 'string', description: 'Optional expected hash from the material record.' },
  expected_digest: {
    type: 'string',
    description: 'Optional sha256: digest computed from the original file bytes.',
  },
};

export const sourceArtifactDef: ToolDef = {
  name: 't3x_source_artifact',
  description:
    'Prepare exact-source Proposal inputs without writing. For import, select a root path and material with optional resources. Edit uses the saved artifact, and revert uses the Workspace branch head.',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string' },
      workspace_id: { type: 'string' },
      kind: {
        type: 'string',
        enum: ['exact_source_import', 'exact_source_edit', 'exact_source_revert'],
      },
      root_path: { type: 'string', description: 'Portable relative root path for import.' },
      root: { type: 'object', properties: materialProperties, required: ['material_id'] },
      resources: {
        type: 'array',
        maxItems: 1000,
        items: {
          type: 'object',
          properties: { path: { type: 'string' }, ...materialProperties },
          required: ['path', 'material_id'],
        },
      },
    },
    required: ['project_id', 'workspace_id', 'kind'],
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function invalid(message: string): never {
  throw new T3xApiError('INVALID_ARGUMENT', message, 400);
}

function portablePath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 500 ||
    !/^[A-Za-z0-9._/-]+$/.test(value) ||
    value.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    invalid('Use a normalized portable relative path for each source file.');
  }
  return value;
}

export const sourceArtifactHandler: ToolHandler = (args) =>
  withTransitionApi(async (client) => {
    const { project_id, workspace_id, kind, root_path, root, resources } = args;
    if (!isSafeBusinessIdentifier(project_id) || !isSafeWorkspaceIdentifier(workspace_id)) {
      invalid('Provide project_id and workspace_id.');
    }
    if (
      kind !== 'exact_source_import' &&
      kind !== 'exact_source_edit' &&
      kind !== 'exact_source_revert'
    ) {
      invalid('Choose an exact-source Proposal kind.');
    }
    if (
      kind !== 'exact_source_import' &&
      [root_path, root, resources].some((value) => value !== undefined)
    ) {
      invalid('Root and resource inputs are only used for import.');
    }
    const { workspace } = await client.workspaces.get(project_id, workspace_id);
    if (!workspace.revision) invalid('The Workspace has no saved revision.');
    const proposal = { project_id, workspace_id, kind, if_revision: workspace.revision };

    if (kind === 'exact_source_revert') {
      const ref = typeof workspace.targetBranch === 'string' ? workspace.targetBranch : 'main';
      const branch = await findApiBranch(client, project_id, ref, true);
      const commit_id = branch?.head_commit_hash;
      if (!commit_id || !digestPattern.test(commit_id)) {
        invalid('Revert requires a current CommitV2 head on the Workspace branch.');
      }
      return { proposal: { ...proposal, commit_id } };
    }

    const saved = record(workspace.sourceArtifact);
    if (kind === 'exact_source_edit' && saved.format !== format) {
      invalid('The Workspace has no saved exact-source artifact.');
    }
    const rootPath = portablePath(kind === 'exact_source_import' ? root_path : saved.rootPath);
    const selected =
      kind === 'exact_source_import' ? (resources === undefined ? [] : resources) : saved.resources;
    if (!Array.isArray(selected) || selected.length > 1000)
      invalid('Provide up to 1000 resources.');
    const resourceFiles = selected.map((value) => {
      const file = record(value);
      const path = portablePath(file.path);
      return kind === 'exact_source_import'
        ? {
            path,
            material_id: file.material_id,
            content_hash: file.content_hash,
            expected_digest: file.expected_digest,
          }
        : { path, material_id: file.materialId, content_hash: file.contentHash };
    });
    const paths = [rootPath, ...resourceFiles.map(({ path }) => path)];
    if (new Set(paths).size !== paths.length) invalid('Source artifact paths must be unique.');

    const rootFile = record(root);
    const files =
      kind === 'exact_source_import'
        ? [
            {
              path: rootPath,
              material_id: rootFile.material_id,
              content_hash: rootFile.content_hash,
              expected_digest: rootFile.expected_digest,
            },
            ...resourceFiles,
          ]
        : resourceFiles;
    const verified: Array<
      TransitionResourceSelector & { content_hash: string; text_digest: string }
    > = [];
    for (const file of files) {
      const { path, material_id, content_hash, expected_digest } = file;
      if (!isSafeBusinessIdentifier(material_id)) invalid(`Provide a material_id for ${path}.`);
      if (
        (content_hash !== undefined && typeof content_hash !== 'string') ||
        (expected_digest !== undefined &&
          (typeof expected_digest !== 'string' || !digestPattern.test(expected_digest)))
      ) {
        invalid(`Provide valid material and SHA-256 hashes for ${path}.`);
      }
      const material = await client.getProjectSourceMaterial(project_id, material_id);
      if (
        material.project_id !== project_id ||
        material.id !== material_id ||
        material.source_type === 'image'
      ) {
        throw new T3xApiError('NOT_FOUND', 'Text material unavailable in this project.', 404);
      }
      const hex = createHash('sha256').update(material.content_text, 'utf8').digest('hex');
      const text_digest = `sha256:${hex}`;
      if (
        (content_hash !== undefined && material.content_hash !== content_hash) ||
        (expected_digest !== undefined && text_digest !== expected_digest)
      ) {
        throw new T3xApiError('HASH_CONFLICT', `Source digest does not match for ${path}.`, 409);
      }
      if (material.content_hash !== hex && material.content_hash !== text_digest) {
        invalid(
          `Stored text for ${path} does not match the material hash. Read its parsed representation with t3x_source_context.`
        );
      }
      verified.push({ path, material_id, content_hash: material.content_hash, text_digest });
    }

    const artifact: TransitionSourceArtifactSelector = {
      format,
      root_path: rootPath,
      resources: [],
    };
    const selectors = verified.map(({ path, material_id, content_hash }) => ({
      path,
      material_id,
      content_hash,
    }));
    if (kind === 'exact_source_import') {
      const { material_id, content_hash } = selectors[0]!;
      artifact.resources = selectors.slice(1);
      return {
        proposal: { ...proposal, artifact, root: { material_id, content_hash } },
        files: verified,
      };
    }
    artifact.resources = selectors;
    return { proposal: { ...proposal, artifact }, files: verified };
  });
