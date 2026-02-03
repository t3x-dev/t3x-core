import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import yaml from 'js-yaml';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const runnerRoot = path.resolve(scriptDir, '..');

const evalRulesSchemaPath = path.join(
  runnerRoot,
  'resources',
  'json-schemas',
  'eval-rules.schema.json'
);
const rulesRoot = path.join(runnerRoot, 'resources', 'rules');

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
});
addFormats(ajv);

async function listYamlFiles(rootDir) {
  const results = [];

  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ext === '.yaml' || ext === '.yml') {
          results.push(fullPath);
        }
      }
    }
  }

  await walk(rootDir);
  results.sort((a, b) => a.localeCompare(b));
  return results;
}

function formatAjvErrors(errors) {
  if (!errors || errors.length === 0) return 'Unknown schema error';
  return errors
    .map((e) => {
      const at = e.instancePath && e.instancePath.length > 0 ? e.instancePath : '/';
      const msg = e.message ?? 'invalid';
      return `- ${at} ${msg} (${e.schemaPath})`;
    })
    .join('\n');
}

let failed = false;
let validCount = 0;

const schema = JSON.parse(await readFile(evalRulesSchemaPath, 'utf8'));
const validate = ajv.compile(schema);

const files = await listYamlFiles(rulesRoot);

if (files.length === 0) {
  console.log('[schema:check] No YAML files found in rules/');
  process.exit(0);
}

for (const file of files) {
  let data;
  try {
    const content = await readFile(file, 'utf8');
    data = yaml.load(content);
  } catch (err) {
    failed = true;
    console.error(`[schema:check] ${path.relative(runnerRoot, file)}: parse error`);
    console.error(err instanceof Error ? err.message : String(err));
    continue;
  }

  const ok = validate(data);
  if (!ok) {
    failed = true;
    console.error(`[schema:check] ${path.relative(runnerRoot, file)}: schema validation failed`);
    console.error(formatAjvErrors(validate.errors));
  } else {
    validCount++;
  }
}

if (failed) {
  process.exit(1);
}

console.log(`[schema:check] OK (${validCount} file(s))`);
