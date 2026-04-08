#!/usr/bin/env node
/**
 * Compare extraction quality: OLD prompt (flat facts) vs NEW prompt (structure-aware).
 *
 * Runs the same multi-turn conversation through both prompt variants using a real LLM,
 * then prints both YAML trees side-by-side for human review.
 *
 * Usage:
 *   node scripts/compare-extraction-quality.mjs
 *
 * Required env:
 *   ANTHROPIC_API_KEY
 *
 * Optional env:
 *   T3X_DEBUG_MODEL  Anthropic model (default: claude-sonnet-4-20250514)
 *
 * Note: Run `pnpm build:core` first if core source has changed.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// ── Load .env ──
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
      process.env[key] = process.env[key] || val;
    }
  }
}
loadEnv();

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY not set');
  process.exit(1);
}

// ── Import core ──
const corePath = path.resolve(import.meta.dirname, '../packages/core/dist/index.js');
const {
  buildYOpsPrompt,
  createClaudeProvider,
  parseYOpsOutput,
} = await import(pathToFileURL(corePath).href);

const MODEL = process.env.T3X_DEBUG_MODEL || 'claude-sonnet-4-20250514';
const provider = createClaudeProvider({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: MODEL,
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST CONVERSATIONS — reasoning-heavy content that exposes the structure gap
// ══════════════════════════════════════════════════════════════════════════════

const CONVERSATIONS = [
  {
    name: 'Troubleshooting: Next.js deployment failing',
    turns: [
      {
        role: 'user',
        content: 'My Next.js app builds fine locally but fails on Vercel with "Module not found: Can\'t resolve \'./components/Dashboard\'" — what could be wrong?',
        turn_hash: 'sha256:aaa00001',
      },
      {
        role: 'assistant',
        content: `This is almost certainly a case-sensitivity issue. Here's why and how to fix it:

**Root Cause**: macOS and Windows have case-insensitive file systems, but Linux (which Vercel uses) is case-sensitive. So if your file is named \`dashboard.tsx\` but you import it as \`./components/Dashboard\`, it works locally but fails in production.

**Diagnosis Steps**:
1. Check the actual filename on disk — run \`ls -la src/components/\` and look for the exact casing
2. Compare it against your import statement in the file that's failing
3. Also check if you have any barrel exports (index.ts) that re-export with wrong casing

**Fix**:
1. Rename the file to match the import exactly: \`Dashboard.tsx\` (capital D)
2. Or update all imports to match the actual filename
3. Important: \`git mv\` won't detect case-only renames by default — use \`git mv dashboard.tsx temp.tsx && git mv temp.tsx Dashboard.tsx\`

**Prevention**:
- Add \`"forceConsistentCasingInFileNames": true\` to your tsconfig.json — TypeScript will catch these at compile time
- Consider using a lint rule like eslint-plugin-import/no-unresolved

The key insight is that this is NOT a Next.js bug or a Vercel issue — it's a fundamental difference between your local OS and the deployment OS.`,
        turn_hash: 'sha256:aaa00002',
      },
      {
        role: 'user',
        content: 'Oh I see! I checked and the file is actually `dashboard.tsx` but I import `Dashboard`. But wait, I also have another issue — some of my API routes return 404 in production but work locally. Could that be related?',
        turn_hash: 'sha256:aaa00003',
      },
      {
        role: 'assistant',
        content: `Good question — it could be related (same case-sensitivity issue) but there's another common cause for API route 404s specifically:

**Most Likely Cause**: Your API route files might be in the wrong directory structure. In Next.js App Router, API routes must be in \`app/api/\` with a \`route.ts\` file (not \`route.js\` or \`api.ts\`).

**Check these in order**:
1. **Case-sensitivity again**: If your route is at \`app/api/Users/route.ts\` but you call \`/api/users\`, it'll 404 on Linux
2. **File naming**: The file MUST be named \`route.ts\` (or \`route.js\`), not \`index.ts\` or anything else
3. **HTTP method exports**: Make sure you're exporting named functions like \`GET\`, \`POST\` (capitalized) — not \`get\` or \`handler\`
4. **Middleware interference**: Check if you have a \`middleware.ts\` that's matching API routes and redirecting them

**Quick diagnostic**:
\`\`\`bash
# List all route files to check structure
find app/api -name "route.*" -type f
# Check what methods each exports
grep -r "export.*function\|export.*const" app/api/*/route.*
\`\`\`

If the case-sensitivity fix resolves the component issue but not the API routes, the problem is likely #2 or #3.`,
        turn_hash: 'sha256:aaa00004',
      },
      {
        role: 'user',
        content: 'Found it! The API routes had `index.ts` instead of `route.ts`. I renamed them and now both issues are fixed. One more thing — should I set up CI to catch these before deploying?',
        turn_hash: 'sha256:aaa00005',
      },
      {
        role: 'assistant',
        content: `Absolutely. Here's a minimal CI setup that catches both issues:

**GitHub Actions workflow** (add to \`.github/workflows/ci.yml\`):
1. **Build step**: Run \`next build\` on Linux (ubuntu-latest) — catches case-sensitivity issues because the CI environment matches production
2. **Lint step**: Run \`next lint\` with strict mode — catches import issues
3. **Type check**: Run \`tsc --noEmit\` with \`forceConsistentCasingInFileNames: true\` — catches casing at type level

**The critical insight**: The build step alone is sufficient to catch BOTH of your issues — if it builds on Linux, it'll deploy on Linux. The lint and type check steps are extra safety nets.

**Recommended tsconfig additions**:
\`\`\`json
{
  "compilerOptions": {
    "forceConsistentCasingInFileNames": true,
    "strict": true
  }
}
\`\`\`

**Cost**: ~2 minutes per push. Worth it — these "works locally, breaks in prod" bugs are the most frustrating to debug because they only surface after deployment.`,
        turn_hash: 'sha256:aaa00006',
      },
    ],
  },
  {
    name: 'Architecture decision: caching strategy',
    turns: [
      {
        role: 'user',
        content: 'We have a Next.js app with a PostgreSQL database. Our product pages load slowly because each page makes 5-6 database queries. What caching strategy should we use?',
        turn_hash: 'sha256:bbb00001',
      },
      {
        role: 'assistant',
        content: `There are three main approaches, each with different trade-offs. The right choice depends on your data freshness requirements:

**Option 1: Application-level cache (Redis/Upstash)**
- How it works: Cache query results in Redis with TTL. Check cache before hitting DB.
- Pros: Fine-grained control over invalidation, works across serverless instances, predictable behavior
- Cons: Another service to manage, cache invalidation complexity, cold start penalty on first request
- Best for: Data that changes on known events (user edits, admin updates) — you can invalidate precisely
- Typical latency improvement: 5-6 queries × 50ms → 1 cache hit × 5ms = ~10x faster

**Option 2: Next.js ISR (Incremental Static Regeneration)**
- How it works: Pre-render pages at build time, revalidate on a timer (e.g., every 60 seconds)
- Pros: Zero application code changes, CDN-cached globally, handles traffic spikes effortlessly
- Cons: Stale data for up to revalidation period, doesn't work for personalized content, revalidation is per-page not per-query
- Best for: Product catalog pages that are the same for all users and update infrequently
- Typical latency improvement: 0ms (served from CDN edge)

**Option 3: Database-level optimization (materialized views + connection pooling)**
- How it works: Create materialized views for complex queries, use PgBouncer for connection pooling
- Pros: No additional infrastructure, data is always fresh when queried, simplest mental model
- Cons: Materialized view refresh is expensive, doesn't help with simple queries, limited by DB proximity
- Best for: When the problem is query complexity rather than query volume

**My recommendation**: Start with Option 2 (ISR) for your product pages since they're likely the same for all users. If you have personalized content on those pages, split the page: static shell via ISR + dynamic parts via client-side fetch with Redis cache (Option 1) behind an API route.

The key decision point is: does your product page content change per-user? If no → ISR. If yes → Redis for the personalized parts.`,
        turn_hash: 'sha256:bbb00002',
      },
      {
        role: 'user',
        content: 'Good breakdown. Our product pages are public (same for all users) but we show real-time stock counts that update frequently. So it\'s a mix. Let\'s go with your recommendation — ISR for the shell + Redis for stock.',
        turn_hash: 'sha256:bbb00003',
      },
      {
        role: 'assistant',
        content: `Perfect choice. Here's how to implement this hybrid approach:

**ISR for page shell** (product info, images, description):
- Set \`revalidate = 3600\` (1 hour) in the page's fetch calls or use \`export const revalidate = 3600\`
- Use \`generateStaticParams\` to pre-render your top ~100 products at build time
- The rest will be rendered on-demand and cached after first visit

**Redis for stock counts** (real-time dynamic data):
- Create an API route \`/api/products/[id]/stock\` that checks Redis first, falls back to DB
- TTL of 30 seconds — stock doesn't need to be real-time to the second, just "recent"
- Client-side: use \`useSWR\` with 30s polling to keep the count fresh on-screen
- Invalidation: when an order is placed, delete the Redis key — next request gets fresh data from DB

**Implementation order**:
1. First: Add ISR to product pages (biggest impact, easiest change — just add revalidate)
2. Second: Set up Redis/Upstash and create the stock API route
3. Third: Replace the inline stock query with the client-side useSWR call
4. Last: Add cache invalidation on order events

**Expected result**: Product pages load in <100ms (CDN edge), stock count loads in <50ms (Redis), total perceived load time drops from ~1.5s to ~150ms.`,
        turn_hash: 'sha256:bbb00004',
      },
    ],
  },
];

// ══════════════════════════════════════════════════════════════════════════════
// OLD PROMPT — snapshot of the original system prompt (before structure changes)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Build the OLD prompt variant (no structure priority).
 * This is a copy of the original buildYOpsPrompt logic BEFORE the structure changes.
 */
function buildOldPrompt(turns) {
  const formattedTurns = turns
    .map((t, i) => {
      const tag = t.turn_hash ? `[T${i + 1}:${t.turn_hash.slice(0, 8)}]` : `[T${i + 1}]`;
      return `${tag} [${t.role}]: ${t.content}`;
    })
    .join('\n');

  const systemPrompt = `You are a knowledge extraction engine. Your job is simple:
Read the conversation and extract ALL facts, details, and information into a structured YAML tree.

## Three-Tier Extraction Rule

| Tier | Description | Action | Confidence |
|------|-------------|--------|------------|
| TIER 1 | User explicitly stated (preferences, facts, decisions) | Always extract | 0.9-1.0 |
| TIER 2 | User confirmed or agreed with AI suggestion | Extract it | 0.8-0.9 |
| TIER 3 | Assistant's direct answer to a user question — factual content the user requested | Extract it | 0.7-0.85 |
| TIER 4 | AI-provided tangential information (unsolicited tips, suggestions, opinions) | Extract it | 0.4-0.5 |

Key distinction: When the user asks a question and the assistant answers, the answer content is TIER 3 (0.7-0.85) — this IS the knowledge the user came for. Only unsolicited AI additions are TIER 4 (0.4-0.5). Explicit rejection = never extract.

Do NOT extract: greetings, filler ("sure!", "let me help"), or meta-commentary

## Output format: YAML tree + JSON metadata

Output a single YAML tree (one root node), then a \`---\` separator on its own line,
then a JSON block containing \`slot_quotes\` and \`source_map\`.

### Structure
- ONE root node named after the conversation topic (snake_case)
- Children for subtopics — nest related facts under nested objects
- Leaf values: clean data (numbers, short labels, booleans, arrays) — NOT full sentences
- Object values become CHILD NODES, scalars/arrays become SLOT VALUES on the parent

## Coverage: All Substantive Content (~70–80%)
- Surface EVERY fact, preference, recommendation, and decision from both user and assistant
- If someone said it and it's substantive, it belongs in the tree — nothing important is lost
- Include the LLM's recommendations, suggestions, and answers alongside user statements
- Let tree depth follow the content naturally: group related facts under subtopics
- Skip only redundant restatements and conversational filler

### slot_quotes (provenance)
After the YAML tree, output a \`slot_quotes\` mapping inside the JSON block.
Each slot SHOULD have a corresponding entry quoting the conversation.
- Use REPRESENTATIVE quotes: short phrases that capture the fact with enough context to scan
- slot_quotes keys use dot-path notation (e.g., \`dining.cuisine\`)
- Root-level slots have no prefix (e.g., \`destination\`)

### source_map (turn tracking)
For each tree node, map its key to the turn tag (T1, T2, ...) where the topic was first introduced.

### Example

\`\`\`
giant_panda:
  classification: bear
  scientific_name: Ailuropoda melanoleuca
  diet:
    primary: bamboo
    percentage: 99
  habitat:
    region: central China
    type: temperate forests
---
{
  "slot_quotes": {
    "classification": "Giant pandas belong to the bear family",
    "scientific_name": "Ailuropoda melanoleuca",
    "diet.primary": "bamboo makes up about 99%",
    "diet.percentage": "about 99% of a giant panda's diet",
    "habitat.region": "native to central China",
    "habitat.type": "temperate forests"
  },
  "source_map": {
    "giant_panda": "T1",
    "diet": "T2",
    "habitat": "T2"
  }
}
\`\`\`

### Extraction Priority
- Extract MORE rather than less — code will clean up duplicates
- Do NOT skip a fact because you can't find a perfect quote — use the closest matching phrase
- Every list item, number, recommendation, and detail is worth capturing
- A short keyword quote is better than skipping the data entirely

### Content Blobs (code, plots, tables)
When the conversation contains code blocks, charts, or structured data,
store them as blob objects with a \`_type\` field — these stay as SLOT VALUES (not children):
- Code: \`{ _type: "code", language: "python", content: "def foo(): ..." }\`
- Plot: \`{ _type: "plot", format: "bar", description: "...", data: { labels: [...], values: [...] } }\`
- Table: \`{ _type: "table", headers: [...], rows: [[...], ...] }\`
Blobs preserve complete meaning blocks — do NOT decompose code into separate slots.

### Rules
- Output ONLY: the YAML tree, then \`---\` on its own line, then the JSON metadata block
- No markdown fences, no explanatory text before, between, or after
- Keys use snake_case, paths use \`/\` separator`;

  const userPrompt = `## Conversation
${formattedTurns}

Extract ALL knowledge into a YAML tree, then \`---\`, then the JSON metadata block.
Capture EVERY fact, number, list item, recommendation, and detail — both from user and assistant.
Do NOT skip information because you're unsure about quoting. A short keyword quote is enough.`;

  return { systemPrompt, userPrompt };
}

// ══════════════════════════════════════════════════════════════════════════════
// Runner
// ══════════════════════════════════════════════════════════════════════════════

async function runExtraction(label, systemPrompt, userPrompt) {
  const combinedPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`  ${label}  (prompt length: ${combinedPrompt.length} chars)`);
  console.log('═'.repeat(80));

  const t0 = Date.now();
  const result = await provider.generate(combinedPrompt, {
    temperature: 0.1,
    maxTokens: 8192,
  });
  const dt = Date.now() - t0;

  console.log(`  elapsed: ${dt}ms | tokens: in=${result.usage.inputTokens} out=${result.usage.outputTokens}`);
  console.log(`${'─'.repeat(80)}`);
  console.log(result.text);
  console.log(`${'─'.repeat(80)}`);

  // Parse to verify it's valid
  const parsed = parseYOpsOutput(result.text);
  if (!parsed.ok) {
    console.log(`  ⚠ PARSE FAILED: ${parsed.error}`);
  } else {
    console.log(`  ✓ Parsed OK: format=${parsed.format}, yops=${parsed.yops.length}`);
  }

  return { raw: result.text, parsed, elapsed: dt, usage: result.usage };
}

// ══════════════════════════════════════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════════════════════════════════════

console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
console.log('║  EXTRACTION QUALITY COMPARISON: OLD (flat facts) vs NEW (structure-aware)   ║');
console.log(`║  Model: ${MODEL.padEnd(67)}║`);
console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

for (const conv of CONVERSATIONS) {
  console.log(`\n\n${'█'.repeat(80)}`);
  console.log(`  CONVERSATION: ${conv.name}`);
  console.log(`  Turns: ${conv.turns.length}`);
  console.log('█'.repeat(80));

  const input = { turns: conv.turns, snapshot: undefined, processedTurnCount: 0 };

  // OLD prompt (hardcoded copy of original)
  const oldPrompt = buildOldPrompt(conv.turns);
  const oldResult = await runExtraction(
    '🔴 OLD PROMPT (flat facts)',
    oldPrompt.systemPrompt,
    oldPrompt.userPrompt,
  );

  // NEW prompt (from current buildYOpsPrompt with structure changes)
  const newPrompt = buildYOpsPrompt(input);
  const newResult = await runExtraction(
    '🟢 NEW PROMPT (structure-aware)',
    newPrompt.systemPrompt,
    newPrompt.userPrompt,
  );

  // Summary comparison
  console.log(`\n${'═'.repeat(80)}`);
  console.log('  COMPARISON SUMMARY');
  console.log('═'.repeat(80));

  // Count tree depth
  function measureYaml(text) {
    const yamlPart = text.split('---')[0];
    const lines = yamlPart.split('\n').filter(l => l.trim());
    const maxIndent = Math.max(...lines.map(l => l.search(/\S/)));
    const levels = maxIndent / 2;
    const nodeCount = lines.filter(l => l.trim().endsWith(':')).length;
    const slotCount = lines.filter(l => l.includes(':') && !l.trim().endsWith(':')).length;
    return { lines: lines.length, levels, nodeCount, slotCount };
  }

  const oldMetrics = measureYaml(oldResult.raw);
  const newMetrics = measureYaml(newResult.raw);

  console.log(`                     OLD          NEW`);
  console.log(`  YAML lines:     ${String(oldMetrics.lines).padStart(5)}        ${String(newMetrics.lines).padStart(5)}`);
  console.log(`  Max depth:      ${String(oldMetrics.levels).padStart(5)}        ${String(newMetrics.levels).padStart(5)}`);
  console.log(`  Nodes:          ${String(oldMetrics.nodeCount).padStart(5)}        ${String(newMetrics.nodeCount).padStart(5)}`);
  console.log(`  Slots:          ${String(oldMetrics.slotCount).padStart(5)}        ${String(newMetrics.slotCount).padStart(5)}`);
  console.log(`  Latency (ms):   ${String(oldResult.elapsed).padStart(5)}        ${String(newResult.elapsed).padStart(5)}`);
  console.log(`  Tokens (out):   ${String(oldResult.usage.outputTokens).padStart(5)}        ${String(newResult.usage.outputTokens).padStart(5)}`);
}

console.log(`\n\n${'═'.repeat(80)}`);
console.log('  DONE — Review the YAML trees above. Look for:');
console.log('  • Does NEW group steps/logic under meaningful parent nodes?');
console.log('  • Does NEW distinguish diagnosis vs solution vs prevention?');
console.log('  • Does NEW preserve cause-effect chains (not just flat slots)?');
console.log('  • Does OLD flatten everything into peer-level key-value pairs?');
console.log('═'.repeat(80));
