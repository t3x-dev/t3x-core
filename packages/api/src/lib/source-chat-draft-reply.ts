import {
  buildExtractionTargetCatalog,
  type ExtractionTarget,
  type LLMProvider,
} from '@t3x-dev/core';
import { type AnyDB, findConversationById, findTurnsByHashes, recordUsage } from '@t3x-dev/storage';
import { z } from 'zod';
import { resolveProviderAndModel } from './provider-resolver';
import { resolveWorkspaceExtractionContext } from './workspace-transition';
import { resolveWorkspaceYSchema } from './workspace-yschema';
import { schemaRootKeyFromBinding } from './yschema-registry';

const SOURCE_CHAT_DRAFT_REPLY_SCHEMA = 't3x/source-chat-draft-reply' as const;

const SourceChatDraftItemKindSchema = z.enum(['captured', 'excluded', 'needs_confirmation']);

type SourceChatDraftReplyDraft = z.infer<ReturnType<typeof buildSourceChatDraftReplySchema>>;

type StructuredProvider = Pick<LLMProvider, 'generateStructured'> & {
  generateStructured: NonNullable<LLMProvider['generateStructured']>;
};

export type SourceChatDraftItemKind = z.infer<typeof SourceChatDraftItemKindSchema>;

export interface CreateSourceChatDraftReplyInput {
  projectId: string;
  workspaceId: string;
  conversationId: string;
  userTurnHash: string;
  expectedRevision?: number;
  provider?: string;
  model?: string;
  userId?: string;
}

export interface SourceChatDraftItem {
  id: string;
  kind: SourceChatDraftItemKind;
  title: string;
  content: string;
  target_id?: string;
  target_path?: string;
  source_quote?: string;
  source_turn_hash?: string;
}

export interface SourceChatDraftDisplay {
  captured: string[];
  excluded: string[];
  needs_confirmation: string[];
}

export interface CreatedSourceChatDraftReply {
  content: string;
  display: SourceChatDraftDisplay;
  model: string;
  provider: string;
  source_items: SourceChatDraftItem[];
  warnings: string[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

export class SourceChatDraftReplyError extends Error {
  constructor(
    readonly kind:
      | 'source_not_found'
      | 'source_project_mismatch'
      | 'source_selector_invalid'
      | 'provider_unavailable'
      | 'generation_failed',
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SourceChatDraftReplyError';
  }
}

function asStructuredProvider(provider: unknown): StructuredProvider | null {
  if (
    provider &&
    typeof provider === 'object' &&
    'generateStructured' in provider &&
    typeof provider.generateStructured === 'function'
  ) {
    return provider as StructuredProvider;
  }
  return null;
}

function enumSchema(values: readonly string[]): z.ZodEnum<Record<string, string>> {
  return z.enum(
    Object.fromEntries(values.map((value) => [value, value])) as Record<string, string>
  );
}

function buildSourceChatDraftReplySchema(targetPaths: readonly string[]) {
  const targetPathSchema =
    targetPaths.length > 0 ? z.union([enumSchema(targetPaths), z.null()]) : z.null();

  return z
    .object({
      schema: z.literal(SOURCE_CHAT_DRAFT_REPLY_SCHEMA),
      version: z.literal(1),
      source_items: z
        .array(
          z
            .object({
              kind: SourceChatDraftItemKindSchema,
              title: z.string().trim().min(1).max(120),
              content: z.string().trim().min(1).max(800),
              target_path: targetPathSchema,
              source_quote: z.string().trim().min(1).max(800).nullable(),
            })
            .strict()
        )
        .max(20),
      warnings: z.array(z.string().trim().min(1).max(300)).max(8).optional(),
    })
    .strict();
}

function targetPath(target: Pick<ExtractionTarget, 'parent_path' | 'slot'>): string {
  return `${target.parent_path}/${target.slot}`;
}

function slotGuidance(path: string): string | undefined {
  if (path.endsWith('/contract/inputs')) {
    return 'Accepted input materials only. Rejected or excluded input candidates are not non_goals.';
  }
  if (path.endsWith('/contract/outputs')) {
    return 'Accepted deliverables only. Rejected output candidates are not non_goals unless the source explicitly names them as tasks the prompt must not perform.';
  }
  if (path.endsWith('/contract/non_goals')) {
    return 'Only tasks or capabilities explicitly stated as not done, out of scope, unsupported, or non-goals. Do not add rejected inputs, rejected outputs, data sources, examples, metrics, or noise here.';
  }
  return undefined;
}

function compactTargetForPrompt(target: ExtractionTarget): Record<string, unknown> {
  const path = targetPath(target);
  return {
    path,
    type: target.value_type ?? null,
    enum: target.enum ?? null,
    const: target.const ?? null,
    current_value: Object.keys(target).includes('current_value') ? target.current_value : null,
    description: target.description ?? null,
    content_guidance: target.content_guidance ?? null,
    minimum: target.minimum ?? null,
    maximum: target.maximum ?? null,
    minLength: target.minLength ?? null,
    maxLength: target.maxLength ?? null,
    maxWords: target.maxWords ?? null,
    pattern: target.pattern ?? null,
    slot_guidance: slotGuidance(path) ?? null,
  };
}

interface HardExclusion {
  content: string;
  source_quote: string;
}

function extractHardExclusions(sourceText: string): HardExclusion[] {
  const exclusions: HardExclusion[] = [];
  const push = (value: string | undefined, sourceQuote: string | undefined) => {
    const normalized = value
      ?.replace(
        /^(?:include|generate|create|write|包含|包括|输出|生成|创建|写|做|进行|支持)\s+/i,
        ''
      )
      .replace(/\s+/g, ' ')
      .replace(/[.;,]+$/, '')
      .trim();
    const quote = sourceQuote?.trim();
    if (!normalized || !quote || normalized.length > 180) return;
    if (/^(?:it|this|that|them)$/i.test(normalized)) return;
    if (!sourceText.includes(quote)) return;
    if (
      !exclusions.some((existing) => existing.content.toLowerCase() === normalized.toLowerCase())
    ) {
      exclusions.push({ content: normalized, source_quote: quote });
    }
  };

  for (const match of sourceText.matchAll(
    /\b(?:do not|don't|must not|should not|cannot|can't|won't)\s+([^.;\n]+)/gi
  )) {
    push(match[1], match[0]);
  }
  for (const match of sourceText.matchAll(
    /\b(?:not include|exclude|out of scope)\s+([^.;\n]+)/gi
  )) {
    push(match[1], match[0]);
  }
  for (const match of sourceText.matchAll(
    /\b(?:discussed|mentioned)\s+([^.;,]+?)\s+earlier,\s+but\s+[^.;\n]*(?:should not|must not|do not|don't)\s+include\s+it/gi
  )) {
    push(match[1], match[0]);
  }
  for (const match of sourceText.matchAll(
    /(?:不要|不能|不会|不做|不进行|不支持|不输出|不处理|不包含|不包括)([^。；\n]+)/g
  )) {
    push(match[1], match[0]);
  }

  return exclusions;
}

function firstNonGoalPath(targets: readonly ExtractionTarget[]): string | undefined {
  return targets.map(targetPath).find((path) => /(?:^|\/)(?:non_goals|nonGoals)$/.test(path));
}

function generatedItemKey(item: Pick<SourceChatDraftItem, 'kind' | 'title' | 'content'>): string {
  return `${item.kind}:${item.title}:${item.content}`.toLowerCase();
}

function normalizedSourceQuoteKey(quote: string): string {
  return quote
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sameExcludedSourceQuote(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) return false;
  const leftKey = normalizedSourceQuoteKey(left);
  const rightKey = normalizedSourceQuoteKey(right);
  if (!leftKey || !rightKey) return false;
  return leftKey.includes(rightKey) || rightKey.includes(leftKey);
}

function sourceItemTitleFromContent(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 72) return normalized;
  return `${normalized.slice(0, 69).trim()}...`;
}

function normalizeQuote(sourceText: string, quote: string | null): string | undefined {
  const trimmed = quote?.trim();
  if (!trimmed) return undefined;
  if (sourceText.includes(trimmed)) return trimmed;
  return undefined;
}

function normalizeSourceItems(input: {
  draft: SourceChatDraftReplyDraft;
  hardExclusions: readonly HardExclusion[];
  sourceText: string;
  sourceTurnHash: string;
  targets: readonly ExtractionTarget[];
  warnings: string[];
}): SourceChatDraftItem[] {
  const pathToTarget = new Map(input.targets.map((target) => [targetPath(target), target]));
  const nonGoalPath = firstNonGoalPath(input.targets);
  const items: SourceChatDraftItem[] = [];
  const seen = new Set<string>();

  const push = (raw: {
    kind: SourceChatDraftItemKind;
    title: string;
    content: string;
    target_path?: string;
    source_quote?: string;
  }) => {
    const title = raw.title.trim();
    const content = raw.content.trim();
    if (!title || !content) return;

    let kind = raw.kind;
    const quote = normalizeQuote(input.sourceText, raw.source_quote ?? null);
    if (raw.source_quote && !quote) {
      input.warnings.push(
        `Generated item "${title}" had a source_quote that was not an exact source substring.`
      );
      if (kind !== 'needs_confirmation') kind = 'needs_confirmation';
    }
    if (kind !== 'needs_confirmation' && !quote) {
      input.warnings.push(`Generated item "${title}" needs a source_quote before extraction.`);
      kind = 'needs_confirmation';
    }

    const target = raw.target_path ? pathToTarget.get(raw.target_path) : undefined;
    const item: SourceChatDraftItem = {
      id: `S${String(items.length + 1).padStart(3, '0')}`,
      kind,
      title,
      content,
      ...(target ? { target_id: target.target_id, target_path: raw.target_path } : {}),
      ...(quote ? { source_quote: quote, source_turn_hash: input.sourceTurnHash } : {}),
    };
    if (
      kind === 'excluded' &&
      quote &&
      items.some(
        (existing) =>
          existing.kind === 'excluded' && sameExcludedSourceQuote(existing.source_quote, quote)
      )
    ) {
      return;
    }
    const key = generatedItemKey(item);
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };

  for (const raw of input.draft.source_items) {
    push({
      kind: raw.kind,
      title: raw.title,
      content: raw.content,
      ...(raw.target_path ? { target_path: raw.target_path } : {}),
      ...(raw.source_quote ? { source_quote: raw.source_quote } : {}),
    });
  }

  for (const exclusion of input.hardExclusions) {
    push({
      kind: 'excluded',
      title: sourceItemTitleFromContent(exclusion.content),
      content: exclusion.content,
      ...(nonGoalPath ? { target_path: nonGoalPath } : {}),
      source_quote: exclusion.source_quote,
    });
  }

  if (items.length === 0) {
    push({
      kind: 'needs_confirmation',
      title: 'Source detail',
      content: 'I need more concrete source detail before I can prepare source-ready material.',
    });
  }

  return items;
}

function displayText(item: SourceChatDraftItem): string {
  return item.title === item.content ? item.content : `${item.title}: ${item.content}`;
}

function displayFromItems(items: readonly SourceChatDraftItem[]): SourceChatDraftDisplay {
  return {
    captured: items.filter((item) => item.kind === 'captured').map(displayText),
    excluded: items.filter((item) => item.kind === 'excluded').map(displayText),
    needs_confirmation: items.filter((item) => item.kind === 'needs_confirmation').map(displayText),
  };
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function renderReply(display: SourceChatDraftDisplay): string {
  const sections: string[] = [
    'Source draft',
    [
      'I organized your message into source-ready material for the proposal step.',
      'Captured items can be reused downstream; boundaries and open questions stay separate for review.',
      `Summary: ${countLabel(display.captured.length, 'captured item')}, ${countLabel(
        display.excluded.length,
        'boundary'
      )}, ${countLabel(display.needs_confirmation.length, 'confirmation item')}.`,
    ].join('\n'),
  ];
  if (display.captured.length > 0) {
    sections.push(`Captured\n${display.captured.map((item) => `- ${item}`).join('\n')}`);
  }
  if (display.excluded.length > 0) {
    sections.push(`Excluded\n${display.excluded.map((item) => `- ${item}`).join('\n')}`);
  }
  if (display.needs_confirmation.length > 0) {
    sections.push(
      `Needs confirmation\n${display.needs_confirmation.map((item) => `- ${item}`).join('\n')}`
    );
  }
  return sections.join('\n\n');
}

function buildReplyPrompt(input: {
  sourceText: string;
  catalogDigest: string | null;
  targets: readonly ExtractionTarget[];
  hardExclusions: readonly HardExclusion[];
  warnings: readonly string[];
}): { system: string; messages: Array<{ role: 'user'; content: string }> } {
  const targetBlock = JSON.stringify(input.targets.map(compactTargetForPrompt), null, 2);
  return {
    system: [
      'You are the Source Chat generation step.',
      'Generate source-ready draft items from the saved user turn.',
      'This output will be used by later deterministic extraction, proposal, and YOps steps.',
      'Do not apply State changes, do not write YOps, and do not claim that proposals or commits changed.',
      'Use target_path only when it exactly matches one provided target catalog path.',
      'Every captured or excluded item must include an exact source_quote copied verbatim from the user turn.',
      'Use needs_confirmation for ambiguity, missing quotes, or information that is not explicitly stated.',
      'Do not invent placeholders.',
      'Return JSON only.',
    ].join(' '),
    messages: [
      {
        role: 'user',
        content:
          `Target catalog digest: ${input.catalogDigest ?? 'unavailable'}\n` +
          `Target catalog paths:\n${targetBlock}\n\n` +
          `Saved user turn:\n${input.sourceText}\n\n` +
          `Hard exclusions:\n${JSON.stringify(input.hardExclusions, null, 2)}\n\n` +
          `Warnings:\n${JSON.stringify(input.warnings, null, 2)}\n\n` +
          'Return this exact JSON shape:\n' +
          '{ "schema": "t3x/source-chat-draft-reply", "version": 1, "source_items": [{ "kind": "captured|excluded|needs_confirmation", "title": "short label", "content": "source-ready material", "target_path": null, "source_quote": null }], "warnings": [] }\n\n' +
          'Rules:\n' +
          '- captured items are positive materials later generation can use.\n' +
          '- excluded items are explicit boundaries or non-goals.\n' +
          '- needs_confirmation items are concise questions or unresolved assumptions.\n' +
          '- source_quote must be an exact substring of the saved user turn, not a paraphrase.\n' +
          '- Prefer 2-6 total high-signal items.',
      },
    ],
  };
}

function sourceSelectorError(message: string, details?: Record<string, unknown>) {
  return new SourceChatDraftReplyError('source_selector_invalid', message, details);
}

export async function createSourceChatDraftReply(
  db: AnyDB,
  input: CreateSourceChatDraftReplyInput
): Promise<CreatedSourceChatDraftReply> {
  const context = await resolveWorkspaceExtractionContext(db, {
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    expectedRevision: input.expectedRevision,
  });
  const conversation = await findConversationById(db, input.conversationId);
  if (!conversation) {
    throw new SourceChatDraftReplyError(
      'source_not_found',
      `Source conversation not found: ${input.conversationId}`
    );
  }
  if (conversation.projectId !== input.projectId) {
    throw new SourceChatDraftReplyError(
      'source_project_mismatch',
      'Selected Source conversation belongs to another project'
    );
  }

  const selectedTurns = await findTurnsByHashes(db, {
    conversationId: conversation.conversationId,
    turnHashes: [input.userTurnHash],
  });
  const userTurn = selectedTurns[0];
  if (!userTurn) {
    throw sourceSelectorError('Selected immutable Source turn was not found', {
      missing_turn_hash: input.userTurnHash,
    });
  }
  if (userTurn.role !== 'user') {
    throw sourceSelectorError('Source Chat draft replies can only be generated from user turns');
  }

  const providerResolution = await resolveProviderAndModel({
    db,
    requestedProvider: input.provider,
    requestedModel: input.model,
    conversationId: conversation.conversationId,
    projectId: input.projectId,
    userId: input.userId,
    unavailableMessage: 'No configured Source Chat draft provider is available',
  });
  if (!providerResolution.ok) {
    throw new SourceChatDraftReplyError('provider_unavailable', providerResolution.message);
  }
  const structuredProvider = asStructuredProvider(providerResolution.provider);
  if (!structuredProvider) {
    throw new SourceChatDraftReplyError(
      'provider_unavailable',
      `Provider ${providerResolution.providerId} does not support structured Source Chat drafts`
    );
  }

  const schemaResolution = await resolveWorkspaceYSchema(context.workspace, db, input.projectId);
  const schemaBinding = Array.isArray(context.workspace.schemaBindings)
    ? context.workspace.schemaBindings[0]
    : undefined;
  const catalogResult = buildExtractionTargetCatalog({
    snapshot: context.baseline,
    yschema: schemaResolution.schema ?? undefined,
    yschemaRootKey: schemaResolution.schema ? schemaRootKeyFromBinding(schemaBinding) : undefined,
    maxTargets: 80,
  });
  const warnings = catalogResult.ok ? [...catalogResult.catalog.warnings] : [catalogResult.reason];
  const targets = catalogResult.ok ? catalogResult.catalog.targets : [];
  const catalogDigest = catalogResult.ok ? catalogResult.catalog.digest : null;
  const hardExclusions = extractHardExclusions(userTurn.content);
  const replySchema = buildSourceChatDraftReplySchema(targets.map(targetPath));

  let replyResult: Awaited<ReturnType<StructuredProvider['generateStructured']>>;
  try {
    replyResult = await structuredProvider.generateStructured(
      buildReplyPrompt({
        sourceText: userTurn.content,
        catalogDigest,
        targets,
        hardExclusions,
        warnings,
      }),
      replySchema,
      { model: providerResolution.model, temperature: 0, maxTokens: 4096 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Source Chat draft generation failed';
    throw new SourceChatDraftReplyError('generation_failed', message);
  }

  warnings.push(...(replyResult.data.warnings ?? []));
  const sourceItems = normalizeSourceItems({
    draft: replyResult.data,
    hardExclusions,
    sourceText: userTurn.content,
    sourceTurnHash: userTurn.turnHash,
    targets,
    warnings,
  });
  const display = displayFromItems(sourceItems);
  const usage = {
    input_tokens: replyResult.usage.inputTokens,
    output_tokens: replyResult.usage.outputTokens,
  };

  await recordUsage(db, {
    user_id: input.userId,
    project_id: input.projectId,
    endpoint: 'source-chat-draft-reply',
    model: providerResolution.model,
    input_tokens: usage.input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
  }).catch(() => undefined);

  return {
    content: renderReply(display),
    display,
    model: providerResolution.model,
    provider: providerResolution.providerId,
    source_items: sourceItems,
    warnings,
    usage,
  };
}
