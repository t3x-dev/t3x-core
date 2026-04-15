import { parseSchema } from '@t3x-dev/yschema';
import { describe, expect, it } from 'vitest';
import type { ExtractionInput } from '../extractionPrompt';
import { buildYOpsPrompt } from '../yopsPrompt';

const composeSchema = parseSchema(`
name: docker-compose
strict: true
nodes:
  services:
    required: true
    children: any
    each_child:
      slots:
        image:
          type: scalar
          required: true
          pattern: "^[^:\\\\s]+:[^:\\\\s]+$"
        restart:
          enum: [no, always, on-failure, unless-stopped]
`);

const baseInput: ExtractionInput = {
  turns: [{ role: 'user' as const, content: 'nginx:latest' }],
};

function text(prompt: unknown): string {
  if (typeof prompt === 'string') return prompt;
  return JSON.stringify(prompt);
}

describe('buildYOpsPrompt with targetSchema', () => {
  it('injects a contract block when targetSchema is present', () => {
    const prompt = buildYOpsPrompt({ ...baseInput, targetSchema: composeSchema });
    const t = text(prompt);
    expect(t).toContain('SCHEMA (STRICT');
    expect(t).toContain('services');
    expect(t).toContain('image');
    expect(t).toMatch(/pattern/i);
  });

  it('omits the contract block when targetSchema is absent', () => {
    const prompt = buildYOpsPrompt({ ...baseInput });
    const t = text(prompt);
    expect(t).not.toContain('SCHEMA (STRICT');
    expect(t).not.toContain('TARGET SHAPE');
  });

  it('includes domain-specific soft guidance for docker-compose', () => {
    const prompt = buildYOpsPrompt({ ...baseInput, targetSchema: composeSchema });
    const t = text(prompt);
    expect(t).toMatch(/postgres.*password|mysql.*password/i);
  });
});
