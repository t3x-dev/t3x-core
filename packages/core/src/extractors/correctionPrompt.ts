/**
 * Correction Prompt Builder
 *
 * Builds a targeted LLM prompt to fix specific YOps that failed gate validation.
 * Only sends the failed operations + error reasons — not the entire extraction.
 *
 * Claude Code parallel: when a tool call fails validation, the error is returned
 * to the LLM as a tool_result with is_error=true. The LLM sees the specific error
 * and self-corrects. We do the same, but in batch (one correction round for all
 * failed YOps).
 */

import type { GateViolation } from '../ops/gates/types';
import type { YOp } from '../yops/types';

export interface CorrectionInput {
  /** The YOps that failed validation */
  rejectedYOps: Array<{ index: number; yop: YOp; violations: GateViolation[] }>;
  /** Turn contents for reference */
  turns: Array<{ role: string; content: string }>;
  /** Optional one-line style hint so the LLM retains extraction style during correction */
  styleSummary?: string;
}

export interface CorrectionPromptResult {
  systemPrompt: string;
  userPrompt: string;
}

function formatYOp(yop: YOp): string {
  // Serialize the YOp back to YAML-like format for the LLM
  const opType = Object.keys(yop)[0];
  const opData = (yop as Record<string, unknown>)[opType!];
  return `- ${opType}:\n${Object.entries(opData as Record<string, unknown>)
    .map(([k, v]) => `      ${k}: ${typeof v === 'string' ? `"${v}"` : JSON.stringify(v)}`)
    .join('\n')}`;
}

function formatViolations(violations: GateViolation[]): string {
  return violations.map((v) => `  - [${v.gate}] ${v.message}`).join('\n');
}

/**
 * Build a correction prompt for the LLM to fix rejected YOps.
 *
 * The prompt is minimal: only the failed operations, their errors,
 * and the relevant turn contents. This keeps token consumption low
 * (~200-500 tokens vs ~2000 for a full re-extraction).
 */
export function buildCorrectionPrompt(input: CorrectionInput): CorrectionPromptResult {
  const systemPrompt = `You are a knowledge extraction correction engine.
Some YOps operations failed validation. Fix ONLY the listed operations.

Rules:
- Output ONLY valid YAML starting with "yops:"
- Fix the specific errors mentioned
- Keep the same intent — don't change what the operation is trying to do
- Every set/populate operation MUST have source (key phrase from conversation) and from (turn tag)
- unset and drop operations need ONLY their required fields (path for unset; path and optional reason for drop)
- Paths use / separator (not .), keys use snake_case
- If a source quote was not found, find the correct quote from the provided turns`;

  const rejectedSection = input.rejectedYOps
    .map((r) => {
      const yopStr = formatYOp(r.yop);
      const violStr = formatViolations(r.violations);
      return `### Operation #${r.index} (FAILED)\n${yopStr}\nErrors:\n${violStr}`;
    })
    .join('\n\n');

  // Only include turns that are referenced by the rejected YOps
  const referencedTurnIndices = new Set<number>();
  for (const r of input.rejectedYOps) {
    const opData = Object.values(r.yop)[0] as Record<string, unknown>;
    if (typeof opData?.from === 'string') {
      const match = opData.from.match(/^T(\d+)/);
      if (match) referencedTurnIndices.add(Number(match[1]) - 1);
    }
  }
  // Always include at least the last 2 turns for context
  const lastIdx = input.turns.length - 1;
  if (lastIdx >= 0) referencedTurnIndices.add(lastIdx);
  if (lastIdx >= 1) referencedTurnIndices.add(lastIdx - 1);

  const turnsSection = [...referencedTurnIndices]
    .sort((a, b) => a - b)
    .map((i) => `[T${i + 1}] [${input.turns[i].role}]: ${input.turns[i].content}`)
    .join('\n');

  const styleContext = input.styleSummary ? `\n## Active Style\n${input.styleSummary}\n` : '';

  const userPrompt = `## Failed Operations\n\n${rejectedSection}\n\n## Referenced Turns\n${turnsSection}\n${styleContext}\nFix ONLY the failed operations above. Output corrected versions as YAML.`;

  return { systemPrompt, userPrompt };
}
