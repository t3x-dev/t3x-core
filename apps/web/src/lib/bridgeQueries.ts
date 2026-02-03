export type BridgeTemplate =
  | 'prose'
  | 'plan'
  | 'story'
  | 'summary'
  | 'refine'
  | 'explain'
  | 'clarify';

export const bridgeQueryDefs: Record<BridgeTemplate, { task: string; schema: string }> = {
  summary: {
    task: 'Extract the most important conclusions and factual takeaways: key numbers, core judgments, and summary statements. Prefer high-signal content; ignore detailed elaboration and repetition.',
    schema:
      'Output 3-7 bullet points. Each bullet is one clear conclusion/fact, ideally one sentence, avoiding examples and process details.',
  },
  plan: {
    task: 'Extract actionable steps and tasks: order, dependencies, prerequisites, roles, and acceptance criteria. Prefer list-like, instruction-style content.',
    schema:
      'Output numbered steps. Each step includes: Goal -> Action -> Expected outcome / Acceptance criteria.',
  },
  prose: {
    task: 'Extract paragraph-ready content: definitions, explanations, reasons, contrasts, reasoning chains, viewpoints, and implications. Prefer logically complete statements.',
    schema:
      'Preferred paragraph flow: definition/viewpoint -> explanation/reasoning -> example (optional) -> implication/summary. Keep coherence; avoid fragmented sentence piles.',
  },
  story: {
    task: 'Extract narrative elements: timeline events, causality, characters/setting, conflict and resolution. Prefer content that supports a coherent storyline.',
    schema:
      'Preferred arc: setup -> development -> climax -> resolution. Keep transitions and connections; avoid jumpy isolated quotes.',
  },
  refine: {
    task: 'Extract two kinds of sentences: (1) core sentences that must be preserved (key info/conclusions); (2) sentences that need rewriting (unclear, redundant, illogical flow, inconsistent style). Prefer sentence-level granularity.',
    schema:
      'Output two lists: A) Keep-as-core, B) Needs-refine. Keep each item as the original sentence or minimal quote for easy pinpointing.',
  },
  explain: {
    task: 'Extract content that supports a clear explanation: definitions, reasoning steps, examples, and clarifications that reduce confusion.',
    schema:
      'Explain in a structured way: concept -> why it matters -> how it works -> example (optional). Keep it clear and concise.',
  },
  clarify: {
    task: 'Extract ambiguous points, missing assumptions, and places where the intent is unclear. Prefer content that would benefit from asking clarifying questions.',
    schema:
      'Output a short list of clarifying questions, each targeting one ambiguity or missing constraint.',
  },
};

export function buildBridgeQueries(params: {
  template: BridgeTemplate;
  unitTitle?: string;
  userMessage: string;
}) {
  const def = bridgeQueryDefs[params.template] ?? bridgeQueryDefs.summary;
  const qUser = `UNIT: ${params.unitTitle ?? ''}\nUSER: ${params.userMessage}`.trim();
  const qTask = `TEMPLATE_TASK: ${def.task}`;
  const qSchema = `TEMPLATE_SCHEMA: ${def.schema}`;

  return { qUser, qTask, qSchema };
}
