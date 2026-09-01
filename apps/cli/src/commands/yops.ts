/**
 * YOps Commands
 *
 * Validate and inspect YOps scripts.
 */

import * as fs from 'node:fs';
import type { TransitionProtocolValue } from '@t3x-dev/api-client';
import type { Command } from 'commander';
import YAML from 'yaml';
import { error, getApiKey, getApiUrl, info, readStdin, success } from '../utils.js';

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = getApiKey();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

export function registerYopsCommands(program: Command): void {
  const yops = program.command('yops').description('Apply, validate, and inspect YOps scripts');

  yops
    .command('validate')
    .description('Validate YOps without applying (dry-run)')
    .option('-f, --file <path>', 'YOps YAML file')
    .option('--stdin', 'Read from stdin')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const yamlText = await readYOpsInput(options);
      const ops = parseYOps(yamlText);
      if (!ops) return;

      const baseUrl = getApiUrl();
      try {
        const response = await fetch(`${baseUrl}/v1/yops/validate`, {
          method: 'POST',
          headers: buildHeaders(),
          body: JSON.stringify({
            trees: [{ key: 'root', slots: {}, children: [], source: {} }],
            relations: [],
            yops: ops,
          }),
        });

        const json = (await response.json()) as {
          success: boolean;
          data?: {
            ok: boolean;
            applied: number;
            error?: { op_index: number; code: string; message: string };
          };
          error?: { code: string; message: string };
        };

        if (!response.ok || !json.success) {
          const err = json.error ?? { code: 'UNKNOWN', message: 'Unknown error' };
          error(`Request failed: ${err.code} — ${err.message}`);
          process.exit(1);
        }

        const data = json.data!;

        if (options.json) {
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        if (data.ok) {
          success(`Valid — ${data.applied} operation${data.applied !== 1 ? 's' : ''} would apply`);
        } else {
          const err = data.error!;
          error(`\nError at op ${err.op_index + 1}:`);
          error(`  ${err.code} — ${err.message}`);
          process.exit(1);
        }
      } catch (e: unknown) {
        error(`Request failed: ${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
      }
    });

  yops
    .command('apply <workspace-id>')
    .description('Compatibility alias: propose YOps through Transition authority')
    .requiredOption('-p, --project <id>', 'Project ID')
    .requiredOption('--request-id <id>', 'Idempotency key')
    .option('-f, --file <path>', 'YOps YAML file')
    .option('--stdin', 'Read from stdin')
    .option('--if-revision <n>', 'Expected Workspace revision')
    .option('--why <text>', 'Concise rationale')
    .option('--json', 'Output as JSON')
    .action(async (workspaceId: string, options) => {
      const { getClientWithAuth } = await import('../utils.js');
      const yamlText = await readYOpsInput(options);
      const ops = parseYOps(yamlText);
      if (!ops) return;

      try {
        const revision = options.ifRevision === undefined ? undefined : Number(options.ifRevision);
        if (revision !== undefined && (!Number.isInteger(revision) || revision < 1)) {
          throw new Error('--if-revision must be a positive integer');
        }
        const result = await getClientWithAuth().proposeTransition(options.project, {
          kind: 'structured_yops',
          request_id: options.requestId,
          workspace_id: workspaceId,
          operations: ops as TransitionProtocolValue[],
          ...(revision === undefined ? {} : { if_revision: revision }),
          ...(options.why ? { why: options.why } : {}),
        });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        success('Proposed Transition');
        console.log(JSON.stringify(result, null, 2));
      } catch (e: unknown) {
        error(`Proposal failed: ${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
      }
    });

  yops
    .command('log')
    .description('Show archived YOps evidence for a source thread')
    .requiredOption('-p, --project <id>', 'Project ID')
    .requiredOption('-c, --conversation <id>', 'Source thread ID')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const { getClientWithAuth } = await import('../utils.js');
      try {
        const evidence = await getClientWithAuth().sourceThreads.legacyYOpsEvidence(
          options.project,
          options.conversation,
          { order: 'asc', archivedOnly: true }
        );
        const entries = evidence.items;

        if (options.json) {
          console.log(JSON.stringify(evidence, null, 2));
          return;
        }

        if (entries.length === 0) {
          info('No archived YOps evidence found.');
          return;
        }

        for (const entry of entries) {
          console.log(`\n— ${entry.source} (${entry.created_at}) [${entry.lifecycle.status}]`);
          for (const op of normalizeYOps(entry.yops)) {
            const name = Object.keys(op)[0] ?? 'unknown';
            console.log(`  ${name}: ${summarizeOp(op)}`);
          }
        }
      } catch (e: unknown) {
        error(`Request failed: ${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
      }
    });
}

function normalizeYOps(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null && !Array.isArray(item)
    );
  }
  if (typeof value === 'object' && value !== null && 'yops' in value) {
    return normalizeYOps((value as { yops: unknown }).yops);
  }
  return [];
}

async function readYOpsInput(options: { file?: string; stdin?: boolean }): Promise<string> {
  if (options.file) return fs.readFileSync(options.file, 'utf-8');
  if (options.stdin) return readStdin();
  error('Provide --file or --stdin');
  process.exit(1);
}

function parseYOps(yamlText: string): unknown[] | null {
  try {
    const doc = YAML.parse(yamlText) as { yops?: unknown[] } | null;
    if (!doc?.yops || !Array.isArray(doc.yops)) {
      error('Expected YAML document with "yops" array');
      process.exit(1);
    }
    return doc.yops;
  } catch (e: unknown) {
    error(`YAML parse error: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

function summarizeOp(op: Record<string, unknown>): string {
  const [name] = Object.keys(op);
  const data = op[name];
  if (!data || typeof data !== 'object') return '';
  const d = data as Record<string, unknown>;
  if (d.path) return String(d.path);
  if (d.key) return `${d.parent ?? '(root)'}/${d.key}`;
  return '';
}
