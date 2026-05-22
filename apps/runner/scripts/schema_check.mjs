import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import yaml from 'js-yaml';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const runnerRoot = path.resolve(scriptDir, '..');
const schemaPath = path.join(runnerRoot, 'resources/json-schemas/eval-rules.schema.json');
const rulesDir = path.join(runnerRoot, 'resources/rules');

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const validate = ajv.compile(schema);
const files = fs
  .readdirSync(rulesDir)
  .filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'))
  .sort();

let failures = 0;

for (const file of files) {
  const filePath = path.join(rulesDir, file);
  const document = yaml.load(fs.readFileSync(filePath, 'utf8'));

  if (validate(document)) {
    continue;
  }

  failures += 1;
  console.error(`[schema:check] ${file} failed validation`);
  for (const error of validate.errors ?? []) {
    const location = error.instancePath || '/';
    console.error(`  ${location} ${error.message}`);
  }
}

if (failures > 0) {
  process.exitCode = 1;
} else {
  console.log(`[schema:check] Validated ${files.length} rule files`);
}
