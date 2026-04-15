import type { Violation } from '@t3x-dev/yschema';

export interface SchemaCorrectionInput {
  previousOutput: string;
  violations: Violation[];
}

export interface SchemaCorrectionPromptResult {
  systemPrompt: string;
  userPrompt: string;
}

export function buildSchemaCorrectionPrompt(
  input: SchemaCorrectionInput,
): SchemaCorrectionPromptResult | null {
  const errors = input.violations.filter((v) => v.severity === 'error');
  if (errors.length === 0) return null;

  const systemPrompt = `You are a knowledge extraction correction engine.
Your previous YOps output produced a tree that failed schema validation.
Fix ONLY the listed errors and re-emit a complete corrected YOps block.

Rules:
- Output ONLY valid YAML starting with "yops:"
- Do not re-introduce previous errors
- Keep the intent — fix the shape, not the subject matter
- Paths use / separator, keys use snake_case`;

  const errorLines = errors
    .map((v) => `  - [${v.code}] at ${v.path ?? '<root>'}: ${v.message}`)
    .join('\n');

  const userPrompt = `Previous output:
\`\`\`yaml
${input.previousOutput.trim()}
\`\`\`

Schema validation errors:
${errorLines}

Emit a corrected YOps block that resolves every error above.`;

  return { systemPrompt, userPrompt };
}
