import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const runnerRoot = path.resolve(scriptDir, '..');
const schemaPath = path.join(runnerRoot, 'resources', 'json-schemas', 'suite.schema.json');
const suitesRoot = path.join(runnerRoot, 'resources', 'suites');

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
});
addFormats(ajv);

const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
const validate = ajv.compile(schema);

async function listJsonFiles(rootDir) {
  const results = [];

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
        results.push(fullPath);
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

let files;
try {
  files = await listJsonFiles(suitesRoot);
} catch (err) {
  console.error(`[schema:check] Failed to read suites directory: ${suitesRoot}`);
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

for (const file of files) {
  let data;
  try {
    data = JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    failed = true;
    console.error(`[schema:check] ${path.relative(runnerRoot, file)}: invalid JSON`);
    console.error(err instanceof Error ? err.message : String(err));
    continue;
  }

  const ok = validate(data);
  if (!ok) {
    failed = true;
    console.error(`[schema:check] ${path.relative(runnerRoot, file)}: schema validation failed`);
    console.error(formatAjvErrors(validate.errors));
  }
}

if (failed) {
  process.exit(1);
}

console.log(`[schema:check] OK (${files.length} file(s))`);
