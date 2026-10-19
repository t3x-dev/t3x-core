import type { StudioPublishInput, StudioPublishResult } from '@t3x-dev/api-client';
import { parseWorkspaceSchemaEditCandidate } from '@t3x-dev/application';
import {
  type AnyDB,
  findWorkspaceDraft,
  publishYSchemaArtifactVersion,
  transactWorkspaceAuthoring,
} from '@t3x-dev/storage';
import { type NodeSchema, normalizeYSchemaObject, sha256CompositionValue } from '@t3x-dev/yschema';
import type { Context } from 'hono';
import { assertProjectAccess } from './project-access';
import { resolveStudioSource } from './schema-studio';
import { previewStudio, StudioError } from './schema-studio-preview';

/** Publish the verified candidate bytes, not an editable upstream artifact or client-supplied schema. */
export async function publishStudioSchema(
  c: Context,
  db: AnyDB,
  projectId: string,
  workspaceId: string,
  input: StudioPublishInput
): Promise<StudioPublishResult> {
  const initial = await findWorkspaceDraft(db, projectId, workspaceId);
  if (!initial?.workspace_state) throw new StudioError('NOT_FOUND', 'Workspace not found.');
  const refName = initial.target_branch ?? String(initial.workspace_state.targetBranch ?? 'main');
  // Reuse the authoring lock order without adding an action or advancing the Workspace revision.
  const result = await transactWorkspaceAuthoring<StudioPublishResult>(
    db,
    { projectId, workspaceId, refName },
    async (tx, draft) => {
      if ((await assertProjectAccess(c, tx, projectId, 'project:edit')) instanceof Response)
        throw new StudioError('FORBIDDEN', 'Workspace edit authority changed.');
      if (
        draft.revision !== input.ifRevision ||
        (draft.target_branch ?? String(draft.workspace_state?.targetBranch ?? 'main')) !== refName
      )
        throw new StudioError(
          'CONFLICT',
          'Workspace changed; check the candidate again before publishing.'
        );
      const preview = await previewStudio(c, tx, projectId, {
        candidateIds: input.candidateIds,
        workspaceId,
        schemaEditCandidate: input.schemaEditCandidate,
      });
      if (
        preview.reviewHash !== input.reviewHash ||
        preview.workspace?.revision !== input.ifRevision
      )
        throw new StudioError('CONFLICT', 'Review is stale; check the saved candidate again.');
      if (!preview.adoption.allowed)
        throw new StudioError(
          'FORBIDDEN',
          preview.adoption.reason ?? 'Source redistribution is not authorized.'
        );
      if (!preview.report.valid || !preview.impact?.canPublish)
        throw new StudioError(
          'REVIEW_REQUIRED',
          'Resolve definition and content impact checks before publishing.'
        );
      const candidate = parseWorkspaceSchemaEditCandidate(
        draft.workspace_state?.schemaEditCandidate
      );
      const schema = normalizeYSchemaObject({
        ...preview.schema,
        name: input.canonicalName,
        version: input.version,
        description: input.description || preview.schema.description,
      });
      const schemaHash = await sha256CompositionValue(schema);
      const compositionHash = await sha256CompositionValue({
        sources: preview.sources,
        localContribution: candidate.localContribution,
        authoringDraft: candidate.authoringDraft ?? null,
        candidateId: candidate.candidateId,
        revision: candidate.revision,
      });
      const tags = [...new Set(input.tags)].sort();
      const sourceViews = await Promise.all(
        preview.sources.map((source) =>
          resolveStudioSource(c, tx, {
            sourceProjectId: source.projectId,
            canonicalName: source.canonicalName,
            version: source.version,
            artifactHash: source.hash,
          })
        )
      );
      if (sourceViews.some((source) => !source))
        throw new StudioError('NOT_FOUND', 'A pinned source is no longer available.');
      const manifest = {
        apiVersion: 't3x.dev/yschema-blueprint/v1',
        canonicalName: input.canonicalName,
        version: input.version,
        title: input.title,
        description: input.description,
        status: 'published',
        source: 'team',
        tags,
        blueprint: {
          compositionApiVersion: 't3x.dev/yschema-composition/v2',
          compositionId: `studio:${preview.selectionHash}`,
          compositionRevision: candidate.revision,
          modules: preview.sources
            .filter((_, index) => sourceViews[index]?.kind !== 'schema')
            .map((source, index) => ({
              canonicalName: source.canonicalName,
              version: source.version,
              hash: source.hash,
              presentationOrder: index * 10,
            })),
          // A whole-Schema base is not relabelled as a Module; keep all exact original source references.
          baseSources: preview.sources,
          ...(candidate.authoringDraft ? { authoringDraft: candidate.authoringDraft } : {}),
          localContribution: {
            apiVersion: 't3x.dev/yschema-local-contribution/v2',
            id: candidate.candidateId,
            revision: candidate.revision,
            contribution: candidate.localContribution,
          },
          authoring: {
            workspaceId,
            candidateId: candidate.candidateId,
            revision: candidate.revision,
            requestDigest: candidate.requestDigest,
            intent: candidate.intent,
            origin: candidate.origin,
          },
        },
        schema,
        registry: {
          origin: 'composition',
          studio: true,
          compilerVersion: 'yschema-v2',
          compositionHash,
          compiledSchemaHash: preview.schemaHash,
          schemaHash,
          reportHash: await sha256CompositionValue(preview.report),
          renderPlan: preview.renderPlan,
          originsByPath: preview.origins,
          releaseNotes: input.releaseNotes,
        },
      };
      const hash = await sha256CompositionValue(manifest);
      const artifactId = `ysa_${input.canonicalName.replace(/[^a-zA-Z0-9]+/g, '_')}`;
      const published = await publishYSchemaArtifactVersion(tx, {
        artifact_id: artifactId,
        artifact_version_id: `${artifactId}_${input.version.replace(/[^a-zA-Z0-9]+/g, '_')}`,
        canonical_name: input.canonicalName,
        family: 'open',
        kind: 'schema',
        owner_project_id: projectId,
        visibility: 'private',
        version: input.version,
        status: 'published',
        manifest_json: manifest,
        artifact_hash: hash,
        display_name: input.title,
        description: input.description,
        tags,
        path_count: countPaths(schema.nodes),
        provides: [],
        requires: [],
        created_by: `project:${projectId}`,
      });
      return {
        workspace: null,
        value: {
          source: {
            projectId,
            canonicalName: published.canonicalName,
            version: published.version,
            artifactVersionId: published.artifactVersionId,
            hash: published.artifactHash,
          },
          schemaHash,
          kind: 'schema' as const,
          visibility: 'private' as const,
        },
      };
    }
  );
  return result.value;
}

function countPaths(nodes: Record<string, NodeSchema>): number {
  return Object.values(nodes).reduce(
    (count, node) =>
      count +
      1 +
      Object.keys(node.slots ?? {}).length +
      (node.children && node.children !== 'any' ? countPaths(node.children) : 0),
    0
  );
}
