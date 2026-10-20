import {
  type AssistantSchemaSettingsInput,
  AssistantSchemaSettingsInputSchema,
  AssistantSchemaSettingsViewSchema,
} from '@t3x-dev/api-client';
import {
  currentComposition,
  type DraftActionActor,
  parseWorkspaceSchemaEditCandidate,
  resolveWorkspaceSchemaBindingMode,
} from '@t3x-dev/application';
import { executeWorkspaceSchemaEditCommand, type WorkspaceSchemaEditCommand } from '@t3x-dev/core';
import {
  type AnyDB,
  addSchemaStudioCandidate,
  findWorkspaceDraft,
  findYSchemaCompositionSnapshot,
  getTransitionRefHead,
  saveWorkspaceSchemaPreparation,
  saveYSchemaCompositionSnapshot,
  transactWorkspaceAuthoring,
} from '@t3x-dev/storage';
import { diffYSchemas, normalizeYSchemaObject, sha256CompositionValue } from '@t3x-dev/yschema';
import type { Context } from 'hono';
import { z } from 'zod';
import { assertProjectAccess } from '../project-access';
import { saveStudioEditCandidate } from '../schema-edit-candidate-save';
import { assessWorkspaceSchemaImpact } from '../schema-evolution-impact';
import { compileStudioSelection, previewStudio, StudioError } from '../schema-studio-preview';
import { workspaceAuthoringState } from '../workspace-authoring';
import { resolveWorkspaceSchemaEditBasis } from '../workspace-schema-edit-basis';
import { resolveWorkspaceYSchema } from '../workspace-yschema';
import { schemaRootKeyFromBinding } from '../yschema-registry';

const Stored = AssistantSchemaSettingsViewSchema.extend({
  actor: z.object({ kind: z.string(), id: z.string() }),
  baseDefinition: z.record(z.string(), z.unknown()),
  bindingHash: z.string(),
  contentHash: z.string(),
  refHead: z.string().nullable(),
  candidateIds: z.array(z.string()),
  selectionHash: z.string(),
  baseCandidateRevision: z.number().int().nonnegative(),
  confirmationDigest: z.string().optional(),
  requestDigest: z.string(),
  replaceStudioCandidate: z.boolean().default(false),
});
type StoredSettings = z.infer<typeof Stored>;
function owned(value: unknown, actor: DraftActionActor, conversationId?: string) {
  const record = Stored.parse(value);
  if (
    record.actor.kind !== actor.kind ||
    record.actor.id !== actor.id ||
    (conversationId && record.conversationId !== conversationId)
  )
    throw new StudioError('FORBIDDEN', 'These settings belong to another user or conversation.');
  return record;
}
export function schemaSettingsView(record: StoredSettings) {
  return AssistantSchemaSettingsViewSchema.parse(record);
}
function nodeAt(schema: ReturnType<typeof normalizeYSchemaObject>, path: string) {
  let nodes = schema.nodes;
  let node;
  for (const key of path.split('/').filter(Boolean)) {
    if (!Object.hasOwn(nodes, key))
      throw new StudioError('INVALID_REQUEST', `Node ${path} does not exist.`);
    node = nodes[key]!;
    nodes = node.children && node.children !== 'any' ? node.children : {};
  }
  return node;
}
/** Typed form input compiles through the same guarded native Schema adapter as Studio. */
export async function applySchemaSettings(base: unknown, raw: AssistantSchemaSettingsInput) {
  const input = AssistantSchemaSettingsInputSchema.parse(raw);
  const schema = normalizeYSchemaObject(base);
  const parent = input.nodePath ? nodeAt(schema, input.nodePath) : null;
  let command: WorkspaceSchemaEditCommand;
  if (input.action === 'add_slot') {
    if (!parent) throw new StudioError('INVALID_REQUEST', 'Select the Slot parent Node.');
    if (Object.hasOwn(parent.slots ?? {}, input.name))
      throw new StudioError('CONFLICT', 'This Slot already exists.');
    command = {
      kind: 'put_slot',
      nodePath: input.nodePath,
      slot: input.name,
      definition: input.definition,
      required: input.required,
    };
  } else {
    if (parent?.repeated || parent?.children === 'any')
      throw new StudioError('INVALID_REQUEST', 'This Node cannot own child definitions.');
    const siblings = parent ? (parent.children ?? {}) : schema.nodes;
    if (Object.hasOwn(siblings, input.name))
      throw new StudioError('CONFLICT', 'This Node already exists.');
    command = {
      kind: 'put_node',
      nodePath: [input.nodePath, input.name].filter(Boolean).join('/'),
      definition: input.definition,
    };
  }
  return executeWorkspaceSchemaEditCommand(schema, command);
}
async function currentBasis(db: AnyDB, projectId: string, workspaceId: string) {
  const draft = await findWorkspaceDraft(db, projectId, workspaceId);
  if (!draft?.workspace_state || draft.status !== 'editing')
    throw new StudioError('CONFLICT', 'Open an editable Workspace first.');
  const resolved = await resolveWorkspaceYSchema(draft.workspace_state, db, projectId);
  if (!resolved.schema) throw new StudioError('CONFLICT', 'The exact bound Schema is unavailable.');
  const { ledger, basis } = workspaceAuthoringState(draft.workspace_state);
  const head = await getTransitionRefHead(db, { projectId, refName: basis.refName });
  if (head.head !== basis.refHead || draft.target_branch !== basis.refName)
    throw new StudioError('CONFLICT', 'The branch head changed. Reconcile the Workspace first.');
  return {
    draft,
    schema: resolved.schema,
    schemaHash: await sha256CompositionValue(resolved.schema),
    bindingHash: await sha256CompositionValue(draft.workspace_state.schemaBindings ?? []),
    contentHash: await sha256CompositionValue(currentComposition(ledger)),
    refHead: basis.refHead,
  };
}
async function assertFresh(
  db: AnyDB,
  projectId: string,
  workspaceId: string,
  record: StoredSettings
) {
  const live = await currentBasis(db, projectId, workspaceId);
  const edit = live.draft.workspace_state?.schemaEditCandidate;
  const revision = edit ? parseWorkspaceSchemaEditCandidate(edit).revision : 0;
  if (
    live.schemaHash !== record.schemaHash ||
    live.bindingHash !== record.bindingHash ||
    live.contentHash !== record.contentHash ||
    live.refHead !== record.refHead ||
    revision !== record.baseCandidateRevision
  )
    throw new StudioError(
      'CONFLICT',
      'Schema, content or candidate changed. Open new settings before continuing.'
    );
  return live;
}
export function createAssistantSchemaSettingsService(
  c: Context,
  db: AnyDB,
  projectId: string,
  workspaceId: string,
  actor: DraftActionActor,
  conversationId: string
) {
  const read = async () => {
    const draft = await findWorkspaceDraft(db, projectId, workspaceId);
    const raw = draft?.workspace_state?.assistantSchemaSettings;
    return raw ? owned(raw, actor, conversationId) : null;
  };
  return {
    read,
    show: async (settings: AssistantSchemaSettingsInput, operationId: string) => {
      const previous = await read();
      if (previous?.settingsId === operationId) {
        if (previous.requestDigest !== (await sha256CompositionValue(settings)))
          throw new StudioError(
            'CONFLICT',
            'This settings request was already used for different inputs.'
          );
        return schemaSettingsView(previous);
      }
      if (previous && ['pending', 'confirmed'].includes(previous.status))
        throw new StudioError('CONFLICT', 'Confirm or cancel the open Schema settings first.');
      const live = await currentBasis(db, projectId, workspaceId);
      const applied = await applySchemaSettings(live.schema, settings);
      const basis = await resolveWorkspaceSchemaEditBasis(
        c,
        db,
        projectId,
        live.draft.workspace_state!,
        live.schema
      );
      const candidateIds = await Promise.all(
        basis.sources.map(
          async (source) =>
            `sc_${(await sha256CompositionValue({ projectId, artifactVersionId: source.artifactVersionId, hash: source.hash })).slice(7)}`
        )
      );
      const storedCandidate = live.draft.workspace_state!.schemaEditCandidate;
      const edit = storedCandidate ? parseWorkspaceSchemaEditCandidate(storedCandidate) : null;
      const conflict =
        edit && edit.authoringDraft?.resultSchemaHash !== live.schemaHash
          ? { candidateId: edit.candidateId, revision: edit.revision }
          : undefined;
      const record = Stored.parse({
        settingsId: operationId,
        revision: 1,
        status: 'pending',
        conversationId,
        workspaceRevision: live.draft.revision + 1,
        settings,
        requestDigest: await sha256CompositionValue(settings),
        actor,
        schemaHash: live.schemaHash,
        baseDefinition: live.schema,
        bindingHash: live.bindingHash,
        contentHash: live.contentHash,
        refHead: live.refHead,
        candidateIds,
        selectionHash: basis.selectionHash,
        baseCandidateRevision: edit?.revision ?? 0,
        studioConflict: conflict,
        changes: diffYSchemas(live.schema, applied.schema),
        createdAt: new Date().toISOString(),
      });
      await saveWorkspaceSchemaPreparation(db, {
        projectId,
        workspaceId,
        expectedRevision: live.draft.revision,
        assistantSchemaSettings: record,
      });
      return schemaSettingsView(record);
    },
    confirm: async (
      id: string,
      revision: number,
      settings: AssistantSchemaSettingsInput | null,
      options: { discardStudioCandidate?: boolean } = {}
    ) => {
      const record = await read();
      if (!record || record.settingsId !== id)
        throw new StudioError('NOT_FOUND', 'Settings not found.');
      const digest = settings ? await sha256CompositionValue(settings) : null;
      if (
        ['confirmed', 'generated', 'applied'].includes(record.status) &&
        digest === record.confirmationDigest
      ) {
        if (record.status === 'confirmed') await assertFresh(db, projectId, workspaceId, record);
        return schemaSettingsView(record);
      }
      if (
        (record.status !== 'pending' && !(record.status === 'confirmed' && !settings)) ||
        record.revision !== revision
      )
        throw new StudioError('CONFLICT', 'Settings changed. Refresh the card.');
      const live = settings
        ? await assertFresh(db, projectId, workspaceId, record)
        : { draft: await findWorkspaceDraft(db, projectId, workspaceId) };
      if (!live.draft) throw new StudioError('NOT_FOUND', 'Workspace is unavailable.');
      if (settings) {
        if (
          record.studioConflict &&
          !options.discardStudioCandidate &&
          !record.replaceStudioCandidate
        )
          throw new StudioError(
            'REVIEW_REQUIRED',
            'Keep the Studio candidate or explicitly confirm discarding it before generating this snapshot.'
          );
        if (
          settings.action !== record.settings.action ||
          settings.nodePath !== record.settings.nodePath
        )
          throw new StudioError(
            'INVALID_REQUEST',
            'The operation and parent cannot change during confirmation.'
          );
        await applySchemaSettings(record.baseDefinition, settings);
      }
      const next = Stored.parse({
        ...record,
        revision: revision + 1,
        status: settings ? 'confirmed' : 'cancelled',
        settings: settings ?? record.settings,
        confirmationDigest: digest ?? undefined,
        replaceStudioCandidate: options.discardStudioCandidate ?? record.replaceStudioCandidate,
        changes: settings
          ? diffYSchemas(
              normalizeYSchemaObject(record.baseDefinition),
              (await applySchemaSettings(record.baseDefinition, settings)).schema
            )
          : record.changes,
        workspaceRevision: live.draft.revision + 1,
      });
      await saveWorkspaceSchemaPreparation(db, {
        projectId,
        workspaceId,
        expectedRevision: live.draft.revision,
        assistantSchemaSettings: next,
      });
      return schemaSettingsView(next);
    },
    propose: async (id: string) => {
      const record = await read();
      if (
        !record ||
        record.settingsId !== id ||
        !['confirmed', 'generated', 'applied'].includes(record.status)
      )
        throw new StudioError(
          'CONFLICT',
          'Confirm the settings card before generating a candidate.'
        );
      if (record.status === 'generated' || record.status === 'applied') {
        const draft = await findWorkspaceDraft(db, projectId, workspaceId);
        const candidate = parseWorkspaceSchemaEditCandidate(
          draft?.workspace_state?.schemaEditCandidate
        );
        if (
          candidate.candidateId !== record.candidateId ||
          candidate.revision !== record.candidateRevision
        )
          throw new StudioError('CONFLICT', 'The saved candidate changed. Open Studio.');
        return {
          kind: 'schema' as const,
          status: record.status === 'applied' ? 'applied' : 'candidate',
          candidateId: candidate.candidateId,
          candidateRevision: candidate.revision,
          workspaceRevision: draft!.revision,
          snapshot: record.snapshot,
          reused: true,
        };
      }
      const live = await assertFresh(db, projectId, workspaceId, record);
      if (record.studioConflict && !record.replaceStudioCandidate)
        throw new StudioError(
          'REVIEW_REQUIRED',
          'Explicit confirmation is required to replace the Studio candidate.'
        );
      const basis = await resolveWorkspaceSchemaEditBasis(
        c,
        db,
        projectId,
        live.draft.workspace_state!,
        live.schema
      );
      if (basis.selectionHash !== record.selectionHash)
        throw new StudioError('CONFLICT', 'The bound snapshot’s exact provenance changed.');
      // Restore exact source picks for Studio, without making them the edit Base.
      for (const [index, source] of basis.sources.entries())
        await addSchemaStudioCandidate(db, {
          id: record.candidateIds[index]!,
          projectId,
          sourceProjectId: source.projectId,
          canonicalName: source.canonicalName,
          version: source.version,
          artifactVersionId: source.artifactVersionId,
          artifactHash: source.hash,
        });
      const selection = await compileStudioSelection(c, db, projectId, record.candidateIds);
      if (
        !selection.report.valid ||
        !selection.adoption.allowed ||
        selection.selectionHash !== record.selectionHash
      )
        throw new StudioError('CONFLICT', 'The exact source selection changed.');
      const applied = await applySchemaSettings(record.baseDefinition, record.settings);
      const snapshotHash = await sha256CompositionValue({
        profile: 'assistant-schema-snapshot/v1',
        settingsId: record.settingsId,
        baseSchemaHash: record.schemaHash,
        schemaHash: applied.schemaHash,
      });
      const snapshot = {
        compositionId: `assistant:${snapshotHash}`,
        compositionRevision: 1,
        compositionHash: snapshotHash,
        schemaHash: applied.schemaHash,
      };
      await saveYSchemaCompositionSnapshot(db, {
        snapshot_id: `assistant-schema:${projectId}:${snapshotHash}`,
        project_id: projectId,
        composition_id: snapshot.compositionId,
        composition_revision: 1,
        composition_hash: snapshotHash,
        compiled_schema_hash: applied.schemaHash,
        compiler_version: 'assistant-schema-snapshot@1',
        manifest_json: {
          sources: basis.sources,
          selectionHash: basis.selectionHash,
          base: basis.reference,
        },
        schema_json: { ...applied.schema },
        render_plan_json: basis.renderPlan,
        origins_json: basis.origins,
      });
      // Candidate identity uses the same canonical hash as Studio, not the model's ID.
      const canonicalId = `sec_${(await sha256CompositionValue({ projectId, workspaceId })).slice(7)}`;
      const next = {
        ...record,
        status: 'generated',
        candidateId: canonicalId,
        candidateRevision: record.baseCandidateRevision + 1,
        workspaceRevision: live.draft.revision + 1,
        snapshot,
      };
      const impact = await assessWorkspaceSchemaImpact(
        db,
        projectId,
        live.draft.workspace_state!,
        applied.schema
      );
      const result = await saveStudioEditCandidate(
        db,
        projectId,
        {
          workspaceId,
          candidateIds: record.candidateIds,
          ifRevision: record.baseCandidateRevision,
          localContribution: {},
          schemaDefinition: applied.schema as unknown as Record<string, unknown>,
          baseSchemaHash: basis.schemaHash,
          intent: record.settings.intent,
          origin: 'assistant',
          retryKey: record.settingsId,
        },
        selection,
        { channel: 'assistant', actor },
        { workspaceRevision: live.draft.revision, assistantSchemaSettings: next, basis }
      );
      return {
        kind: 'schema' as const,
        status: 'candidate',
        candidateId: result.candidate.candidateId,
        candidateRevision: result.candidate.revision,
        workspaceRevision: result.workspaceRevision,
        schemaHash: applied.schemaHash,
        changes: diffYSchemas(live.schema, applied.schema),
        impact,
        snapshot,
        reused: result.outcome === 'reused',
      };
    },
    /** Human-only confirmation applies structure, never content or a Commit. */
    applyToDraft: async (id: string) => {
      if (actor.kind !== 'human')
        throw new StudioError('FORBIDDEN', 'Saving Schema to Draft requires a human principal.');
      const initial = await findWorkspaceDraft(db, projectId, workspaceId);
      if (!initial?.workspace_state)
        throw new StudioError('NOT_FOUND', 'Workspace is unavailable.');
      const { basis } = workspaceAuthoringState(initial.workspace_state);
      const saved = await transactWorkspaceAuthoring(
        db,
        { projectId, workspaceId, refName: basis.refName },
        async (tx, draft) => {
          if ((await assertProjectAccess(c, tx, projectId, 'project:edit')) instanceof Response)
            throw new StudioError('FORBIDDEN', 'Workspace edit authority changed.');
          const workspace = draft.workspace_state!;
          const record = owned(workspace.assistantSchemaSettings, actor, conversationId);
          if (
            record.settingsId !== id ||
            !['generated', 'applied'].includes(record.status) ||
            !record.snapshot
          )
            throw new StudioError(
              'CONFLICT',
              'Generate the confirmed Schema snapshot before saving.'
            );
          const binding = (workspace.schemaBindings as Record<string, unknown>[] | undefined)?.[0];
          if (record.status === 'applied') {
            if (
              binding?.compositionId !== record.snapshot.compositionId ||
              binding?.compositionRevision !== record.snapshot.compositionRevision ||
              binding?.compositionHash !== record.snapshot.compositionHash ||
              binding?.schemaHash !== record.snapshot.schemaHash
            )
              throw new StudioError(
                'CONFLICT',
                'The Schema binding changed after saving. Refresh the candidate.'
              );
            return { workspace: null, value: schemaSettingsView(record) };
          }
          const live = await currentBasis(tx, projectId, workspaceId);
          const candidate = parseWorkspaceSchemaEditCandidate(workspace.schemaEditCandidate);
          if (
            live.schemaHash !== record.schemaHash ||
            live.bindingHash !== record.bindingHash ||
            live.contentHash !== record.contentHash ||
            live.refHead !== record.refHead ||
            candidate.candidateId !== record.candidateId ||
            candidate.revision !== record.candidateRevision
          )
            throw new StudioError(
              'CONFLICT',
              'Schema, content or candidate changed. Refresh before saving to Draft.'
            );
          const source = {
            kind: 'studio' as const,
            candidateIds: record.candidateIds,
            schemaEditCandidate: {
              candidateId: candidate.candidateId,
              revision: candidate.revision,
            },
          };
          const preview = await previewStudio(c, tx, projectId, {
            workspaceId,
            candidateIds: source.candidateIds,
            schemaEditCandidate: source.schemaEditCandidate,
          });
          if (!preview.adoption.allowed)
            throw new StudioError('FORBIDDEN', 'Schema sources are no longer authorized.');
          if (!preview.report.valid || !preview.impact?.canAdopt)
            throw new StudioError(
              'REVIEW_REQUIRED',
              'Resolve incompatible content or migration requirements before saving to Draft.',
              { impact: preview.impact }
            );
          const snapshot = await findYSchemaCompositionSnapshot(tx, {
            project_id: projectId,
            composition_id: record.snapshot.compositionId,
            composition_revision: record.snapshot.compositionRevision,
            compiled_schema_hash: record.snapshot.schemaHash,
          });
          if (
            !snapshot ||
            snapshot.compositionHash !== record.snapshot.compositionHash ||
            preview.schemaHash !== record.snapshot.schemaHash ||
            (await sha256CompositionValue(normalizeYSchemaObject(snapshot.schemaJson))) !==
              record.snapshot.schemaHash
          )
            throw new StudioError(
              'CONFLICT',
              'The exact generated Schema snapshot failed verification.'
            );
          const next = Stored.parse({
            ...record,
            status: 'applied',
            workspaceRevision: draft.revision + 1,
            application: {
              workspaceRevision: draft.revision + 1,
              ready: preview.impact.content.ready === true,
              issues: preview.impact.content.issues,
            },
          });
          const { schemaPending: _pending, ...unchanged } = workspace;
          return {
            workspace: {
              ...unchanged,
              updatedAt: new Date().toISOString(),
              assistantSchemaSettings: next,
              schemaBindings: [
                {
                  canonicalName: record.snapshot.compositionId,
                  schemaName: preview.schema.name,
                  version: String(record.snapshot.compositionRevision),
                  rootKey: schemaRootKeyFromBinding(binding),
                  mode: resolveWorkspaceSchemaBindingMode({ source: 'workspace_schema' }),
                  ...record.snapshot,
                  studioSources: preview.sources,
                },
              ],
              schemaPreparations: [
                ...(Array.isArray(workspace.schemaPreparations)
                  ? workspace.schemaPreparations
                  : []),
                {
                  requestId: `assistant-schema:${record.settingsId}`,
                  source,
                  requestDigest: await sha256CompositionValue({
                    settingsId: record.settingsId,
                    confirmationDigest: record.confirmationDigest,
                    snapshot: record.snapshot,
                    actor,
                  }),
                  schemaHash: record.snapshot.schemaHash,
                  workspaceRevision: draft.revision + 1,
                  compositionRevision:
                    workspaceAuthoringState(workspace).ledger.compositionRevision,
                  actor,
                  kind: 'schema_only',
                  ready: next.application!.ready,
                },
              ],
            },
            value: schemaSettingsView(next),
          };
        }
      );
      return saved.value;
    },
  };
}
