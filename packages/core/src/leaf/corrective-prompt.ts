/**
 * Corrective Prompt Builder
 *
 * Builds feedback prompts from failed constraint assertions.
 * Used by the generation retry loop to give LLM specific guidance
 * on what needs to be fixed, instead of blind retry.
 */

import type { Assertion, Constraint } from '../types/v4';

export interface CorrectivePromptOptions {
  /** The output that failed validation */
  output: string;
  /** Failed assertions with details */
  failedAssertions: Assertion[];
  /** All constraints (for looking up constraint details) */
  constraints: Constraint[];
  /** Attempt number (2 = first retry, 3 = second retry) */
  attempt: number;
}

/**
 * Build a corrective feedback prompt from failed assertions.
 *
 * This prompt tells the LLM exactly what went wrong and how to fix it,
 * resulting in much higher retry success rates compared to blind retry.
 *
 * @returns A feedback message to append to the conversation
 */
export function buildCorrectivePrompt(options: CorrectivePromptOptions): string {
  const { output, failedAssertions, constraints, attempt } = options;

  // Build a lookup map for constraint details
  const constraintMap = new Map<string, Constraint>();
  for (const c of constraints) {
    constraintMap.set(c.id, c);
  }

  // Build detailed failure report
  const failureLines: string[] = [];
  for (const assertion of failedAssertions) {
    const constraint = constraintMap.get(assertion.constraint_id);
    if (!constraint) {
      failureLines.push(`- ${assertion.details}`);
      continue;
    }

    const typeLabel = constraint.type === 'require' ? 'REQUIRE' : 'EXCLUDE';
    const modeLabel = constraint.match_mode === 'semantic' ? 'semantic' : 'exact';

    if (constraint.type === 'require') {
      failureLines.push(
        `- ${typeLabel} (${modeLabel}) "${constraint.value}": ${assertion.details}`
      );
    } else {
      failureLines.push(
        `- ${typeLabel} (${modeLabel}) "${constraint.value}": ${assertion.details}${constraint.reason ? ` (reason: ${constraint.reason})` : ''}`
      );
    }
  }

  const urgency =
    attempt >= 3
      ? 'This is your FINAL attempt. You MUST satisfy ALL constraints.'
      : 'Please carefully address each failed constraint.';

  return `Your output did not satisfy ${failedAssertions.length} constraint(s). ${urgency}

Failed constraints:
${failureLines.join('\n')}

Your previous output was:
---
${output.length > 2000 ? `${output.slice(0, 2000)}... (truncated)` : output}
---

Please regenerate the content, ensuring ALL constraints are satisfied. Keep the overall quality and style, but fix the specific issues listed above.`;
}
