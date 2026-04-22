/**
 * E2E harness: run the V2 extraction pipeline against all cataloged models.
 *
 * Usage (from repo root):
 *   apps/api/node_modules/.bin/tsx --env-file=.env \
 *     packages/core/scripts/e2e-multi-model.ts \
 *     [--model=<id>] [--provider=<anthropic|openai|google>] \
 *     [--fixture=<path>] [--runs=<N>] [--dump-dir=<path>]
 *
 * Reports per-model: ok/fail, latency, ops/trees/relations/warnings counts,
 * failure code+message. With --runs=N, runs each model N times and reports
 * pass/fail ratio to surface non-determinism.
 *
 * Raw drafts + compiled ops are dumped to <dump-dir>/<model>/<run>.json
 * (defaults to .v2-runs/, which is gitignored). This is the source material
 * for debugging failing models.
 *
 * Exit code:
 *   0 if all runs passed
 *   1 if any run failed
 *   2 if the harness itself crashed
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractAndApply } from '../src/extractors/v2/extract-and-apply';
import type { PromptTurnInput } from '../src/extractors/v2/normalization';
import { getAllModels } from '../src/llm/catalog';
import { createProviderForModel } from '../src/llm/providerFactory';
import type { ProviderName } from '../src/llm/types';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_FIXTURE = resolve(
  SCRIPT_DIR,
  '..',
  'src',
  '__tests__',
  'fixtures',
  'hots-conversation.json'
);
const DEFAULT_DUMP_DIR = resolve(SCRIPT_DIR, '..', '..', '..', '.v2-runs');

interface Args {
  modelFilter?: string;
  providerFilter?: ProviderName;
  fixturePath: string;
  runs: number;
  dumpDir: string;
  sloMs: number;
}

function parseArgs(): Args {
  const args: Args = {
    fixturePath: DEFAULT_FIXTURE,
    runs: 1,
    dumpDir: DEFAULT_DUMP_DIR,
    // Typical extraction on the standard fixture should complete in ~10s.
    // Runs exceeding this are flagged as slow — a yellow signal that either
    // the model is burning budget on thinking or something is off upstream.
    sloMs: 10000,
  };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--model=')) args.modelFilter = arg.slice('--model='.length);
    else if (arg.startsWith('--provider=')) {
      args.providerFilter = arg.slice('--provider='.length) as ProviderName;
    } else if (arg.startsWith('--fixture=')) {
      args.fixturePath = resolve(arg.slice('--fixture='.length));
    } else if (arg.startsWith('--runs=')) {
      args.runs = Math.max(1, Number.parseInt(arg.slice('--runs='.length), 10) || 1);
    } else if (arg.startsWith('--dump-dir=')) {
      args.dumpDir = resolve(arg.slice('--dump-dir='.length));
    } else if (arg.startsWith('--slo-ms=')) {
      args.sloMs = Math.max(0, Number.parseInt(arg.slice('--slo-ms='.length), 10) || 0);
    }
  }
  return args;
}

function loadApiKeys(): Record<ProviderName, string | undefined> {
  return {
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    google: process.env.GOOGLE_AI_STUDIO_KEY,
  };
}

interface RunResult {
  modelId: string;
  provider: ProviderName;
  run: number;
  status: 'ok' | 'fail' | 'skipped';
  durationMs: number;
  ops?: number;
  trees?: number;
  relations?: number;
  warnings?: number;
  failureCode?: string;
  failureMessage?: string;
  dumpPath?: string;
}

function short(text: string, n = 120): string {
  if (!text) return '';
  const s = text.replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function safeModelSegment(modelId: string): string {
  return modelId.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function runOne(
  modelId: string,
  provider: ProviderName,
  runNumber: number,
  turns: PromptTurnInput[],
  apiKeys: Record<ProviderName, string | undefined>,
  dumpDir: string
): Promise<RunResult> {
  const llm = createProviderForModel(modelId, apiKeys);
  if (!llm) {
    return {
      modelId,
      provider,
      run: runNumber,
      status: 'skipped',
      durationMs: 0,
      failureCode: 'no_api_key',
      failureMessage: `No API key for provider ${provider}`,
    };
  }

  const start = Date.now();
  let result: Awaited<ReturnType<typeof extractAndApply>> | undefined;
  let thrown: unknown;
  try {
    result = await extractAndApply({
      turns,
      mode: 'bootstrap',
      providerId: provider,
      provider: llm,
      model: modelId,
    });
  } catch (err) {
    thrown = err;
  }
  const durationMs = Date.now() - start;

  const modelDir = resolve(dumpDir, safeModelSegment(modelId));
  mkdirSync(modelDir, { recursive: true });
  const dumpPath = resolve(modelDir, `run-${runNumber}.json`);
  const dump = {
    modelId,
    provider,
    run: runNumber,
    durationMs,
    ...(thrown ? { threw: short((thrown as Error)?.stack ?? String(thrown), 2000) } : { result }),
  };
  writeFileSync(dumpPath, JSON.stringify(dump, null, 2));

  if (thrown) {
    return {
      modelId,
      provider,
      run: runNumber,
      status: 'fail',
      durationMs,
      failureCode: 'exception',
      failureMessage: short((thrown as Error)?.message ?? String(thrown)),
      dumpPath,
    };
  }

  if (!result || !result.ok) {
    return {
      modelId,
      provider,
      run: runNumber,
      status: 'fail',
      durationMs,
      failureCode: result?.failure.code ?? 'unknown',
      failureMessage: short(result?.failure.message ?? ''),
      dumpPath,
    };
  }

  return {
    modelId,
    provider,
    run: runNumber,
    status: 'ok',
    durationMs,
    ops: result.compiled.ops.length,
    trees: result.snapshot.trees.length,
    relations: result.snapshot.relations.length,
    warnings: result.compiled.warnings.length,
    dumpPath,
  };
}

function printRow(r: RunResult, sloMs: number): void {
  const status = r.status === 'ok' ? '✓' : r.status === 'skipped' ? '-' : '✗';
  const slow = r.durationMs > sloMs ? ' ⚠slow' : '';
  const time = r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s`.padStart(6) : '     -';
  const counts =
    r.status === 'ok'
      ? `ops=${r.ops} trees=${r.trees} rel=${r.relations} warn=${r.warnings}`
      : r.failureCode
        ? `${r.failureCode}: ${r.failureMessage ?? ''}`
        : '';
  console.log(
    `  ${status} ${r.provider.padEnd(10)} ${r.modelId.padEnd(36)} run${r.run} ${time}${slow}   ${counts}`
  );
}

interface AggregateRow {
  modelId: string;
  provider: ProviderName;
  ok: number;
  fail: number;
  skipped: number;
  total: number;
  firstFailure?: { code: string; message: string };
  durationsMs: number[];
  slowCount: number;
}

function aggregate(results: RunResult[], sloMs: number): AggregateRow[] {
  const byModel = new Map<string, AggregateRow>();
  for (const r of results) {
    const row = byModel.get(r.modelId) ?? {
      modelId: r.modelId,
      provider: r.provider,
      ok: 0,
      fail: 0,
      skipped: 0,
      total: 0,
      durationsMs: [],
      slowCount: 0,
    };
    row.total += 1;
    row.durationsMs.push(r.durationMs);
    if (r.durationMs > sloMs) row.slowCount += 1;
    if (r.status === 'ok') row.ok += 1;
    else if (r.status === 'skipped') row.skipped += 1;
    else {
      row.fail += 1;
      if (!row.firstFailure) {
        row.firstFailure = {
          code: r.failureCode ?? 'unknown',
          message: r.failureMessage ?? '',
        };
      }
    }
    byModel.set(r.modelId, row);
  }
  return [...byModel.values()];
}

function summarizeDurations(durationsMs: number[]): {
  medianMs: number;
  maxMs: number;
} {
  if (durationsMs.length === 0) return { medianMs: 0, maxMs: 0 };
  const sorted = [...durationsMs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianMs =
    sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
  return { medianMs, maxMs: sorted[sorted.length - 1] };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const apiKeys = loadApiKeys();
  const turns = JSON.parse(readFileSync(args.fixturePath, 'utf-8')) as PromptTurnInput[];

  mkdirSync(args.dumpDir, { recursive: true });

  console.log(`\nFixture: ${args.fixturePath} (${turns.length} turns)`);
  console.log(`Dump dir: ${args.dumpDir}`);
  console.log(`Runs per model: ${args.runs}`);
  console.log(`Latency SLO: ${args.sloMs}ms (runs over this are flagged ⚠slow)`);
  console.log('API keys:');
  for (const p of ['anthropic', 'openai', 'google'] as ProviderName[]) {
    console.log(`  ${p.padEnd(10)} ${apiKeys[p] ? 'set' : 'MISSING'}`);
  }

  const allModels = getAllModels().filter((m) => {
    if (args.modelFilter && m.id !== args.modelFilter) return false;
    if (args.providerFilter && m.provider !== args.providerFilter) return false;
    return true;
  });

  if (allModels.length === 0) {
    console.error('\nNo models matched the filters.');
    process.exit(2);
  }

  console.log(
    `\nRunning V2 extraction pipeline against ${allModels.length} model(s), ${args.runs} run(s) each:\n`
  );

  const results: RunResult[] = [];
  for (const m of allModels) {
    for (let run = 1; run <= args.runs; run += 1) {
      process.stdout.write(`  … ${m.provider}/${m.id} run ${run}/${args.runs}\n`);
      const r = await runOne(m.id, m.provider, run, turns, apiKeys, args.dumpDir);
      results.push(r);
      printRow(r, args.sloMs);
    }
  }

  console.log('\n=== Aggregate (per model) ===');
  const rows = aggregate(results, args.sloMs);
  for (const row of rows) {
    const rate = row.total > 0 ? `${row.ok}/${row.total}` : '0/0';
    const tag =
      row.ok === row.total && row.total > 0
        ? '✓'
        : row.skipped === row.total
          ? '-'
          : row.ok === 0
            ? '✗'
            : '~';
    const { medianMs, maxMs } = summarizeDurations(row.durationsMs);
    const latency = `med=${(medianMs / 1000).toFixed(1)}s max=${(maxMs / 1000).toFixed(1)}s`;
    const slowMarker = row.slowCount > 0 ? ` ⚠${row.slowCount}/${row.total} slow` : '';
    const detail =
      row.ok === row.total
        ? ''
        : row.firstFailure
          ? `${row.firstFailure.code}: ${row.firstFailure.message}`
          : '';
    console.log(
      `  ${tag} ${row.provider.padEnd(10)} ${row.modelId.padEnd(36)} ${rate.padStart(6)}  ${latency}${slowMarker}  ${detail}`
    );
  }

  const okCount = results.filter((r) => r.status === 'ok').length;
  const failCount = results.filter((r) => r.status === 'fail').length;
  const skipCount = results.filter((r) => r.status === 'skipped').length;
  console.log(
    `\nSummary: ${okCount}/${results.length} runs ok · ${failCount} failed · ${skipCount} skipped\n`
  );

  if (failCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Harness crashed:', err);
  process.exit(2);
});
