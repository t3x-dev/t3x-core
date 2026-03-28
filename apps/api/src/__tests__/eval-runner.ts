#!/usr/bin/env npx tsx
/**
 * Extraction Quality Evaluation Runner
 *
 * Injects pre-written English conversations via storage functions,
 * calls real LLM extraction through the route handler,
 * and saves results to reviewable markdown files.
 *
 * Usage:
 *   cd apps/api
 *   PIPELINE_DEBUG=true npx tsx src/__tests__/eval-runner.ts
 *
 * Requires:
 *   - Embedded PostgreSQL (auto-started) or DATABASE_URL
 *   - ANTHROPIC_API_KEY (or another LLM provider key)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load root .env (eval-runner runs from apps/api, .env is at repo root)
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

import type { SemanticContent } from '@t3x-dev/core';
import { flattenTrees } from '@t3x-dev/core';
import { insertConversation, insertProject, insertTurn } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { closeDB, getDB } from '../lib/db';
// Import the actual route (uses real DB + real LLM via provider-registry)
import { treeExtractRoutes } from '../routes/tree-extract.openapi';

// ============================================================
// Output Directory
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RESULTS_DIR = path.resolve(__dirname, '../../test-results/eval');

// ============================================================
// Conversation Scenarios
// ============================================================

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

interface Scenario {
  id: number;
  name: string;
  description: string;
  /** What this scenario specifically tests */
  tests: string;
  turns: Turn[];
  /** If set, split extraction: extract after this many turns, then add rest and extract again */
  splitAt?: number;
}

const SCENARIOS: Scenario[] = [
  // ── Scenario 2: Info correction — Home kitchen remodel ──
  {
    id: 2,
    name: 'Info Correction — Home Kitchen Remodel',
    description:
      'User plans a kitchen remodel, changes budget ($15k → $25k), changes style (modern → farmhouse). Tests how incremental extraction handles value changes.',
    tests: 'Value corrections, overridden preferences, information superseding',
    turns: [
      {
        role: 'user',
        content:
          "I'm thinking about remodeling my kitchen. Budget is around $15,000 and I want a modern minimalist look — white cabinets, quartz countertops, maybe some under-cabinet lighting.",
      },
      {
        role: 'assistant',
        content:
          'A modern minimalist kitchen with a $15k budget is very doable. White shaker cabinets with quartz countertops are a popular combo. For under-cabinet lighting, LED strips are both affordable and energy-efficient. Would you like me to break down the estimated costs?',
      },
      {
        role: 'user',
        content:
          'Yes please. Oh, I should mention — the kitchen is about 120 square feet. And we need to keep the current layout because moving plumbing would be too expensive.',
      },
      {
        role: 'assistant',
        content:
          "Good call on keeping the layout — moving plumbing can easily add $3-5k. For 120 sq ft with your specs: cabinets (~$4k), quartz counters (~$3.5k), lighting (~$500), backsplash (~$1.5k), flooring (~$2k), hardware and misc (~$1.5k). That's about $13k, leaving a small buffer.",
      },
      {
        role: 'user',
        content:
          "Actually, I've been looking at Pinterest and I think I want to switch to a farmhouse style instead. Cream-colored cabinets, butcher block countertops, an apron-front sink. And my in-laws offered to help, so the budget can go up to $25,000.",
      },
      {
        role: 'assistant',
        content:
          'Great news on the expanded budget! Farmhouse style is charming. With $25k you can get high-quality cream shaker cabinets, butcher block counters (maple or walnut), a beautiful apron-front fireclay sink, and maybe even open shelving with reclaimed wood. Want me to revise the breakdown?',
      },
      {
        role: 'user',
        content:
          'Yes, and I definitely want the walnut butcher block, not maple. Also, we need a new dishwasher — ours is 15 years old. Looking at Bosch or KitchenAid. And please factor in a tile backsplash, something with a subway tile pattern.',
      },
      {
        role: 'assistant',
        content:
          "Got it — walnut butcher block, new dishwasher (Bosch 300 series is excellent value around $800), and subway tile backsplash. With the farmhouse style and $25k budget, here's the revised plan: cabinets (~$6k), walnut counters (~$4k), apron sink (~$800), dishwasher (~$800), backsplash (~$2k), flooring (~$2.5k), open shelving (~$1k), lighting (~$800), hardware and labor (~$5k). Total around $23k.",
      },
    ],
  },

  // ── Scenario 3: Vague/sparse — Career decision ──
  {
    id: 3,
    name: 'Vague/Sparse — Career Decision',
    description:
      'Friend asks for advice about switching jobs. Lots of hedging, uncertainty, and low information density. Tests extraction quality with vague input.',
    tests: 'Low-confidence extraction, hedged preferences, implicit constraints',
    turns: [
      {
        role: 'user',
        content:
          "I've been thinking about maybe leaving my job. I don't know, it's complicated. I've been there 4 years and it's... fine, I guess?",
      },
      {
        role: 'assistant',
        content:
          "It sounds like you're feeling some restlessness but aren't sure if it's enough to make a change. What's making you consider leaving? Is it the work itself, the environment, or something else?",
      },
      {
        role: 'user',
        content:
          "It's not terrible or anything. The pay is decent — around $85k. But I feel like I'm not really growing? Like, my manager is nice but there's no clear path forward. Maybe I just need to be more patient, I don't know.",
      },
      {
        role: 'assistant',
        content:
          "That's a common feeling around the 3-5 year mark. The lack of growth trajectory is worth taking seriously. Have you talked to your manager about advancement opportunities, or looked at what's available elsewhere?",
      },
      {
        role: 'user',
        content:
          "Sort of. I casually mentioned it once and he said something vague about 'opportunities coming up.' A recruiter reached out about a startup — it pays more, maybe $110k, but startups are risky, right? I have a mortgage and a kid starting school next year so I can't really afford to take big risks.",
      },
      {
        role: 'assistant',
        content:
          "Those are real constraints. The $25k salary increase is significant, but you're right that startups carry risk. It depends on their funding stage, runway, and your risk tolerance. Would you be open to larger companies too, or is the startup the only option you're considering?",
      },
      {
        role: 'user',
        content:
          "I guess I'd consider a bigger company too. I used to think I wanted to work at a startup but with a family, stability matters more now, I think. Maybe a mid-size company? I'm a software engineer, mainly backend — Python and some Go. I don't want to go back to Java though, did that early in my career and hated it.",
      },
      {
        role: 'assistant',
        content:
          "So to summarize: you're a backend engineer with Python and Go experience, looking for growth opportunities with better comp but needing stability for family reasons. Mid-size companies might be a sweet spot. It sounds like you're not in a rush — would you say you're in the 'exploring' phase rather than actively job hunting?",
      },
      {
        role: 'user',
        content:
          "Yeah, exactly. Just exploring for now. Not desperate to leave, just... wondering if there's something better out there. Maybe I should update my LinkedIn first and see what comes in. It depends on a lot of things, really.",
      },
      {
        role: 'assistant',
        content:
          "That's a sensible approach. Passive job searching — updating your profile and being open to conversations — is low-risk and high-reward. You can evaluate opportunities against your current situation without the pressure of needing to make a quick decision.",
      },
    ],
  },

  // ── Scenario 4: Topic mixing — Travel + work project ──
  {
    id: 4,
    name: 'Topic Mixing — Travel + Work Project',
    description:
      'Starts with vacation planning, suddenly discusses a work deadline, then returns to vacation. Tests how extraction handles unrelated topics interleaved.',
    tests: 'Topic separation, mixed-topic frame contamination, context switching',
    turns: [
      {
        role: 'user',
        content:
          'I want to plan a trip to Portugal for two weeks in September. Thinking Lisbon for 5 days, then Porto for 4 days, and maybe the Algarve coast for the rest. Budget about $3,500 not including flights.',
      },
      {
        role: 'assistant',
        content:
          "Portugal in September is wonderful — still warm but fewer tourists. Your split sounds great: Lisbon has enough to fill 5 days easily, Porto is compact and charming, and the Algarve has stunning beaches. For $3,500 over 14 days that's about $250/day for two, very manageable. Any preferences for accommodation?",
      },
      {
        role: 'user',
        content:
          "We like boutique hotels or well-reviewed Airbnbs. Nothing too fancy but not hostels either. Mid-range. Also, we're both vegetarian so restaurant options matter a lot — is Portuguese food vegetarian-friendly?",
      },
      {
        role: 'assistant',
        content:
          "Portuguese cuisine is traditionally meat and fish heavy, but Lisbon especially has embraced the vegetarian scene — lots of dedicated veggie restaurants. Porto has fewer but still good options. I'd recommend researching spots in advance for the Algarve. Boutique hotels in Lisbon's Alfama district are lovely.",
      },
      {
        role: 'user',
        content:
          "Oh wait, completely different topic — I just realized my Q3 project report is due Friday and I haven't started the data analysis section. The report needs to cover our API migration metrics: latency improvements, error rate changes, and adoption numbers across 3 regions. My manager Sarah wants it by 5pm EST.",
      },
      {
        role: 'assistant',
        content:
          "That sounds urgent. For the data analysis section, I'd suggest: 1) Pull the latency before/after metrics per region from your monitoring dashboard, 2) Calculate error rate delta as a percentage, 3) Create a simple adoption curve chart. What data sources do you have access to?",
      },
      {
        role: 'user',
        content:
          'We use Grafana for monitoring and I can pull the adoption data from our internal analytics DB. The three regions are US-East, EU-West, and APAC. I think US-East had the best improvement — something like 40% latency reduction. Anyway, I need to focus on that today, but let me finish the Portugal planning real quick.',
      },
      {
        role: 'assistant',
        content:
          "Sure, let's wrap up the Portugal essentials. You mentioned Lisbon (5 days), Porto (4 days), Algarve (5 days). Shall I suggest a day-by-day outline, or are you more of a go-with-the-flow traveler?",
      },
      {
        role: 'user',
        content:
          'Mostly go with the flow, but I do want to make sure we hit the main spots: Belém Tower and Jerónimos Monastery in Lisbon, wine tasting in Porto, and at least one day of beach hopping in the Algarve. Oh and we want to take the train between cities, not rent a car.',
      },
      {
        role: 'assistant',
        content:
          "The train is a great choice — Lisbon to Porto is about 3 hours on the Alfa Pendular, very comfortable. For Algarve you'll take the train to Faro or Lagos. The key sights you mentioned are all must-dos. I'd add: try pastéis de nata in Belém, visit Livraria Lello in Porto, and check out Benagil Cave in the Algarve.",
      },
    ],
  },

  // ── Scenario 5: Incremental stability ──
  {
    id: 5,
    name: 'Incremental Stability — Kitchen Remodel Extended',
    description:
      'Same topic as Scenario 2 but split: extract after 4 turns, add 4 more turns, extract again. Tests whether the second extraction preserves and extends the first result.',
    tests: 'Incremental mode stability, frame preservation, delta correctness',
    splitAt: 4,
    turns: [
      {
        role: 'user',
        content:
          "We're renovating our bathroom. It's a small space — about 60 square feet. Budget is $8,000. Want to replace the vanity, toilet, and tile the shower.",
      },
      {
        role: 'assistant',
        content:
          'For a 60 sq ft bathroom with $8k, you have good options. A new vanity ($500-1500), toilet ($200-600), and shower tiling ($1500-3000) are all within range. What style are you going for?',
      },
      {
        role: 'user',
        content:
          'Clean and modern. White subway tiles in the shower, a floating vanity with a vessel sink, and a wall-mounted toilet to save space. I also want a large mirror with built-in LED lighting.',
      },
      {
        role: 'assistant',
        content:
          'Great choices for a small space — wall-mounted fixtures really open things up. White subway tiles are timeless. For the floating vanity, 30-36 inches wide would work well for 60 sq ft. LED mirror is a nice touch. Are you doing the work yourself or hiring a contractor?',
      },
      // --- splitAt: 4 --- First extraction happens here ---
      {
        role: 'user',
        content:
          'Hiring a contractor. My neighbor recommended someone who charges $50/hour. Also, I want to add heated floors — is that feasible with the budget?',
      },
      {
        role: 'assistant',
        content:
          'Electric radiant floor heating for 60 sq ft is around $400-600 for materials, plus installation. With your $8k budget you should still be fine. At $50/hour your contractor rate is reasonable. How soon do you want to start?',
      },
      {
        role: 'user',
        content:
          'Hoping to start in about 3 weeks. Oh, and I forgot — I want a rain showerhead, the large 12-inch kind. Chrome finish to match the other fixtures. Everything should be chrome.',
      },
      {
        role: 'assistant',
        content:
          'Chrome fixtures throughout will give it a cohesive look. A 12-inch rain showerhead in chrome runs about $80-200 for a good one. Three weeks should be enough time to order everything. Want me to put together a full materials list?',
      },
    ],
  },
];

// ============================================================
// Markdown Formatter
// ============================================================

function formatFrameToMarkdown(frame: { id: string; type: string; slots: Record<string, unknown>; confidence?: number; slot_sources?: Record<string, unknown>; source?: string }, indent = 0): string {
  const pad = '  '.repeat(indent);
  const lines: string[] = [];
  lines.push(
    `${pad}- **${frame.type}** (id: \`${frame.id}\`, confidence: ${frame.confidence ?? 'N/A'})`
  );
  if (frame.source) {
    lines.push(`${pad}  - Source: ${frame.source}`);
  }
  for (const [key, value] of Object.entries(frame.slots)) {
    const formatted = typeof value === 'object' ? JSON.stringify(value) : String(value);
    lines.push(`${pad}  - \`${key}\`: ${formatted}`);
  }
  if (frame.slot_sources) {
    lines.push(`${pad}  - **Slot Sources:**`);
    for (const [key, src] of Object.entries(frame.slot_sources) as [string, any][]) {
      lines.push(
        `${pad}    - \`${key}\` → Turn ${src.turn} [${src.start_char}:${src.end_char}] "${src.quote ?? ''}"`
      );
    }
  }
  return lines.join('\n');
}

function formatSnapshotToMarkdown(snapshot: SemanticContent): string {
  const lines: string[] = [];
  lines.push('### Frames\n');
  if (flattenTrees(snapshot.trees).length === 0) {
    lines.push('_No frames extracted._\n');
  } else {
    for (const frame of flattenTrees(snapshot.trees)) {
      lines.push(formatFrameToMarkdown(frame));
      lines.push('');
    }
  }
  lines.push('### Relations\n');
  if (snapshot.relations.length === 0) {
    lines.push('_No relations._\n');
  } else {
    for (const rel of snapshot.relations) {
      lines.push(
        `- \`${rel.from}\` → \`${rel.to}\` (${rel.type}, confidence: ${rel.confidence ?? 'N/A'})`
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}

function generateScenarioMarkdown(
  scenario: Scenario,
  snapshot: SemanticContent,
  delta: { changes: unknown[]; new_relations?: unknown[] },
  durationMs: number,
  secondSnapshot?: SemanticContent,
  secondDelta?: { changes: unknown[]; new_relations?: unknown[] },
  secondDurationMs?: number
): string {
  const lines: string[] = [];

  lines.push(`# Scenario ${scenario.id}: ${scenario.name}\n`);
  lines.push(`> ${scenario.description}\n`);
  lines.push(`**Tests:** ${scenario.tests}\n`);

  // Conversation
  lines.push('## Conversation\n');
  for (let i = 0; i < scenario.turns.length; i++) {
    const turn = scenario.turns[i];
    const label = turn.role === 'user' ? '**User**' : '**Assistant**';
    lines.push(`**T${i + 1}** ${label}: ${turn.content}\n`);
    if (scenario.splitAt && i + 1 === scenario.splitAt) {
      lines.push('---\n*\\[First extraction happens here\\]*\n---\n');
    }
  }

  // Extraction Results
  if (scenario.splitAt) {
    lines.push('## First Extraction Result\n');
    lines.push(`_Extraction time: ${durationMs}ms_\n`);
    lines.push(`_Delta changes: ${delta.changes.length}_\n`);
    lines.push(formatSnapshotToMarkdown(snapshot));

    if (secondSnapshot) {
      lines.push('## Second Extraction Result (Incremental)\n');
      lines.push(`_Extraction time: ${secondDurationMs ?? 0}ms_\n`);
      lines.push(`_Delta changes: ${secondDelta?.changes.length ?? 0}_\n`);
      lines.push(formatSnapshotToMarkdown(secondSnapshot));

      lines.push('## Incremental Stability Analysis\n');
      lines.push('Compare first and second extraction results:\n');
      lines.push(`- First extraction frames: ${flattenTrees(snapshot.trees).length}`);
      lines.push(`- Second extraction frames: ${flattenTrees(secondSnapshot.trees).length}`);
      lines.push(
        `- Frames added in second extraction: ${Math.max(0, flattenTrees(secondSnapshot.trees).length - flattenTrees(snapshot.trees).length)}`
      );
      lines.push('');
    }
  } else {
    lines.push('## Extraction Result\n');
    lines.push(`_Extraction time: ${durationMs}ms_\n`);
    lines.push(
      `_Delta changes: ${delta.changes.length}, New relations: ${(delta.new_relations as unknown[])?.length ?? 0}_\n`
    );
    lines.push(formatSnapshotToMarkdown(snapshot));
  }

  // Raw JSON
  lines.push('<details>');
  lines.push('<summary>Raw JSON</summary>\n');
  lines.push('```json');
  if (scenario.splitAt && secondSnapshot) {
    lines.push(
      JSON.stringify(
        { first: { snapshot, delta }, second: { snapshot: secondSnapshot, delta: secondDelta } },
        null,
        2
      )
    );
  } else {
    lines.push(JSON.stringify({ snapshot, delta }, null, 2));
  }
  lines.push('```\n');
  lines.push('</details>\n');

  // Scoring Template
  lines.push('## Human Evaluation\n');
  lines.push('| Dimension | Score (0-10) | Notes |');
  lines.push('|-----------|:------------:|-------|');
  lines.push('| **Coverage** — Did it capture all key information? | | |');
  lines.push('| **Accuracy** — Are slot values correct? Any hallucinations? | | |');
  lines.push('| **Structure** — Is nesting logical? Granularity appropriate? | | |');
  if (scenario.splitAt) {
    lines.push('| **Incremental Stability** — Did 2nd extraction preserve previous content? | | |');
  }
  lines.push('');
  lines.push('**Overall Notes:**\n');
  lines.push('_[Write your observations here]_\n');

  return lines.join('\n');
}

// ============================================================
// Main Runner
// ============================================================

async function runScenario(app: Hono, scenario: Scenario): Promise<void> {
  const db = await getDB();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Scenario ${scenario.id}: ${scenario.name}`);
  console.log('='.repeat(60));

  // Create project + conversation
  const project = await insertProject(db, {
    name: `Eval — Scenario ${scenario.id}: ${scenario.name}`,
  });
  const conv = await insertConversation(db, {
    projectId: project.projectId,
    title: scenario.name,
  });

  const turnsToInsert = scenario.splitAt
    ? scenario.turns.slice(0, scenario.splitAt)
    : scenario.turns;
  const remainingTurns = scenario.splitAt ? scenario.turns.slice(scenario.splitAt) : [];

  // Insert initial turns
  for (const turn of turnsToInsert) {
    await insertTurn(db, {
      projectId: project.projectId,
      conversationId: conv.conversationId,
      role: turn.role,
      content: turn.content,
    });
  }

  console.log(`  Inserted ${turnsToInsert.length} turns → conversation ${conv.conversationId}`);

  // First extraction
  console.log('  Running first extraction...');
  const t0 = Date.now();
  const res1 = await app.request('/v1/extract/trees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversation_id: conv.conversationId }),
  });
  const durationMs = Date.now() - t0;

  if (res1.status !== 200) {
    const body = await res1.json();
    console.error(`  FAILED (${res1.status}):`, JSON.stringify(body, null, 2));
    fs.writeFileSync(
      path.join(RESULTS_DIR, `scenario-${scenario.id}.md`),
      `# Scenario ${scenario.id}: ${scenario.name}\n\n**EXTRACTION FAILED**\n\nStatus: ${res1.status}\n\n\`\`\`json\n${JSON.stringify(body, null, 2)}\n\`\`\`\n`
    );
    return;
  }

  const body1 = (await res1.json()) as {
    success: boolean;
    // biome-ignore lint/suspicious/noExplicitAny: test helper
    data: { delta: any; snapshot: SemanticContent; delta_log_id: string };
  };
  console.log(
    `  First extraction: ${flattenTrees(body1.data.snapshot.trees).length} frames, ${body1.data.delta.changes.length} changes (${durationMs}ms)`
  );

  let secondSnapshot: SemanticContent | undefined;
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let secondDelta: any;
  let secondDurationMs: number | undefined;

  // Incremental extraction (Scenario 5)
  if (scenario.splitAt && remainingTurns.length > 0) {
    for (const turn of remainingTurns) {
      await insertTurn(db, {
        projectId: project.projectId,
        conversationId: conv.conversationId,
        role: turn.role,
        content: turn.content,
      });
    }
    console.log(`  Inserted ${remainingTurns.length} additional turns`);
    console.log('  Running incremental extraction...');

    const t1 = Date.now();
    const res2 = await app.request('/v1/extract/trees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: conv.conversationId }),
    });
    secondDurationMs = Date.now() - t1;

    if (res2.status !== 200) {
      const errBody = await res2.json();
      console.error(`  Incremental FAILED (${res2.status}):`, JSON.stringify(errBody, null, 2));
    } else {
      const body2 = (await res2.json()) as {
        success: boolean;
        // biome-ignore lint/suspicious/noExplicitAny: test helper
        data: { delta: any; snapshot: SemanticContent; delta_log_id: string };
      };
      secondSnapshot = body2.data.snapshot;
      secondDelta = body2.data.delta;
      console.log(
        `  Incremental extraction: ${flattenTrees(secondSnapshot.trees).length} frames, ${secondDelta.changes.length} changes (${secondDurationMs}ms)`
      );
    }
  }

  // Write markdown
  const md = generateScenarioMarkdown(
    scenario,
    body1.data.snapshot,
    body1.data.delta,
    durationMs,
    secondSnapshot,
    secondDelta,
    secondDurationMs
  );
  const outPath = path.join(RESULTS_DIR, `scenario-${scenario.id}.md`);
  fs.writeFileSync(outPath, md);
  console.log(`  Results saved → ${outPath}`);
}

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   T3X Extraction Quality Evaluation Runner      ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // Ensure output directory exists
  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  // Create Hono app with real routes
  const app = new Hono();
  app.route('/', treeExtractRoutes);

  // Initialize DB (uses embedded PG or DATABASE_URL)
  console.log('Initializing database...');
  await getDB();
  console.log('Database ready.\n');

  const scenarioFilter = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
  const scenarios = scenarioFilter
    ? SCENARIOS.filter((s) => scenarioFilter.includes(s.id))
    : SCENARIOS;

  console.log(
    `Running ${scenarios.length} scenario(s): ${scenarios.map((s) => `S${s.id}`).join(', ')}`
  );

  for (const scenario of scenarios) {
    try {
      await runScenario(app, scenario);
    } catch (err) {
      console.error(`\nScenario ${scenario.id} CRASHED:`, err);
      fs.writeFileSync(
        path.join(RESULTS_DIR, `scenario-${scenario.id}.md`),
        `# Scenario ${scenario.id}: ${scenario.name}\n\n**SCRIPT CRASHED**\n\n\`\`\`\n${err instanceof Error ? err.stack : String(err)}\n\`\`\`\n`
      );
    }
  }

  // Generate summary
  console.log('\n' + '='.repeat(60));
  console.log('All scenarios complete. Results in:');
  console.log(`  ${RESULTS_DIR}/`);
  console.log('='.repeat(60));

  await closeDB();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
