#!/usr/bin/env node
/**
 * Debug script: capture raw LLM output for the extraction prompt.
 *
 * Bypasses the HTTP API and the extraction-pipeline. Builds the same prompt
 * the YamlExtractionStrategy would build, calls the Anthropic provider
 * directly, prints the raw response. Then runs the full Extractor.extract()
 * to show the structured result.
 *
 * Usage:
 *   node scripts/debug-extract-llm.mjs                            # default sample
 *   node scripts/debug-extract-llm.mjs "some other text"          # CLI arg
 *   T3X_DEBUG_TEXT="$(cat doc.md)" node scripts/debug-extract-llm.mjs   # env var
 *
 * Required env:
 *   ANTHROPIC_API_KEY
 *
 * Optional env:
 *   T3X_DEBUG_TEXT   Input text to extract (overrides CLI arg and default)
 *   T3X_DEBUG_MODEL  Anthropic model (default: claude-sonnet-4-20250514)
 *
 * Note: this script imports directly from packages/core/dist/index.js because
 *       scripts/ is not a workspace package. After changing any core source,
 *       run `pnpm build:core` first — otherwise you'll be debugging stale code.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Direct import from built core (scripts/ is not a workspace package, so
// @t3x-dev/core won't resolve normally — go straight to the dist file).
const corePath = path.resolve(
  import.meta.dirname,
  '../packages/core/dist/index.js'
);
const {
  buildYOpsPrompt,
  createClaudeProvider,
  Extractor,
  parseYOpsOutput,
} = await import(pathToFileURL(corePath).href);

// ── Load .env / .env.local from repo root ──
function loadEnv() {
  const root = path.resolve(import.meta.dirname, '..');
  for (const name of ['.env.local', '.env']) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const i = trimmed.indexOf('=');
      if (i === -1) continue;
      const key = trimmed.slice(0, i).trim();
      let val = trimmed.slice(i + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}
loadEnv();

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY not set');
  process.exit(1);
}

// ── Test text ── (T3X_DEBUG_TEXT env var or first CLI arg overrides the default,
//    which mirrors scripts/full-pipeline-curl-test.sh step 5 for a known-good sample)
const TEXT =
  process.env.T3X_DEBUG_TEXT ||
  process.argv[2] ||
  'Green Tea Mode is an opt-in focus feature. Users can brew an ambient playlist by selecting one of three soundscapes: forest rain, distant ocean, or hilltop wind. The brew lasts exactly 25 minutes — the length of a pomodoro — and ends with a single chime. While brewing, all desktop notifications are muted. After the chime, a 5-minute cooldown begins; the user is gently prompted to stretch.';

// Build the prompt the strategy would build
const turns = [{ role: 'user', content: TEXT, turn_hash: 'sha256:fake000000000000' }];
const input = { turns, snapshot: undefined, processedTurnCount: 0 };
const { systemPrompt, userPrompt } = buildYOpsPrompt(input);
const combinedPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

console.log('═'.repeat(80));
console.log('PROMPT (system + user, length=' + combinedPrompt.length + ')');
console.log('═'.repeat(80));
console.log(combinedPrompt);

// ── Create the Claude provider directly ──
const provider = createClaudeProvider({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: process.env.T3X_DEBUG_MODEL || 'claude-sonnet-4-20250514',
});

console.log('\n' + '═'.repeat(80));
console.log('Calling provider.generate(...)  model=' + (process.env.T3X_DEBUG_MODEL || 'claude-sonnet-4-20250514'));
console.log('═'.repeat(80));

const t0 = Date.now();
const result = await provider.generate(combinedPrompt, {
  temperature: 0.1,
  maxTokens: 8192,
});
const dt = Date.now() - t0;

console.log(`elapsed: ${dt}ms`);
console.log(`usage: input=${result.usage.inputTokens} output=${result.usage.outputTokens}`);
console.log('\n' + '═'.repeat(80));
console.log('RAW RESPONSE (length=' + result.text.length + ')');
console.log('═'.repeat(80));
console.log(result.text);

// Try to parse it the way yopsParser does
console.log('\n' + '═'.repeat(80));
console.log('parseYOpsOutput()');
console.log('═'.repeat(80));
const parsed = parseYOpsOutput(result.text);
console.log(JSON.stringify(parsed, null, 2));

// Run the full Extractor for comparison
console.log('\n' + '═'.repeat(80));
console.log('Full Extractor.extract()');
console.log('═'.repeat(80));
const extractor = new Extractor(provider);
const extractResult = await extractor.extract({ turns, processedTurnCount: 0 });
console.log(
  JSON.stringify(
    {
      ok: extractResult.ok,
      error: extractResult.ok ? undefined : extractResult.error,
      yopsCount: extractResult.ok ? extractResult.yops.length : undefined,
      treesCount: extractResult.ok ? extractResult.snapshot.trees.length : undefined,
      usage: extractResult.usage,
      firstTreeKey: extractResult.ok ? extractResult.snapshot.trees[0]?.key : undefined,
    },
    null,
    2
  )
);
