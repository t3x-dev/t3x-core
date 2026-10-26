import {
  type AssistantSchemaSettingsInput,
  AssistantSchemaSettingsViewSchema,
} from '@t3x-dev/api-client';
import {
  currentComposition,
  type DraftActionActor,
  parseWorkspaceSchemaEditCandidate,
  resolveWorkspaceSchemaBindingMode,
} from '@t3x-dev/application';
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
import { generateTransitionProposal } from '../proposal-generation';
import { compileConfirmedSchemaChange, schemaChangeTarget } from '../schema-change-contract';
import { saveStudioEditCandidate } from '../schema-edit-candidate-save';
import { assessWorkspaceSchemaImpact } from '../schema-evolution-impact';
import { compileStudioSelection, previewStudio, StudioError } from '../schema-studio-preview';
import { workspaceAuthoringState } from '../workspace-authoring';
import { resolveWorkspaceSchemaEditBasis } from '../workspace-schema-edit-basis';
import {
  previewWorkspaceSchemaPreparation,
  publishSchemaPreparationContent,
} from '../workspace-schema-preparation';
import { resolveWorkspaceYSchema } from '../workspace-yschema';
import { schemaRootKeyFromBinding } from '../yschema-registry';
import { removalContentMappings, renameContentMappings } from './schema-rename-migration';

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
  originalInstruction: z.string().max(64000).optional(),
});
type StoredSettings = z.infer<typeof Stored>;
const generationFlights = new WeakMap<object, Map<string, Promise<unknown>>>();
function schemaGenerationFlight<T>(db: AnyDB, key: string, work: () => Promise<T>): Promise<T> {
  let flights = generationFlights.get(db);
  if (!flights) {
    flights = new Map();
    generationFlights.set(db, flights);
  }
  const current = flights.get(key);
  if (current) return current as Promise<T>;
  const promise = work();
  flights.set(key, promise);
  void promise
    .finally(() => {
      if (flights.get(key) === promise) flights.delete(key);
    })
    .catch(() => {});
  return promise;
}
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
  const view = AssistantSchemaSettingsViewSchema.parse(record);
  if (view.cards) {
    const { cards: _cards, ...current } = view;
    view.cards = view.cards.map((card) => (card.settingsId === view.settingsId ? current : card));
  }
  return view;
}

/** Split additions before confirmation; no child definition is authorized by its parent card. */
function additionCards(input: AssistantSchemaSettingsInput): AssistantSchemaSettingsInput[] {
  if (input.action !== 'add_node') return [input];
  const { slots, requiredSlots, children, ...attributes } = input.definition;
  const result: AssistantSchemaSettingsInput[] = [
    {
      ...input,
      definition: {
        ...attributes,
        ...(children === 'any' ? { children } : {}),
      },
    },
  ];
  const nodePath = [input.nodePath, input.name].filter(Boolean).join('/');
  for (const [name, definition] of Object.entries(
    (slots ?? {}) as Record<string, Record<string, unknown>>
  ))
    result.push({
      action: 'add_slot',
      nodePath,
      name,
      definition,
      required: Array.isArray(requiredSlots) && requiredSlots.includes(name),
      intent: input.intent,
    });
  if (children && children !== 'any')
    for (const [name, definition] of Object.entries(
      children as Record<string, Record<string, unknown>>
    ))
      result.push(
        ...additionCards({ action: 'add_node', nodePath, name, definition, intent: input.intent })
      );
  if (result.length > 100)
    throw new StudioError('INVALID_REQUEST', 'A Schema request may contain at most 100 cards.');
  return result;
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
  const currentSettings = Stored.safeParse(live.draft.workspace_state?.assistantSchemaSettings);
  // The workspace may have advanced after read() but before currentBasis(). Do not
  // use its newer revision to authorize writing an older confirmation card.
  if (
    !currentSettings.success ||
    currentSettings.data.settingsId !== record.settingsId ||
    currentSettings.data.revision !== record.revision ||
    currentSettings.data.status !== record.status ||
    currentSettings.data.confirmationDigest !== record.confirmationDigest
  )
    throw new StudioError('CONFLICT', 'Settings changed. Refresh the card.');
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
    if (raw && draft?.workspace_state?.authoringBasis) {
      const record = Stored.parse(raw);
      if (record.refHead !== workspaceAuthoringState(draft.workspace_state).basis.refHead)
        return null;
    }
    if (!raw) return null;
    const record = owned(raw, actor, conversationId);
    if (
      ['pending', 'generated'].includes(record.status) &&
      record.settings.action.startsWith('rename_')
    ) {
      record.renameMappings ??= renameContentMappings(
        draft!.workspace_state!,
        normalizeYSchemaObject(record.baseDefinition),
        record.settings
      );
      record.settings = {
        ...record.settings,
        renameContentMode: record.settings.renameContentMode ?? 'preserve',
        contentMigration: record.settings.contentMigration ?? record.renameMappings?.preserve ?? [],
      };
    }
    if (record.status === 'pending' && record.settings.contentMigration === undefined) {
      const commands = removalContentMappings(
        draft!.workspace_state!,
        normalizeYSchemaObject(record.baseDefinition),
        record.settings
      );
      if (commands) record.settings = { ...record.settings, contentMigration: commands };
    }
    return record;
  };
  const stage = async (
    settings: AssistantSchemaSettingsInput,
    operationId: string,
    originalInstruction?: string,
    continuation?: StoredSettings
  ) => {
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
    if (
      !continuation &&
      previous &&
      schemaSettingsView(previous).cards?.some((card) => card.status === 'queued')
    )
      throw new StudioError('CONFLICT', 'Confirm or cancel the remaining Schema cards first.');
    const live = await currentBasis(db, projectId, workspaceId);
    const requestDigest = await sha256CompositionValue(settings);
    // Validate the whole requested structure before persisting any split cards.
    await compileConfirmedSchemaChange(live.schema, settings);
    const changes = continuation ? [settings] : additionCards(settings);
    if (changes.length > 1)
      for (const change of changes)
        change.intent = `Add only ${change.action === 'add_node' ? 'Node' : 'Slot'} ${[change.nodePath, change.name].filter(Boolean).join('/')}`;
    settings = changes[0]!;
    const applied = await compileConfirmedSchemaChange(live.schema, settings);
    const { currentDefinition, currentRequired, proposedDefinition } = schemaChangeTarget(
      live.schema,
      settings
    );
    const renameMappings = renameContentMappings(
      live.draft.workspace_state!,
      live.schema,
      settings
    );
    const removalMappings = removalContentMappings(
      live.draft.workspace_state!,
      live.schema,
      settings
    );
    const confirmedInput = settings.action.startsWith('edit_')
      ? {
          ...settings,
          definition: proposedDefinition,
          definitionMode: 'replace' as const,
          ...(settings.action === 'edit_slot'
            ? { required: settings.required ?? currentRequired }
            : {}),
        }
      : renameMappings
        ? {
            ...settings,
            renameContentMode: settings.renameContentMode ?? ('preserve' as const),
            contentMigration:
              settings.contentMigration ?? renameMappings[settings.renameContentMode ?? 'preserve'],
          }
        : removalMappings
          ? { ...settings, contentMigration: removalMappings }
          : settings;
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
      settings: confirmedInput,
      renameMappings,
      originalInstruction,
      currentDefinition,
      referenceRelations: live.schema.relationTypes ?? {},
      impact: await assessWorkspaceSchemaImpact(
        db,
        projectId,
        live.draft.workspace_state!,
        applied.schema,
        true,
        confirmedInput
      ),
      requestDigest,
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
    record.cards = continuation
      ? schemaSettingsView(continuation).cards
      : changes.length > 1
        ? changes.map((change, index) => ({
            ...schemaSettingsView(record),
            settingsId: index ? `${operationId}:change:${index}` : operationId,
            settings: change,
            status: index ? ('queued' as const) : ('pending' as const),
            changes: index ? [] : record.changes,
          }))
        : undefined;
    await saveWorkspaceSchemaPreparation(db, {
      projectId,
      workspaceId,
      expectedRevision: live.draft.revision,
      assistantSchemaSettings: record,
    });
    return schemaSettingsView(record);
  };
  return {
    read,
    show: (
      settings: AssistantSchemaSettingsInput,
      operationId: string,
      originalInstruction?: string
    ) => stage(settings, operationId, originalInstruction),
    confirm: async (
      id: string,
      revision: number,
      settings: AssistantSchemaSettingsInput | null,
      options: { discardStudioCandidate?: boolean } = {}
    ) => {
      let record = await read();
      if (record && record.settingsId !== id) {
        const cards = schemaSettingsView(record).cards;
        const queued = cards?.find((card) => card.settingsId === id && card.status === 'queued');
        if (
          !queued ||
          record.status !== 'applied' ||
          cards?.some((card) => {
            const path = [card.settings.nodePath, card.settings.name].filter(Boolean).join('/');
            return (
              card.settings.action === 'add_node' &&
              card.status !== 'applied' &&
              (queued.settings.nodePath === path || queued.settings.nodePath.startsWith(path + '/'))
            );
          })
        )
          throw new StudioError('CONFLICT', 'Confirm the previous Schema card first.');
        if (!settings) {
          if (queued.revision !== revision)
            throw new StudioError('CONFLICT', 'Settings changed. Refresh the card.');
          const draft = await findWorkspaceDraft(db, projectId, workspaceId);
          if (!draft) throw new StudioError('NOT_FOUND', 'Workspace is unavailable.');
          const next = Stored.parse({
            ...record,
            workspaceRevision: draft.revision + 1,
            cards: cards!.map((card) => {
              const path = [queued.settings.nodePath, queued.settings.name]
                .filter(Boolean)
                .join('/');
              const dependent =
                queued.settings.action === 'add_node' &&
                (card.settings.nodePath === path || card.settings.nodePath.startsWith(path + '/'));
              return card.settingsId === id || (card.status === 'queued' && dependent)
                ? { ...card, status: 'cancelled' }
                : card;
            }),
          });
          await saveWorkspaceSchemaPreparation(db, {
            projectId,
            workspaceId,
            expectedRevision: draft.revision,
            assistantSchemaSettings: next,
          });
          return schemaSettingsView(next);
        }
        const live = await currentBasis(db, projectId, workspaceId);
        const binding = (
          live.draft.workspace_state!.schemaBindings as Record<string, unknown>[]
        )[0];
        const edit = parseWorkspaceSchemaEditCandidate(
          live.draft.workspace_state!.schemaEditCandidate
        );
        if (
          live.schemaHash !== record.snapshot?.schemaHash ||
          binding.compositionHash !== record.snapshot?.compositionHash ||
          live.contentHash !== record.contentHash ||
          live.refHead !== record.refHead ||
          edit.revision !== record.candidateRevision
        )
          throw new StudioError(
            'CONFLICT',
            'Schema or content changed outside this card group. Open new settings.'
          );
        await stage(queued.settings, id, record.originalInstruction, record);
        record = await read();
      }
      if (!record || record.settingsId !== id)
        throw new StudioError('NOT_FOUND', 'Settings not found.');
      if (
        settings &&
        ['remove_slot', 'remove_node'].includes(settings.action) &&
        (settings.contentMigration === undefined ||
          (await sha256CompositionValue(settings.contentMigration)) !==
            (await sha256CompositionValue(record.settings.contentMigration ?? null)))
      )
        throw new StudioError(
          'REVIEW_REQUIRED',
          'Review and confirm the exact content deletion plan. Refresh the deletion card.'
        );
      const digest = settings ? await sha256CompositionValue(settings) : null;
      if (
        ['confirmed', 'generated', 'applied'].includes(record.status) &&
        digest === record.confirmationDigest
      ) {
        if (record.status === 'confirmed') await assertFresh(db, projectId, workspaceId, record);
        return schemaSettingsView(record);
      }
      // A failed generated rename may revise only its content plan without regenerating Schema.
      if (
        record.status === 'generated' &&
        settings &&
        record.settings.action.startsWith('rename_')
      ) {
        const withoutMapping = (value: AssistantSchemaSettingsInput) => {
          const { contentMigration: _commands, renameContentMode: _mode, ...definition } = value;
          return definition;
        };
        if (
          record.revision !== revision ||
          (await sha256CompositionValue(withoutMapping(settings))) !==
            (await sha256CompositionValue(withoutMapping(record.settings)))
        )
          throw new StudioError(
            'CONFLICT',
            'The generated Schema cannot change. Open a new card for different definition parameters.'
          );
        const live = await currentBasis(db, projectId, workspaceId);
        const candidate = parseWorkspaceSchemaEditCandidate(
          live.draft.workspace_state!.schemaEditCandidate
        );
        if (
          live.schemaHash !== record.schemaHash ||
          live.contentHash !== record.contentHash ||
          live.bindingHash !== record.bindingHash ||
          live.refHead !== record.refHead ||
          candidate.candidateId !== record.candidateId ||
          candidate.revision !== record.candidateRevision
        )
          throw new StudioError('CONFLICT', 'Schema or content changed. Open new settings.');
        const next = Stored.parse({
          ...record,
          settings,
          confirmationDigest: digest,
          revision: revision + 1,
          workspaceRevision: live.draft.revision + 1,
        });
        await saveWorkspaceSchemaPreparation(db, {
          projectId,
          workspaceId,
          expectedRevision: live.draft.revision,
          assistantSchemaSettings: next,
        });
        return schemaSettingsView(next);
      }
      if (
        (record.status !== 'pending' &&
          !(['confirmed', 'generated'].includes(record.status) && !settings)) ||
        record.revision !== revision
      )
        throw new StudioError('CONFLICT', 'Settings changed. Refresh the card.');
      const live = settings
        ? await assertFresh(db, projectId, workspaceId, record)
        : { draft: await findWorkspaceDraft(db, projectId, workspaceId) };
      if (!live.draft) throw new StudioError('NOT_FOUND', 'Workspace is unavailable.');
      if (settings) {
        if (settings.action === 'add_node' && additionCards(settings).length !== 1)
          throw new StudioError(
            'INVALID_REQUEST',
            'Node and Slot additions require separate confirmation cards.'
          );
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
          settings.nodePath !== record.settings.nodePath ||
          (!settings.action.startsWith('add_') && settings.name !== record.settings.name) ||
          settings.intent !== record.settings.intent
        )
          throw new StudioError(
            'INVALID_REQUEST',
            'The operation and parent cannot change during confirmation.'
          );
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
              (await compileConfirmedSchemaChange(record.baseDefinition, settings)).schema
            )
          : record.changes,
        workspaceRevision: live.draft.revision + 1,
      });
      if (!settings && next.cards)
        next.cards = next.cards.map((card) =>
          card.status === 'queued' ? { ...card, status: 'cancelled' as const } : card
        );
      if (settings?.action === 'add_node' && settings.name !== record.settings.name && next.cards) {
        const from = [settings.nodePath, record.settings.name].filter(Boolean).join('/');
        const to = [settings.nodePath, settings.name].filter(Boolean).join('/');
        next.cards = next.cards.map((card) =>
          card.status === 'queued' &&
          (card.settings.nodePath === from || card.settings.nodePath.startsWith(from + '/'))
            ? {
                ...card,
                settings: {
                  ...card.settings,
                  nodePath: to + card.settings.nodePath.slice(from.length),
                },
              }
            : card
        );
      }
      await saveWorkspaceSchemaPreparation(db, {
        projectId,
        workspaceId,
        expectedRevision: live.draft.revision,
        assistantSchemaSettings: next,
      });
      return schemaSettingsView(next);
    },
    propose: (id: string) =>
      schemaGenerationFlight(
        db,
        JSON.stringify([projectId, workspaceId, actor, conversationId, id]),
        async () => {
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
          const applied = await generateTransitionProposal({
            target: 'schema',
            baseSchema: record.baseDefinition,
            confirmedSettings: record.settings,
            assertCurrent: async () => {
              if ((await assertProjectAccess(c, db, projectId, 'project:edit')) instanceof Response)
                throw new StudioError('FORBIDDEN', 'Workspace edit authority changed.');
              const current = await assertFresh(db, projectId, workspaceId, record);
              await resolveWorkspaceSchemaEditBasis(
                c,
                db,
                projectId,
                current.draft.workspace_state!,
                current.schema
              );
            },
          });
          await assertFresh(db, projectId, workspaceId, record);
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
          // Candidate identity uses the same canonical hash as Studio.
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
            applied.schema,
            true,
            record.settings
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
            {
              workspaceRevision: live.draft.revision,
              assistantSchemaSettings: { ...next, impact },
              basis,
            }
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
        }
      ),
    /** Human-only confirmation atomically applies Schema and any explicit rename mapping. No Commit. */
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
          const preview = await previewStudio(
            c,
            tx,
            projectId,
            {
              workspaceId,
              candidateIds: source.candidateIds,
              schemaEditCandidate: source.schemaEditCandidate,
            },
            record.settings
          );
          if (!preview.adoption.allowed)
            throw new StudioError('FORBIDDEN', 'Schema sources are no longer authorized.');
          const commands = record.settings.contentMigration;
          const removing = ['remove_slot', 'remove_node'].includes(record.settings.action);
          if (
            removing &&
            (commands === undefined ||
              (await sha256CompositionValue(commands)) !==
                (await sha256CompositionValue(
                  removalContentMappings(
                    workspace,
                    normalizeYSchemaObject(record.baseDefinition),
                    record.settings
                  )
                )))
          )
            throw new StudioError(
              'REVIEW_REQUIRED',
              'The content deletion plan changed or was not confirmed. Open a new deletion card.'
            );
          const rename =
            record.settings.action === 'rename_slot' || record.settings.action === 'rename_node';
          const prepared =
            (rename || removing) && commands !== undefined
              ? await previewWorkspaceSchemaPreparation(
                  c,
                  tx,
                  projectId,
                  workspaceId,
                  {
                    target: { ...source, reviewHash: preview.reviewHash },
                    ifRevision: draft.revision,
                    commands,
                    confirmedChanges:
                      preview.impact?.items
                        .filter(
                          (item) =>
                            item.kind === 'needs_mapping' ||
                            (removing && item.code === 'CONFIRMED_DEFINITION_REMOVAL')
                        )
                        .map((item) => item.path) ?? [],
                  },
                  { allowInputGaps: true }
                )
              : null;
          if (
            prepared
              ? !prepared.view.canPrepare
              : !preview.report.valid || !preview.impact?.canAdopt
          )
            throw new StudioError(
              'REVIEW_REQUIRED',
              prepared
                ? `Content mapping could not be applied: ${prepared.view.issues.map((issue) => issue.message).join('; ')}`
                : 'Resolve incompatible content or migration requirements before saving to Draft.',
              { impact: preview.impact, ...(prepared ? { issues: prepared.view.issues } : {}) }
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
              ready: prepared ? prepared.view.ready : preview.impact!.content.ready === true,
              issues: prepared ? prepared.view.issues : preview.impact!.content.issues,
            },
          });
          const { schemaPending: _pending, ...unchanged } = workspace;
          const actionId =
            prepared && commands!.length
              ? `assistant-schema-migration:${record.settingsId}`
              : undefined;
          const ledger =
            actionId && prepared
              ? publishSchemaPreparationContent(
                  workspace,
                  draft.revision,
                  prepared.migration,
                  actor,
                  actionId,
                  `${removing ? 'Remove' : 'Rename'} ${[record.settings.nodePath, record.settings.name].filter(Boolean).join('/')}: ${removing ? 'delete' : (record.settings.renameContentMode ?? 'preserve')} content`
                )
              : null;
          return {
            workspace: {
              ...unchanged,
              ...(ledger ? { authoringLedger: ledger } : {}),
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
                    ledger?.compositionRevision ??
                    workspaceAuthoringState(workspace).ledger.compositionRevision,
                  actor,
                  kind: ledger ? 'schema_and_content' : 'schema_only',
                  ...(actionId ? { actionId, commands } : {}),
                  ready: next.application!.ready,
                  schemaCard: { ...schemaSettingsView(next), cards: undefined },
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
