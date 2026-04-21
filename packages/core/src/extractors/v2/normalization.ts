export interface PromptTurnInput {
  turn_hash: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
}

export interface PromptTurn extends PromptTurnInput {
  turn_tag: string;
}

const SMART_QUOTES: Record<string, string> = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201C': '"',
  '\u201D': '"',
};

export function buildPromptTurnMap(turns: PromptTurnInput[]): {
  taggedTurns: PromptTurn[];
  turnHashByTag: Record<string, string>;
} {
  const taggedTurns = turns.map((turn, index) => ({
    ...turn,
    turn_tag: `T${index + 1}`,
  }));

  const turnHashByTag = Object.fromEntries(
    taggedTurns.map((turn) => [turn.turn_tag, turn.turn_hash])
  );

  return { taggedTurns, turnHashByTag };
}

export function normalizeExtractionText(rawText: string): string {
  const withoutBom = rawText.replace(/^\uFEFF/, '');
  const normalizedLines = withoutBom.replace(/\r\n?/g, '\n');
  const trimmedBeforeFenceStrip = normalizedLines.trim();
  const strippedFences = trimmedBeforeFenceStrip.replace(
    /^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```$/u,
    '$1'
  );
  const normalizedQuotes = strippedFences.replace(
    /[\u2018\u2019\u201C\u201D]/g,
    (match) => SMART_QUOTES[match] ?? match
  );
  const trimmed = normalizedQuotes.trim();

  if (trimmed.length === 0) {
    return '';
  }

  return `${trimmed}\n`;
}
