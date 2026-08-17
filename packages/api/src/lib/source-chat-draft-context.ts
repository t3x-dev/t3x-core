interface SourceChatDraftContextTurn {
  turnHash: string;
  ringsJson?: string | null;
}

interface SourceChatDraftItem {
  id?: unknown;
  kind?: unknown;
  title?: unknown;
  content?: unknown;
  target_id?: unknown;
  target_path?: unknown;
  source_quote?: unknown;
  source_turn_hash?: unknown;
}

interface SourceChatDraftMetadata {
  schema?: unknown;
  version?: unknown;
  source_items?: unknown;
}

type SourceChatDraftItemKind = 'captured' | 'excluded' | 'needs_confirmation';

interface SourceChatDraftContextOptions {
  kinds?: readonly SourceChatDraftItemKind[];
  includeInstruction?: boolean;
}

const SOURCE_CHAT_DRAFT_CONTEXT_HEADER = '## Source Chat Draft Items';
const SOURCE_CHAT_DRAFT_ITEM_LIMIT = 30;
const SOURCE_CHAT_DRAFT_FIELD_LIMIT = 600;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRings(ringsJson: string | null | undefined): Record<string, unknown> | null {
  if (!ringsJson) return null;
  try {
    const parsed = JSON.parse(ringsJson) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function sourceChatDraftFromTurn(turn: SourceChatDraftContextTurn): SourceChatDraftMetadata | null {
  const rings = parseRings(turn.ringsJson);
  const draft = rings?.source_chat_draft;
  if (!isRecord(draft)) return null;
  if (draft.schema !== 't3x/source-chat-draft-v1' || draft.version !== 1) return null;
  if (!Array.isArray(draft.source_items)) return null;
  return draft as SourceChatDraftMetadata;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function truncateForContext(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= SOURCE_CHAT_DRAFT_FIELD_LIMIT) return normalized;
  return `${normalized.slice(0, SOURCE_CHAT_DRAFT_FIELD_LIMIT - 3).trim()}...`;
}

function labelFromTargetPath(path: string): string | undefined {
  const leaf = path
    .split(/[/.]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .at(-1);
  if (!leaf) return undefined;
  return leaf.replace(/[^a-zA-Z0-9_-]+/g, '_');
}

function sourceChatDraftItems(
  turns: readonly SourceChatDraftContextTurn[]
): Array<{ turnHash: string; item: SourceChatDraftItem }> {
  const items: Array<{ turnHash: string; item: SourceChatDraftItem }> = [];
  for (const turn of turns) {
    const draft = sourceChatDraftFromTurn(turn);
    if (!draft) continue;
    for (const item of draft.source_items as SourceChatDraftItem[]) {
      if (!isRecord(item)) continue;
      items.push({ turnHash: turn.turnHash, item });
      if (items.length >= SOURCE_CHAT_DRAFT_ITEM_LIMIT) return items;
    }
  }
  return items;
}

export function sourceChatDraftReferencedTurnHashes(
  turns: readonly SourceChatDraftContextTurn[]
): string[] {
  const hashes = new Set<string>();
  for (const { item } of sourceChatDraftItems(turns)) {
    const hash = asString(item.source_turn_hash);
    if (hash) hashes.add(hash);
  }
  return [...hashes];
}

export function sourceChatDraftContextText(
  turns: readonly SourceChatDraftContextTurn[],
  options: SourceChatDraftContextOptions = {}
): string | undefined {
  const allowedKinds = options.kinds ? new Set(options.kinds) : null;
  const items = sourceChatDraftItems(turns).filter(({ item }) => {
    if (!allowedKinds) return true;
    const kind = asString(item.kind) ?? 'captured';
    return allowedKinds.has(kind as SourceChatDraftItemKind);
  });
  if (items.length === 0) return undefined;

  const lines = [SOURCE_CHAT_DRAFT_CONTEXT_HEADER];
  if (options.includeInstruction !== false) {
    lines.push(
      'These items were generated earlier from Source Chat. Treat them as routing guidance, not source evidence. Use only exact quotes that appear in selected source turns.'
    );
  }

  for (const { turnHash, item } of items) {
    const kind = asString(item.kind) ?? 'captured';
    const title = asString(item.title) ?? asString(item.id) ?? 'source item';
    const content = asString(item.content);
    lines.push(`- [${kind}] ${truncateForContext(title)}`);
    if (content) lines.push(`  content: ${truncateForContext(content)}`);
    const targetPath = asString(item.target_path);
    const targetId = asString(item.target_id);
    if (targetPath) lines.push(`  target_path: ${truncateForContext(targetPath)}`);
    if (targetId) lines.push(`  target_id: ${truncateForContext(targetId)}`);
    const targetLabel = targetPath ? labelFromTargetPath(targetPath) : undefined;
    if (kind === 'captured' && content && targetLabel) {
      lines.push(`  ${targetLabel}: ${truncateForContext(content)}`);
    }
    lines.push(`  draft_turn_hash: ${turnHash}`);
    const sourceTurnHash = asString(item.source_turn_hash);
    if (sourceTurnHash) lines.push(`  source_turn_hash: ${sourceTurnHash}`);
    const sourceQuote = asString(item.source_quote);
    if (sourceQuote) lines.push(`  source_quote: ${truncateForContext(sourceQuote)}`);
  }

  return lines.join('\n');
}
