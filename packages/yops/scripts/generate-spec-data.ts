/**
 * Generates src/specData.ts from yops.yaml.
 * Run before build: the generated file exports the YAML as a string constant.
 * This avoids runtime fs.readFileSync, making the bundle browser-safe.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const yamlContent = readFileSync(join(__dirname, '..', 'yops.yaml'), 'utf-8');
const output = `// AUTO-GENERATED — do not edit. Run: pnpm generate:spec\nexport const SPEC_YAML = ${JSON.stringify(yamlContent)};\n`;

writeFileSync(join(__dirname, '..', 'src', 'specData.ts'), output);
console.log('Generated src/specData.ts');
