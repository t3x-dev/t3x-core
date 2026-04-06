/**
 * Generates dist/yops.schema.json from the Zod YOpSchema.
 * Run after tsup compiles the package (schema.ts must be built first).
 * Uses Zod v4's built-in z.toJSONSchema() — no extra dependencies needed.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { YOpSchema } from '../src/schema';

const schema = z.toJSONSchema(z.array(YOpSchema), {
  target: 'draft-2020-12',
  $schema: true,
});

// Annotate with title and description for discoverability
const annotated = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'YOps',
  description:
    'Declarative YAML Operations — an array of atomic YOps operations. ' +
    'Each element is exactly one of the 18 supported op types.',
  ...schema,
};

const distDir = join(__dirname, '..', 'dist');
mkdirSync(distDir, { recursive: true });

const outPath = join(distDir, 'yops.schema.json');
writeFileSync(outPath, JSON.stringify(annotated, null, 2) + '\n');
console.log(`Generated dist/yops.schema.json`);
