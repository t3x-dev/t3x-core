/**
 * YOps Commands
 *
 * Validate and inspect YOps scripts.
 */

import * as fs from 'node:fs';
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
  const yops = program
    .command('yops')
    .description('Apply, validate, and inspect YOps scripts');

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
          data?: { ok: boolean; applied: number; error?: { op_index: number; code: string; message: string } };
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
    .command('log')
    .description('Show YOps history for a conversation')
    .requiredOption('-c, --conversation <id>', 'Conversation ID')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const baseUrl = getApiUrl();
      try {
        const response = await fetch(
          `${baseUrl}/v1/conversations/${options.conversation}/yops`,
          { headers: buildHeaders() }
        );

        const json = (await response.json()) as {
          success: boolean;
          data?: Array<{ source: string; created_at: string; yops: Array<Record<string, unknown>> }>;
          error?: { code: string; message: string };
        };

        if (!response.ok || !json.success) {
          const err = json.error ?? { code: 'UNKNOWN', message: 'Unknown error' };
          error(`Request failed: ${err.code} — ${err.message}`);
          process.exit(1);
        }

        const entries = json.data ?? [];

        if (options.json) {
          console.log(JSON.stringify(entries, null, 2));
          return;
        }

        if (!Array.isArray(entries) || entries.length === 0) {
          info('No YOps history found.');
          return;
        }

        for (const entry of entries) {
          console.log(`\n— ${entry.source} (${entry.created_at})`);
          for (const op of entry.yops) {
            const name = Object.keys(op)[0];
            console.log(`  ${name}: ${summarizeOp(op)}`);
          }
        }
      } catch (e: unknown) {
        error(`Request failed: ${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
      }
    });
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
