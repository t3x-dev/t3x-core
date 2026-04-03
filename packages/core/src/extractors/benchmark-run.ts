#!/usr/bin/env tsx
/**
 * Real A/B Benchmark: YAML vs Tool-Use Extraction
 *
 * Usage: ANTHROPIC_API_KEY=sk-... npx tsx packages/core/src/extractors/benchmark-run.ts
 * Or:   source .env && npx tsx packages/core/src/extractors/benchmark-run.ts
 */

import { createClaudeProvider } from '../providers/llm/claude';
import { runBenchmark } from './benchmark';
import type { ExtractionInput } from './yopsPrompt';
import type { TreeNode } from '../semantic/types';

// ── Test Cases ──

const CASES: Array<{ name: string; input: ExtractionInput }> = [
  {
    name: 'Simple (2 turns, travel)',
    input: {
      turns: [
        { role: 'user', content: 'I want to plan a trip to Tokyo for 7 days with a budget of $3000' },
        {
          role: 'assistant',
          content:
            'Great choice! For a 7-day Tokyo trip on $3000, here\'s what I recommend:\n- Flights: ~$800 round trip\n- Hotel: ~$100/night ($700 total), try Shinjuku area\n- Food: ~$50/day ($350 total)\n- JR Pass: $280 for 7 days\n- Activities: ~$500 for temples, museums, teamLab\n- Buffer: ~$370 for shopping and extras',
        },
      ],
    },
  },
  {
    name: 'Medium (4 turns, tech comparison)',
    input: {
      turns: [
        { role: 'user', content: 'Compare React and Vue for building a large enterprise dashboard' },
        {
          role: 'assistant',
          content:
            'Here\'s a comparison for enterprise dashboards:\n\nReact:\n- Ecosystem: Massive, 200k+ packages\n- Learning curve: Steeper, need to learn JSX, hooks, state management separately\n- Performance: Virtual DOM, good with React.memo and useMemo\n- TypeScript: Excellent support, first-class\n- Testing: Jest + React Testing Library\n- State management: Redux, Zustand, Jotai (many choices)\n\nVue:\n- Ecosystem: Growing, 50k+ packages\n- Learning curve: Gentler, template syntax familiar to HTML devs\n- Performance: Reactive system, automatic optimization\n- TypeScript: Good support since Vue 3, improving\n- Testing: Vitest + Vue Test Utils\n- State management: Pinia (official, simpler)',
        },
        {
          role: 'user',
          content:
            'What about team size considerations? We have 20 developers, mix of junior and senior.',
        },
        {
          role: 'assistant',
          content:
            'For a 20-person team with mixed experience:\n\nReact advantages:\n- Larger hiring pool (more React devs on market)\n- More senior devs available for mentoring\n- More tutorials and Stack Overflow answers\n- Stricter patterns enforce consistency in large teams\n\nVue advantages:\n- Junior devs ramp up faster (2-3 weeks vs 4-6 weeks for React)\n- Less boilerplate means fewer mistakes\n- Opinionated structure reduces "analysis paralysis"\n- Official solutions (Pinia, Vue Router) mean less decision fatigue\n\nMy recommendation for your case: React, because:\n1. Easier to hire at scale\n2. Better for complex state management in dashboards\n3. More mature enterprise tooling (Next.js, etc.)',
        },
      ],
    },
  },
  {
    name: 'Complex (6 turns, project planning)',
    input: {
      turns: [
        {
          role: 'user',
          content: 'We need to build a real-time collaborative document editor. What architecture should we use?',
        },
        {
          role: 'assistant',
          content:
            'For a real-time collaborative editor, you have two main CRDT approaches:\n\n1. **Yjs** (recommended):\n   - CRDT-based, no central server needed for conflict resolution\n   - Supports: text, rich text, arrays, maps, XML\n   - Providers: WebSocket, WebRTC, IndexedDB\n   - Used by: Notion, Linear, Jupyter\n   - Bundle size: ~30KB\n\n2. **Automerge**:\n   - Also CRDT-based\n   - Better for structured data (JSON-like)\n   - Rust core with WASM bindings\n   - Bundle size: ~800KB (heavier due to WASM)\n\nArchitecture layers:\n- Editor: ProseMirror or TipTap (built on ProseMirror)\n- Sync: Yjs with y-websocket provider\n- Persistence: PostgreSQL + Redis for presence\n- Auth: JWT tokens for WebSocket connections',
        },
        {
          role: 'user',
          content:
            'We expect 500 concurrent users editing simultaneously. What about scaling?',
        },
        {
          role: 'assistant',
          content:
            'For 500 concurrent editors:\n\n**WebSocket scaling:**\n- Single Node.js server: ~10K connections (more than enough)\n- Use Redis pub/sub for multi-server: each server handles a document room\n- Horizontal scaling: sticky sessions by document ID\n\n**Database strategy:**\n- Write batching: Buffer CRDT updates, flush every 2-5 seconds\n- Document snapshots: Store full state every N updates (say every 100)\n- History: Keep CRDT operations for undo/redo, prune after 30 days\n\n**Presence system:**\n- Redis with TTL for cursor positions\n- Broadcast via WebSocket rooms\n- Update frequency: throttle to 100ms intervals\n\n**Performance numbers (benchmarks from Yjs):**\n- 500 concurrent edits: ~2ms merge time\n- Document size up to 10MB supported\n- Network: ~50 bytes per character operation\n- Memory: ~2x document size for CRDT state',
        },
        {
          role: 'user',
          content: 'What about offline support and conflict resolution?',
        },
        {
          role: 'assistant',
          content:
            'Offline support with Yjs is straightforward:\n\n**Offline storage:**\n- IndexedDB via y-indexeddb provider\n- Stores CRDT state locally, syncs when reconnected\n- Works in ServiceWorker for PWA support\n\n**Conflict resolution (automatic with CRDTs):**\n- Text: Last-writer-wins at character level (no data loss)\n- Concurrent inserts: Deterministic ordering by client ID\n- Delete + edit conflict: Edit wins (text preserved)\n- No manual conflict resolution needed — this is the main CRDT advantage\n\n**Reconnection flow:**\n1. Client reconnects → sends local state vector\n2. Server computes diff → sends missing updates\n3. Client applies updates → UI updates automatically\n4. Typical sync time: <100ms for hours of offline edits\n\n**Edge cases to handle:**\n- Large offline divergence: May cause UI jump (mitigate with animations)\n- Schema changes during offline: Version the document format\n- Authentication expiry: Re-auth before sync, queue updates',
        },
      ],
    },
  },
];

// ── Main ──

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY not set');
    console.error('Usage: source .env && npx tsx packages/core/src/extractors/benchmark-run.ts');
    process.exit(1);
  }

  const provider = createClaudeProvider({ apiKey, model: 'claude-sonnet-4-20250514' });
  const model = 'claude-sonnet-4-20250514';

  console.log('=== T3X Extraction Benchmark: YAML vs Tool-Use ===\n');
  console.log(`Model: ${model}`);
  console.log(`Cases: ${CASES.length}\n`);

  const results = [];

  for (const testCase of CASES) {
    console.log(`--- ${testCase.name} ---`);
    console.log(`Turns: ${testCase.input.turns.length}`);

    try {
      const result = await runBenchmark(testCase.input, provider, undefined, model);
      results.push({ name: testCase.name, result });

      // Print results
      console.log(`\nYAML:     ${result.yaml.ok ? 'OK' : `FAIL: ${result.yaml.ok === false ? result.yaml.error : ''}`}`);
      console.log(`Tool-Use: ${result.toolUse.ok ? 'OK' : `FAIL: ${result.toolUse.ok === false ? result.toolUse.error : ''}`}`);

      console.log(`\n  Metric          | YAML    | Tool-Use | Ratio`);
      console.log(`  ────────────────|─────────|──────────|──────`);
      console.log(`  Input tokens    | ${pad(result.comparison.yamlTotalTokens - (result.yaml.usage.outputTokens))} | ${pad(result.comparison.toolUseTotalTokens - (result.toolUse.usage.outputTokens))} | -`);
      console.log(`  Output tokens   | ${pad(result.yaml.usage.outputTokens)} | ${pad(result.toolUse.usage.outputTokens)} | ${(result.toolUse.usage.outputTokens / Math.max(result.yaml.usage.outputTokens, 1)).toFixed(2)}x`);
      console.log(`  Total tokens    | ${pad(result.comparison.yamlTotalTokens)} | ${pad(result.comparison.toolUseTotalTokens)} | ${result.comparison.tokenRatio.toFixed(2)}x`);
      console.log(`  Nodes           | ${pad(result.comparison.yamlNodeCount)} | ${pad(result.comparison.toolUseNodeCount)} | -`);
      console.log(`  Slots           | ${pad(result.comparison.yamlSlotCount)} | ${pad(result.comparison.toolUseSlotCount)} | -`);
      console.log(`  YOps            | ${pad(result.comparison.yamlYopCount)} | ${pad(result.comparison.toolUseYopCount)} | -`);
      console.log(`  Duration        | ${pad(result.yamlDurationMs)}ms | ${pad(result.toolUseDurationMs)}ms | ${(result.toolUseDurationMs / Math.max(result.yamlDurationMs, 1)).toFixed(2)}x`);

      // Print tree snapshots for comparison
      if (result.yaml.ok) {
        console.log(`\n  YAML tree:`);
        printTree(result.yaml.snapshot.trees, '    ');
      }
      if (result.toolUse.ok) {
        console.log(`\n  Tool-Use tree:`);
        printTree(result.toolUse.snapshot.trees, '    ');
      }
    } catch (err) {
      console.error(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }

    console.log('\n');
  }

  // Summary
  console.log('=== SUMMARY ===\n');
  console.log(`Case                          | YAML | Tool | Token Ratio | Pass?`);
  console.log(`──────────────────────────────|──────|──────|─────────────|──────`);
  for (const { name, result } of results) {
    const ratio = result.comparison.tokenRatio;
    const pass = ratio > 0 && ratio < 3 && result.toolUse.ok ? 'YES' : 'NO';
    console.log(`${name.padEnd(30)}| ${result.yaml.ok ? ' OK ' : 'FAIL'} | ${result.toolUse.ok ? ' OK ' : 'FAIL'} | ${ratio.toFixed(2).padStart(11)} | ${pass}`);
  }

  const avgRatio = results.reduce((sum, r) => sum + r.result.comparison.tokenRatio, 0) / Math.max(results.length, 1);
  console.log(`\nAverage token ratio: ${avgRatio.toFixed(2)}x`);
  console.log(`Target: < 3.0x`);
  console.log(`Verdict: ${avgRatio > 0 && avgRatio < 3 ? 'PASS — tool-use is viable' : 'FAIL — tool-use too expensive'}`);
}

function pad(n: number): string {
  return String(n).padStart(7);
}

function printTree(trees: TreeNode[], indent: string, maxLines = 25): void {
  let lines = 0;
  function walk(node: TreeNode, depth: number) {
    if (lines >= maxLines) return;
    const pad = '  '.repeat(depth);
    console.log(`${indent}${pad}${node.key}:`);
    lines++;
    for (const [k, v] of Object.entries(node.slots)) {
      if (lines >= maxLines) { console.log(`${indent}${pad}  ...(truncated)`); return; }
      console.log(`${indent}${pad}  ${k}: ${JSON.stringify(v)}`);
      lines++;
    }
    for (const child of node.children) {
      walk(child, depth + 1);
    }
  }
  for (const tree of trees) walk(tree, 0);
}

main().catch(console.error);
