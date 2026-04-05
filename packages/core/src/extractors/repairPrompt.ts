/**
 * Repair Prompt Builder
 *
 * Builds a targeted LLM prompt to fix YAML parse errors or YOps apply errors.
 * Same pattern as correctionPrompt.ts, but for earlier pipeline failures.
 *
 * Claude Code parallel: tool_result with is_error=true → LLM self-corrects.
 * We feed the specific error back to the LLM so it knows what went wrong.
 */

export interface RepairInput {
  /** Which failure type to repair */
  kind: 'yaml_parse' | 'yops_apply';
  /** The raw text the LLM produced */
  rawOutput: string;
  /** The specific error message (from js-yaml or applyYOps) */
  errorMessage: string;
  /** Conversation turns for context */
  turns: Array<{ role: string; content: string }>;
}

export interface RepairPromptResult {
  systemPrompt: string;
  userPrompt: string;
}

const YAML_PARSE_SYSTEM = `You are a YAML repair engine. Your previous output had a syntax error.
Fix the YAML syntax error and reoutput the corrected version.

Rules:
- Output ONLY valid YAML starting with "yops:" (for incremental operations) or a valid YAML tree (for first extraction)
- Fix ONLY the syntax error — do not change the content or meaning
- Paths use / separator, keys use snake_case
- Every set/populate operation MUST keep its source and from fields`;

const YOPS_APPLY_SYSTEM = `You are a YOps repair engine. Your operations failed when applied to the knowledge tree.
Fix the failing operation and reoutput ALL operations (not just the fixed one).

Rules:
- Output ONLY valid YAML starting with "yops:"
- Fix the operation that caused the error
- Common fixes: ensure parent node exists (add a define before populate/set), check path spelling, verify node was not already dropped
- Paths use / separator, keys use snake_case
- Every set/populate operation MUST keep its source and from fields
- Output ALL operations, not just the fixed one — the full list will be re-applied from scratch`;

/** Maximum number of turns to include in the repair prompt */
const MAX_CONTEXT_TURNS = 3;

export function buildRepairPrompt(input: RepairInput): RepairPromptResult {
  const { kind, rawOutput, errorMessage, turns } = input;

  const systemPrompt = kind === 'yaml_parse' ? YAML_PARSE_SYSTEM : YOPS_APPLY_SYSTEM;

  const contextTurns = turns.slice(-MAX_CONTEXT_TURNS);
  const turnsSection = contextTurns
    .map((t, i) => {
      const idx = turns.length - contextTurns.length + i;
      return `[T${idx + 1}] [${t.role}]: ${t.content}`;
    })
    .join('\n');

  const errorLabel = kind === 'yaml_parse' ? 'YAML Syntax Error' : 'Tree Application Error';

  const userPrompt = `## ${errorLabel}

${errorMessage}

## Your Previous Output

\`\`\`yaml
${rawOutput}
\`\`\`

## Conversation Context

${turnsSection}

Fix the error above and reoutput the corrected YAML.`;

  return { systemPrompt, userPrompt };
}
