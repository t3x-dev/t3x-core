import {
  type BuiltContext,
  buildConversationContext,
  type Commit,
  type ConversationContext,
  type ConversationData,
  estimateTokens,
  filterActivePins,
  flattenTrees,
  type Leaf,
  type Pin,
  type SemanticContent,
  serializeForPrompt,
} from '@t3x-dev/core';
import {
  type AnyDB,
  findConversationById,
  findPinsByProject,
  findTurnsByConversation,
  getCommitUnified,
  getConversationContext,
  getLeavesByIds,
} from '@t3x-dev/storage';

export type BaselineSource = 'parent_commit' | 'none';

export interface ContextManifestBaseline {
  commit_hash: string | null;
  branch: string | null;
  message: string | null;
  content: SemanticContent | null;
  source: BaselineSource;
  source_conversation_id: string | null;
  node_count: number;
  relation_count: number;
}

export interface ContextManifestReference {
  type: Pin['type'];
  id: string;
  pin_id: string;
  included: boolean;
  title?: string;
}

export interface ContextManifestFeedback {
  type: 'leaf_assertion' | 'runner_assertion';
  id: string;
  parent_ref_id: string;
  pin_id: string;
  selected: boolean;
  included: boolean;
  passed?: boolean;
  details?: string;
  lesson?: string;
}

export interface ConversationContextManifest {
  conversation_id: string;
  project_id: string;
  baseline: ContextManifestBaseline;
  references: ContextManifestReference[];
  feedback: ContextManifestFeedback[];
  chat_context_text: string;
  extraction_context_text: string;
  token_estimate: number;
  sources: BuiltContext['sources'];
}

export interface BuildConversationContextManifestOptions {
  selectedPinIdsOverride?: string[] | null;
}

export async function buildConversationContextManifest(
  db: AnyDB,
  conversationId: string,
  options: BuildConversationContextManifestOptions = {}
): Promise<ConversationContextManifest> {
  const conversation = await findConversationById(db, conversationId);
  if (!conversation) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  const contextConfig = await getConversationContext(db, conversationId);
  const effectiveContextConfig = getEffectiveContextConfig(conversationId, contextConfig, options);
  const projectPins = await findPinsByProject(db, conversation.projectId, { limit: 100000 });
  const contextPins = normalizePinsForContext(projectPins);
  const activePinIds = new Set(
    filterActivePins(contextPins, effectiveContextConfig).map((p) => p.id)
  );

  const baselineContent = await loadBaselineContent(
    db,
    conversation.parentCommitHash ?? null,
    conversation.projectId
  );
  const baseline = toBaseline(baselineContent);

  const { conversations, conversationTitles } = await loadPinnedConversations(
    db,
    projectPins,
    conversationId
  );
  const leaves = await loadPinnedLeaves(db, projectPins);

  const builtPinContext = buildConversationContext({
    knowledge: undefined,
    projectPins: contextPins,
    contextConfig: effectiveContextConfig,
    conversations,
    leaves,
  });

  const baselineText = baselineContent
    ? `## Parent Baseline\n\n${serializeForPrompt(baselineContent.content)}`
    : '';
  const chat_context_text = [baselineText, builtPinContext.text].filter(Boolean).join('\n\n');
  const feedback = buildFeedback(contextPins, leaves, activePinIds);
  const extraction_context_text = buildExtractionContextText(feedback);

  return {
    conversation_id: conversationId,
    project_id: conversation.projectId,
    baseline,
    references: buildReferences(projectPins, leaves, conversationTitles, activePinIds),
    feedback,
    chat_context_text,
    extraction_context_text,
    token_estimate: estimateTokens(chat_context_text),
    sources: builtPinContext.sources,
  };
}

function normalizePinsForContext(projectPins: Pin[]): Pin[] {
  return projectPins.map((pin) => {
    if (pin.type !== 'leaf' || pin.selected_assertion_ids !== undefined) {
      return pin;
    }

    return {
      ...pin,
      selected_assertion_ids: [],
    };
  });
}

function getEffectiveContextConfig(
  conversationId: string,
  contextConfig: ConversationContext | null,
  options: BuildConversationContextManifestOptions
): ConversationContext | null {
  if (options.selectedPinIdsOverride === undefined) {
    return contextConfig;
  }

  return {
    conversation_id: conversationId,
    selected_pin_ids: options.selectedPinIdsOverride,
    updated_at: contextConfig?.updated_at ?? new Date(0).toISOString(),
  };
}

async function loadBaselineContent(
  db: AnyDB,
  parentCommitHash: string | null,
  projectId: string
): Promise<Commit | null> {
  if (!parentCommitHash) return null;

  const commit = await getCommitUnified(db, parentCommitHash);
  if (!commit || commit.project_id !== projectId) return null;

  return commit;
}

function toBaseline(baselineContent: Commit | null): ContextManifestBaseline {
  if (!baselineContent) {
    return {
      commit_hash: null,
      branch: null,
      message: null,
      content: null,
      source: 'none',
      source_conversation_id: null,
      node_count: 0,
      relation_count: 0,
    };
  }

  const sourceConversation = baselineContent.sources?.find(
    (source) => source.type === 'conversation'
  );

  return {
    commit_hash: baselineContent.hash,
    branch: baselineContent.branch,
    message: baselineContent.message,
    content: baselineContent.content,
    source: 'parent_commit',
    source_conversation_id: sourceConversation?.id ?? null,
    node_count: flattenTrees(baselineContent.content.trees).length,
    relation_count: baselineContent.content.relations.length,
  };
}

async function loadPinnedConversations(
  db: AnyDB,
  projectPins: Pin[],
  currentConversationId: string
): Promise<{
  conversations: Map<string, ConversationData>;
  conversationTitles: Map<string, string>;
}> {
  const conversations = new Map<string, ConversationData>();
  const conversationTitles = new Map<string, string>();

  for (const pin of projectPins) {
    if (pin.type !== 'conversation') continue;

    const pinnedConversation = await findConversationById(db, pin.ref_id);
    if (!pinnedConversation) continue;

    const title = pinnedConversation.title ?? 'Untitled';
    conversationTitles.set(pin.ref_id, title);

    if (pin.ref_id === currentConversationId) continue;

    const turns = await findTurnsByConversation(db, {
      conversationId: pin.ref_id,
      limit: 50,
      order: 'asc',
    });
    conversations.set(pin.ref_id, {
      id: pinnedConversation.conversationId,
      title,
      turns: turns.map((turn) => ({
        role: turn.role,
        content: turn.content,
      })),
    });
  }

  return { conversations, conversationTitles };
}

async function loadPinnedLeaves(db: AnyDB, projectPins: Pin[]): Promise<Map<string, Leaf>> {
  const leafIds = projectPins.filter((pin) => pin.type === 'leaf').map((pin) => pin.ref_id);
  const leafRecords = leafIds.length > 0 ? await getLeavesByIds(db, leafIds) : [];
  return new Map(leafRecords.map((leaf) => [leaf.id, leaf]));
}

function buildReferences(
  projectPins: Pin[],
  leaves: Map<string, Leaf>,
  conversationTitles: Map<string, string>,
  activePinIds: Set<string>
): ContextManifestReference[] {
  return projectPins.map((pin) => {
    const leaf = pin.type === 'leaf' ? leaves.get(pin.ref_id) : undefined;
    const conversationTitle =
      pin.type === 'conversation' ? conversationTitles.get(pin.ref_id) : undefined;

    return {
      type: pin.type,
      id: pin.ref_id,
      pin_id: pin.id,
      included: activePinIds.has(pin.id),
      title: leaf?.title ?? conversationTitle,
    };
  });
}

function buildFeedback(
  projectPins: Pin[],
  leaves: Map<string, Leaf>,
  activePinIds: Set<string>
): ContextManifestFeedback[] {
  const feedback: ContextManifestFeedback[] = [];

  for (const pin of projectPins) {
    if (pin.type !== 'leaf') continue;

    const leaf = leaves.get(pin.ref_id);
    if (!leaf) continue;

    const hasRunnerAssertions = leaf.runner_assertions !== undefined;
    const assertions = leaf.runner_assertions ?? leaf.assertions ?? [];
    const feedbackType = hasRunnerAssertions ? 'runner_assertion' : 'leaf_assertion';
    for (const assertion of assertions) {
      const selected = isAssertionExplicitlySelected(pin, assertion.id);
      feedback.push({
        type: feedbackType,
        id: assertion.id,
        parent_ref_id: leaf.id,
        pin_id: pin.id,
        lesson: assertion.lesson,
        selected,
        included: activePinIds.has(pin.id) && selected,
        passed: assertion.passed,
        details: assertion.details,
      });
    }
  }

  return feedback;
}

function isAssertionExplicitlySelected(pin: Pin, assertionId: string): boolean {
  return pin.selected_assertion_ids?.includes(assertionId) ?? false;
}

function buildExtractionContextText(feedback: ContextManifestFeedback[]): string {
  const selectedLessons = feedback.filter((item) => item.included && item.lesson);
  if (selectedLessons.length === 0) return '';

  const lines = [
    '## Selected Leaf Feedback',
    '',
    'These lessons are not source evidence. Use them only as feedback about prior outputs.',
    '',
  ];

  for (const item of selectedLessons) {
    lines.push(`- ${item.lesson}`);
  }

  return lines.join('\n');
}
