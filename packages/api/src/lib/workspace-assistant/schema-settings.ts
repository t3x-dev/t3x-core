import {
  type AssistantSchemaSettingsInput,
  AssistantSchemaSettingsInputSchema,
  AssistantSchemaSettingsViewSchema,
} from '@t3x-dev/api-client';
import {
  currentComposition,
  type DraftActionActor,
  parseWorkspaceSchemaEditCandidate,
} from '@t3x-dev/application';
import { executeWorkspaceSchemaEditCommand, type WorkspaceSchemaEditCommand } from '@t3x-dev/core';
import {
  type AnyDB,
  findWorkspaceDraft,
  getTransitionRefHead,
  listSchemaStudioCandidates,
  saveWorkspaceSchemaPreparation,
} from '@t3x-dev/storage';
import { diffYSchemas, normalizeYSchemaObject, sha256CompositionValue } from '@t3x-dev/yschema';
import type { Context } from 'hono';
import { z } from 'zod';
import { saveStudioEditCandidate } from '../schema-edit-candidate-save';
import { assessWorkspaceSchemaImpact } from '../schema-evolution-impact';
import { compileStudioSelection, StudioError } from '../schema-studio-preview';
import { workspaceAuthoringState } from '../workspace-authoring';
import { resolveWorkspaceYSchema } from '../workspace-yschema';

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
      await applySchemaSettings(live.schema, settings);
      const rows = await listSchemaStudioCandidates(db, projectId);
      const bindings = live.draft.workspace_state!.schemaBindings as Array<Record<string, unknown>>;
      const binding = bindings?.[0];
      const sources = Array.isArray(binding?.studioSources)
        ? (binding.studioSources as Array<Record<string, unknown>>)
        : null;
      const ids = sources
        ? sources.map(
            (source) =>
              rows.find(
                (row) =>
                  row.artifactVersionId === source.artifactVersionId &&
                  row.artifactHash === source.hash &&
                  row.sourceProjectId === source.projectId
              )?.id
          )
        : [
            rows.find(
              (row) =>
                row.canonicalName === (binding?.canonicalName ?? binding?.schemaName) &&
                row.version === binding?.version
            )?.id,
          ];
      if (!ids.length || ids.some((id) => !id))
        throw new StudioError(
          'CONFLICT',
          'Open Schema Studio and select the exact bound sources first.'
        );
      const candidateIds = [...new Set(ids as string[])];
      const selection = await compileStudioSelection(c, db, projectId, candidateIds);
      if (!selection.report.valid || !selection.adoption.allowed)
        throw new StudioError('FORBIDDEN', 'The bound sources are unavailable or not authorized.');
      const storedCandidate = live.draft.workspace_state!.schemaEditCandidate;
      const edit = storedCandidate ? parseWorkspaceSchemaEditCandidate(storedCandidate) : null;
      if (edit && edit.authoringDraft?.resultSchemaHash !== live.schemaHash)
        throw new StudioError('CONFLICT', 'Review or discard the existing Studio candidate first.');
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
        selectionHash: selection.selectionHash,
        baseCandidateRevision: edit?.revision ?? 0,
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
      settings: AssistantSchemaSettingsInput | null
    ) => {
      const record = await read();
      if (!record || record.settingsId !== id)
        throw new StudioError('NOT_FOUND', 'Settings not found.');
      const digest = settings ? await sha256CompositionValue(settings) : null;
      if (record.status === 'confirmed' && digest === record.confirmationDigest) {
        await assertFresh(db, projectId, workspaceId, record);
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
        !['confirmed', 'generated'].includes(record.status)
      )
        throw new StudioError(
          'CONFLICT',
          'Confirm the settings card before generating a candidate.'
        );
      if (record.status === 'generated') {
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
          status: 'candidate',
          candidateId: candidate.candidateId,
          candidateRevision: candidate.revision,
          workspaceRevision: draft!.revision,
          reused: true,
        };
      }
      const live = await assertFresh(db, projectId, workspaceId, record);
      const selection = await compileStudioSelection(c, db, projectId, record.candidateIds);
      if (
        !selection.report.valid ||
        !selection.adoption.allowed ||
        selection.selectionHash !== record.selectionHash
      )
        throw new StudioError('CONFLICT', 'The exact source selection changed.');
      const applied = await applySchemaSettings(record.baseDefinition, record.settings);
      // Candidate identity uses the same canonical hash as Studio, not the model's ID.
      const canonicalId = `sec_${(await sha256CompositionValue({ projectId, workspaceId })).slice(7)}`;
      const next = {
        ...record,
        status: 'generated',
        candidateId: canonicalId,
        candidateRevision: record.baseCandidateRevision + 1,
        workspaceRevision: live.draft.revision + 1,
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
          baseSchemaHash: selection.schemaHash,
          intent: record.settings.intent,
          origin: 'assistant',
          retryKey: record.settingsId,
        },
        selection,
        { channel: 'assistant', actor },
        { workspaceRevision: live.draft.revision, assistantSchemaSettings: next }
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
        reused: result.outcome === 'reused',
      };
    },
  };
}
