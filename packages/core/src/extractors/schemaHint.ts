/**
 * Schema hint rendering — shared between buildExtractionPrompt and buildYOpsPrompt.
 *
 * Produces a human-readable contract block that instructs the LLM to produce
 * YOps conforming to a given @t3x-dev/yschema Schema.
 */

import type { Schema } from '@t3x-dev/yschema';

export function renderSchemaHint(schema: Schema): string {
  const strict = schema.strict === true;
  const lines: string[] = [
    '',
    strict ? 'SCHEMA (STRICT — unknown keys are errors):' : 'TARGET SHAPE:',
  ];
  lines.push(`Top-level keys allowed: ${Object.keys(schema.nodes).join(', ')}`);
  for (const [nodeName, nodeDef] of Object.entries(schema.nodes)) {
    lines.push(`  ${nodeName}${nodeDef.required ? ' (required)' : ''}:`);
    const slots = nodeDef.each_child?.slots ?? nodeDef.slots;
    if (slots) {
      if (nodeDef.each_child?.slots) lines.push(`    <child>:`);
      for (const [slot, def] of Object.entries(slots)) {
        lines.push(`      ${slot}: ${describeSlot(def)}`);
      }
    }
  }
  if (schema.rules?.length) {
    lines.push('RULES:');
    for (const r of schema.rules) {
      lines.push(`  - ${r.message ?? r.id}`);
    }
  }
  if (schema.name === 'docker-compose') {
    lines.push(
      'Note: when using postgres/mysql/mariadb, include the password env var (POSTGRES_PASSWORD, etc.).'
    );
  }
  lines.push('Produce YOps that build a tree conforming to this shape.');
  return lines.join('\n');
}

function describeSlot(def: unknown): string {
  if (Array.isArray(def)) return `one of ${JSON.stringify(def)}`;
  if (typeof def === 'string') return def;
  if (def && typeof def === 'object') {
    const d = def as Record<string, unknown>;
    const parts: string[] = [];
    if (d.type) parts.push(String(d.type));
    if (d.required) parts.push('required');
    if (d.enum) parts.push(`one of ${JSON.stringify(d.enum)}`);
    if (d.pattern) parts.push(`pattern ${d.pattern}`);
    if (d.item_pattern) parts.push(`each item ${d.item_pattern}`);
    return parts.length > 0 ? parts.join(' ') : 'scalar';
  }
  return 'scalar';
}
