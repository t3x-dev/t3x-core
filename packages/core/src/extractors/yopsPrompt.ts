/**
 * YOps Prompt Builder — v2 (Simplified)
 *
 * Design: Simple prompt for high recall. Code enforces structure.
 * The LLM's job: extract ALL facts into a YAML tree with source quotes.
 * Post-processing code handles: single-root enforcement, validation.
 *
 * Output formats (matching what `yopsParser` actually accepts):
 *  - First extraction → YAML tree, then `---`, then JSON metadata block
 *    with `slot_quotes` and `source_map` (parsed by `parseYamlTree`).
 *  - Incremental → YOps list (`yops: [...]`) using the strict schema from
 *    `@t3x-dev/yops` (parsed by `parseYopsList`). The post-migration ops
 *    do NOT carry per-op `source`/`from` — provenance lives on the tree.
 */

import type { SemanticContent, TreeNode } from '../semantic/types';
import { DEFAULT_STYLE, type ExtractionStyleConfig } from './extractionStyleConfig';

// -- Re-export types that callers need --

export type { ExtractionInput, ExtractionPromptResult, ExtractionTurn } from './extractionPrompt';

import type { ExtractionInput, ExtractionPromptResult } from './extractionPrompt';
import {
  granularitySegment,
  quoteLengthSegment,
  tier3KeyDistinction,
  tier3Segment,
  updateStanceSegment,
} from './extractionPrompt';

// -- Internal Helpers --

const SOURCE_CONTRACT = `

# OUTPUT CONTRACT — PER-OP SOURCE (STRICT)

Every YOp you produce MUST include a "source" field with this exact shape:

  source:
    type: llm
    model: <your model name>
    at: <current ISO-8601 timestamp>
    turn_ref:
      turn_hash: <the sha256: hash of the turn this op derives from>
      quote: <VERBATIM substring of that turn — no paraphrase, no summary>

RULES (violations will cause the system to reject your output and re-ask):
  - "quote" MUST appear verbatim (exact substring, case-sensitive) in the referenced turn's content.
  - "turn_hash" MUST match one of the turn hashes from the Conversation section exactly.
  - Never invent a quote. If you cannot find a verbatim substring to cite, skip the op — do not produce it.
  - Every op (set / populate / define / drop / relate / etc.) must have source.
`;

function formatFailingOpsRetry(failingOps: readonly { op: unknown; opIndex: number; reason: string; detail?: string }[]): string {
  if (failingOps.length === 0) return '';
  const lines = failingOps.map((f, i) => {
    const opJson = JSON.stringify(f.op, null, 2);
    return `# Failing op ${i + 1} — reason: ${f.reason}${f.detail ? ` (${f.detail})` : ''}\n${opJson}`;
  });
  return `

# RETRY — FIX THESE OPS
The previous attempt produced ops that could not be verified. For EACH failing op below,
produce a corrected version with a verbatim quote from the correct turn. Do NOT re-emit
the entire extraction — only repair the listed ops.

${lines.join('\n\n')}
`;
}

function serializeTreeForSnapshot(node: TreeNode, indent = 0): string {
  const pad = '  '.repeat(indent);
  const lines: string[] = [];
  lines.push(`${pad}${node.key}:`);
  for (const [key, value] of Object.entries(node.slots)) {
    lines.push(`${pad}  ${key}: ${JSON.stringify(value)}`);
  }
  for (const child of node.children ?? []) {
    lines.push(serializeTreeForSnapshot(child, indent + 1));
  }
  return lines.join('\n');
}

function serializeSnapshot(snapshot: SemanticContent): string {
  if (snapshot.trees.length > 0) {
    return snapshot.trees.map((tree) => serializeTreeForSnapshot(tree)).join('\n\n');
  }
  return '';
}

function formatTurns(turns: { role: string; content: string; turn_hash?: string }[]): string {
  return turns
    .map((t, i) => {
      const tag = t.turn_hash ? `[T${i + 1}:${t.turn_hash.slice(0, 8)}]` : `[T${i + 1}]`;
      return `${tag} [${t.role}]: ${t.content}`;
    })
    .join('\n');
}

// -- First-extraction System Prompt --
//
// Output format: YAML tree (single root) + `---` + JSON metadata block.
// The parser routes this through `parseYamlTree` which auto-converts the tree
// into `define`/`populate` ops in the strict schema and threads `slot_quotes`
// + `source_map` onto the tree's metadata.

function buildFirstExtractionSystemPrompt(style: ExtractionStyleConfig): string {
  return `You are a knowledge extraction engine. Your job is simple:
Read the conversation and extract ALL facts, details, and information into a structured YAML tree.

## Three-Tier Extraction Rule

| Tier | Description | Action | Confidence |
|------|-------------|--------|------------|
| TIER 1 | User explicitly stated (preferences, facts, decisions) | Always extract | 0.9-1.0 |
| TIER 2 | User confirmed or agreed with AI suggestion | Extract it | 0.8-0.9 |
${tier3Segment(style.tier3)}

${tier3KeyDistinction(style.tier3)}

Do NOT extract:
- Greetings, filler ("sure!", "let me help", "of course!")
- Assistant asking clarifying questions ("What would you like to know?", "Are you asking about...")
- Lists of options the assistant offered BEFORE the user chose — only extract what was actually discussed
- Brief mentions of alternatives not explored further (e.g., a castle named once but never discussed)
- Conversational scaffolding ("Feel free to ask", "I'm here to help")
- Meta-commentary about the conversation itself

## Output format: YAML tree + JSON metadata

Output a single YAML tree (one root node), then a \`---\` separator on its own line,
then a JSON block containing \`slot_quotes\` and \`source_map\`.

### Structure
- ONE root node named after the conversation topic (snake_case)
- Children for subtopics — nest related facts under nested objects
- Leaf values: descriptive text (short phrases, labels, numbers) — NOT full sentences, NOT booleans
- NEVER use true/false for slot values — use the actual descriptive text instead
  - BAD: unesco_status: true → GOOD: unesco_status: World Heritage Site
  - BAD: surrounded_at_high_tide: true → GOOD: high_tide_effect: completely surrounded by water
- Object values become CHILD NODES, scalars/arrays become SLOT VALUES on the parent

${granularitySegment(style.granularity)}

### slot_quotes (provenance)
After the YAML tree, output a \`slot_quotes\` mapping inside the JSON block.
Each slot SHOULD have a corresponding entry quoting the conversation.
${quoteLengthSegment(style.quote_length)}
- slot_quotes keys use dot-path notation (e.g., \`dining.cuisine\`)
- Root-level slots have no prefix (e.g., \`destination\`)

### source_map (turn tracking)
For each tree node, map its key to the turn tag (T1, T2, ...) where the topic was first introduced.

### Example

\`\`\`
api_latency_fix:
  diagnosis:
    symptom: p95 latency spike after deploy
    root_cause: N+1 query in order list endpoint
    evidence: "each order loads customer separately"
  solution:
    approach: eager loading
    steps:
      - "add includes(:customer) to Order query"
      - "verify with query log — should drop from 50 to 1"
    key_insight: "fix the query, not the cache — caching hides the real cost"
  prevention:
    tool: bullet gem
    config: "raise in development, log in production"
---
{
  "slot_quotes": {
    "diagnosis.symptom": "p95 latency spiked right after the deploy",
    "diagnosis.root_cause": "N+1 query loading each customer separately",
    "diagnosis.evidence": "each order loads customer separately",
    "solution.approach": "use eager loading",
    "solution.steps.0": "add includes(:customer) to the Order query",
    "solution.steps.1": "check the query log, should drop from 50 queries to 1",
    "solution.key_insight": "fix the query, not the cache",
    "prevention.tool": "bullet gem catches N+1s",
    "prevention.config": "raise in development, log in production"
  },
  "source_map": {
    "api_latency_fix": "T1",
    "diagnosis": "T1",
    "solution": "T2",
    "prevention": "T3"
  }
}
\`\`\`

### Structure — Read the Keys, Get the Story
A reader scanning ONLY the node keys (not slot values) should understand the narrative.
Nest effects under causes, steps under solutions, details under decisions.
If the conversation has reasoning, the tree should reflect it — not flatten it into peer slots.

### Extraction Recall
- Do NOT skip a fact because you can't find a perfect quote — use the closest matching phrase
- Every list item, number, recommendation, and detail is worth capturing
- A short keyword quote is better than skipping the data entirely

### Content Blobs (code, plots, tables)
When the conversation contains code blocks, charts, or structured data,
store them as blob objects with a \`_type\` field — these stay as SLOT VALUES (not children):
- Code: \`{ _type: "code", language: "python", content: "def foo(): ..." }\`
- Plot: \`{ _type: "plot", format: "bar", description: "...", data: { labels: [...], values: [...] } }\`
- Table: \`{ _type: "table", headers: [...], rows: [[...], ...] }\`
Blobs preserve complete meaning blocks — do NOT decompose code into separate slots.

### Rules
- Output ONLY: the YAML tree, then \`---\` on its own line, then the JSON metadata block
- No markdown fences, no explanatory text before, between, or after
- Keys use snake_case, paths use \`/\` separator${updateStanceSegment(style.update_stance)}`;
}

// -- Incremental System Prompt --
//
// Output format: YOps list using the strict post-migration schema.
// Each op has the exact fields the @t3x-dev/yops Zod schema accepts —
// no `parent`/`key`/`slots`/`source`/`from` from the legacy format.

function buildIncrementalSystemPrompt(style: ExtractionStyleConfig): string {
  return `You are a knowledge extraction engine. Read the NEW conversation turns and emit
incremental YOps that update the existing topic tree.

## Three-Tier Extraction Rule

| Tier | Description | Action | Confidence |
|------|-------------|--------|------------|
| TIER 1 | User explicitly stated (preferences, facts, decisions) | Always extract | 0.9-1.0 |
| TIER 2 | User confirmed or agreed with AI suggestion | Extract it | 0.8-0.9 |
${tier3Segment(style.tier3)}

${tier3KeyDistinction(style.tier3)}

Do NOT extract:
- Greetings, filler ("sure!", "let me help", "of course!")
- Assistant asking clarifying questions ("What would you like to know?")
- Lists of options offered BEFORE the user chose — only extract what was discussed
- Brief mentions of alternatives not explored further
- Conversational scaffolding and meta-commentary

## Output format: YOps list

Output a single YAML document with a \`yops:\` array. Each item is exactly one of:

**Most common (use first):**
- \`set: { path, value }\` — update ONE slot. The most common op for incremental changes
- \`populate: { path, values }\` — update multiple slots at once on an existing node
- \`define: { path }\` — create a NEW empty node. ONLY for paths NOT in the Current Tree
- \`unset: { path }\` — remove a slot
- \`drop: { path }\` — remove a node and all its children
- \`append: { path, value }\` — add a value to an existing list without rewriting it

**Structure changes (use when the conversation reveals the tree should be reorganized):**
- \`rename: { path, to }\` — change a node's key name
- \`move: { from, to }\` — move a node to a different parent path
- \`nest: { path, under }\` — wrap a node inside a new parent (e.g., flat slot → nested group)
- \`fold: { paths, into }\` — combine sibling nodes into one
- \`merge: { from, into }\` — deep-merge one node into another
- \`split: { path, into }\` — split a node into multiple siblings
- \`clone: { from, to }\` — deep-copy a node

**List operations:**
- \`sort: { path, by, order }\` — sort a sequence
- \`unique: { path }\` — deduplicate a sequence
- \`pick: { path, keys }\` — keep only specified keys
- \`omit: { path, keys }\` — remove specified keys

**Semantic relations (T3X):**
- \`relate: { from, to, type }\` — add a relation (\`type\` ∈ causes, conditions, contrasts, follows, depends)
- \`unrelate: { from, to, type }\` — remove a relation

**Constraint:**
- \`assert: { path, operator, value }\` — validate without mutating (\`operator\` ∈ exists, equals, type)

Paths use \`/\` separator (e.g., \`trip/dining\`). Keys use snake_case.
Values: descriptive text (short phrases, labels, numbers) — NOT full sentences, NOT booleans.
NEVER use true/false — use the actual text (e.g., "World Heritage Site" not true).

**IMPORTANT: Prefer updating existing structure over adding new nodes.** Only use structure-change ops (nest, fold, move, split) when the conversation explicitly indicates the tree should be reorganized — not for cosmetic improvements.

${granularitySegment(style.granularity)}

${quoteLengthSegment(style.quote_length)}

### Example

\`\`\`
yops:
  - set:
      path: trip/budget
      value: 5000
  - populate:
      path: trip/accommodation
      values:
        type: ryokan
        area: Asakusa
  - append:
      path: trip/dietary_restrictions
      value: lactose_intolerant
  - drop:
      path: trip/old_plan
  - define:
      path: trip/activities
\`\`\`

### Content Blobs (code, plots, tables)
When the conversation contains code blocks, charts, or structured data,
store them inside \`values\` as blob objects with a \`_type\` field:
- Code: \`{ _type: "code", language: "python", content: "def foo(): ..." }\`
- Plot: \`{ _type: "plot", format: "bar", description: "...", data: { labels: [...], values: [...] } }\`
- Table: \`{ _type: "table", headers: [...], rows: [[...], ...] }\`

### Structure Priority — Skeleton Before Detail
When new turns contain reasoning, step-by-step logic, or cause-effect chains:
- Create child nodes that reflect the logical structure (diagnosis/solution, steps, conditions)
- Use ordered children (step_1, step_2) for sequential processes
- Nest effects under causes, conclusions under evidence
- Give key insights and root causes their own nodes — don't bury them as peer slots

### Rules
- Output ONLY valid YAML starting with \`yops:\`
- No markdown fences, no explanatory text
- Each op must use EXACTLY the fields shown above — no extra fields like \`parent\`, \`key\`, \`slots\`, \`source\`, or \`from\`
- NEVER use \`define\` for a path that already exists in the Current Tree — use \`set\` or \`populate\` instead
- Use \`define\` ONLY for creating brand-new nodes not yet in the snapshot
- Do NOT reorganize the tree unless the conversation explicitly calls for it
- If nothing to extract: output \`yops: []\`
- Drift: if NEW turns discuss a topic UNRELATED to the current tree, output \`yops: []\`${updateStanceSegment(style.update_stance)}${SOURCE_CONTRACT}`;
}

// -- Main Function --

export function buildYOpsPrompt(
  input: ExtractionInput,
  opts?: { style?: Partial<ExtractionStyleConfig>; failingOps?: readonly { op: unknown; opIndex: number; reason: string; detail?: string }[] }
): ExtractionPromptResult {
  const style = opts?.style;
  const failingOps = opts?.failingOps ?? [];
  const { turns, snapshot, processedTurnCount, additionalContext } = input;
  const hasSnapshot = !!snapshot && snapshot.trees.length > 0;
  const resolved: ExtractionStyleConfig = { ...DEFAULT_STYLE, ...style };

  if (hasSnapshot) {
    // Incremental mode — YOps list against an existing tree
    const systemPrompt = buildIncrementalSystemPrompt(resolved);
    const snapshotYaml = serializeSnapshot(snapshot!);
    const splitAt = processedTurnCount ?? 0;
    const contextTurns = splitAt > 0 ? turns.slice(0, splitAt) : [];
    const newTurns = splitAt > 0 ? turns.slice(splitAt) : turns;

    let turnsSection: string;
    if (contextTurns.length > 0 && newTurns.length > 0) {
      const contextText = formatTurns(contextTurns);
      const newText = newTurns
        .map((t, i) => {
          const idx = contextTurns.length + i;
          const tag = t.turn_hash ? `[T${idx + 1}:${t.turn_hash.slice(0, 8)}]` : `[T${idx + 1}]`;
          return `${tag} [${t.role}]: ${t.content}`;
        })
        .join('\n');
      turnsSection = `## Context (already extracted — for reference only)
${contextText}

## ★ NEW Turns — extract from these ★
${newText}`;
    } else {
      turnsSection = `## Conversation
${formatTurns(turns)}`;
    }

    let userPrompt = `## Current Tree
${snapshotYaml}

`;
    if (additionalContext) {
      userPrompt += `## Additional Context (from pinned sources)\n\n${additionalContext}\n\n`;
    }
    userPrompt += `${turnsSection}

Extract changes from the NEW turns only. Prefer set/populate for updates, define for new nodes. Use structure ops (nest/fold/move/rename) only when the conversation explicitly calls for reorganization.`;

    userPrompt += formatFailingOpsRetry(failingOps);

    return { systemPrompt, userPrompt };
  }

  // First extraction — YAML tree + JSON metadata block
  const systemPrompt = buildFirstExtractionSystemPrompt(resolved);
  let userPrompt = '';
  if (additionalContext) {
    userPrompt += `## Additional Context (from pinned sources)\n\n${additionalContext}\n\n`;
  }
  userPrompt += `## Conversation
${formatTurns(turns)}

Extract ALL knowledge into a YAML tree, then \`---\`, then the JSON metadata block.
Capture EVERY fact, number, list item, recommendation, and detail — both from user and assistant.
Do NOT skip information because you're unsure about quoting. A short keyword quote is enough.`;

  return { systemPrompt, userPrompt };
}
