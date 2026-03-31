/**
 * YOps Prompt Builder — v2 (Simplified)
 *
 * Design: Simple prompt for high recall. Code enforces structure.
 * The LLM's job: extract ALL facts into a YAML tree with source quotes.
 * Post-processing code handles: single-root enforcement, confidence, validation.
 */

import type { SemanticContent, TreeNode } from '../semantic/types';
import {
  DEFAULT_STYLE,
  type ExtractionStyleConfig,
} from './extractionStyleConfig';

// -- Re-export types that callers need --

export type { ExtractionInput, ExtractionTurn, ExtractionPromptResult } from './extractionPrompt';

import type { ExtractionInput, ExtractionPromptResult } from './extractionPrompt';

// -- Internal Helpers --

function serializeTreeForSnapshot(node: TreeNode, indent = 0): string {
  const pad = '  '.repeat(indent);
  const lines: string[] = [];
  lines.push(`${pad}${node.key}:`);
  for (const [key, value] of Object.entries(node.slots)) {
    lines.push(`${pad}  ${key}: ${JSON.stringify(value)}`);
  }
  for (const child of node.children) {
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

// -- System Prompt --

function buildSystemPrompt(hasSnapshot: boolean): string {
  return `You are a knowledge extraction engine. Your job is simple:
Read the conversation and extract ALL facts, details, and information into a structured YAML tree.

## What to extract
- Everything the assistant explains, lists, or describes
- Everything the user states, asks about, or confirms
- Categories, comparisons, attributes, numbers, lists
- Do NOT extract: greetings, filler ("sure!", "let me help"), or meta-commentary

## Output format: YOps YAML

${hasSnapshot ? `Operations:
- set: Set or update a slot value on an existing node
- unset: Remove a slot from a node
- add: Create a new node with initial slots
- drop: Remove a node and all its children
- rename: Change a node's key name (path: current, to: new_name)
- move: Move a node to a different parent (path: source, to: target_path/key)
- relate: Add a semantic relation (from, to, type: causes|conditions|contrasts|follows|depends)
- unrelate: Remove a semantic relation` : `Operation: add (create nodes with slots and source quotes)`}

Each operation needs:
- **source**: key phrase from the conversation that contains this fact (a few words are enough — does NOT need to be a complete sentence)
- **from**: turn tag (T1, T2, etc.) where the information appears

### Structure
- One root node named after the conversation topic (snake_case)
- Children for subtopics (group related facts)
- Values: clean data (numbers, short labels, booleans, arrays) — NOT full sentences
- Depth: up to 3 levels

### Example${hasSnapshot ? ' (incremental)' : ''}

${hasSnapshot ? `yops:
  - set:
      path: trip/budget
      value: 3000
      source: "let's cap it at 3000"
      from: T5

  - add:
      parent: trip
      node:
        accommodation:
          type: ryokan
          budget: 200
      source:
        type: "I want a ryokan"
        budget: "around 200 per night"
      from: T5` : `yops:
  - add:
      parent: ""
      node:
        giant_panda:
          classification: bear (Ursidae family)
          scientific_name: Ailuropoda melanoleuca
          diet:
            primary: bamboo
            percentage: 99
          coloring:
            pattern: black and white
            purpose: camouflage
          habitat: mountain forests of central China
      source:
        classification: "Giant pandas belong to the bear family Ursidae"
        scientific_name: "Ailuropoda melanoleuca"
        diet.primary: "Bamboo makes up about 99% of a giant panda's diet"
        diet.percentage: "about 99% of a giant panda's diet"
        coloring.pattern: "distinctive black and white coloring"
        coloring.purpose: "camouflage in their natural habitat"
        habitat: "mountain forests of central China"
      from: T2`}

### Extraction Priority
- Extract MORE rather than less — code will clean up duplicates
- Do NOT skip a fact because you can't find a perfect quote — use the closest matching phrase
- Every list item, number, recommendation, and detail is worth capturing
- A short keyword source is better than skipping the data entirely

### Rules
- Output ONLY valid YAML starting with "yops:"
- No markdown fences, no explanatory text
- Every operation MUST have source and from
- If nothing to extract: output "yops: []"
- Keys use snake_case, paths use / separator`;
}

// -- Main Function --

export function buildYOpsPrompt(
  input: ExtractionInput,
  style?: Partial<ExtractionStyleConfig>
): ExtractionPromptResult {
  const { turns, snapshot, processedTurnCount } = input;
  const hasSnapshot = !!snapshot && snapshot.trees.length > 0;

  const systemPrompt = buildSystemPrompt(hasSnapshot);

  if (hasSnapshot) {
    // Incremental mode
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

    const userPrompt = `## Current Tree
${snapshotYaml}

${turnsSection}

Extract changes from the NEW turns only. Use set/add/drop/unset operations.`;

    return { systemPrompt, userPrompt };
  }

  // First extraction
  const userPrompt = `## Conversation
${formatTurns(turns)}

Extract ALL knowledge into a tree using add operations.
Capture EVERY fact, number, list item, recommendation, and detail — both from user and assistant.
Do NOT skip information because you're unsure about quoting. A short keyword source is enough.`;

  return { systemPrompt, userPrompt };
}
