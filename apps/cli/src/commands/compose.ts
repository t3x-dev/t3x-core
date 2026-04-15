/**
 * `t3x compose` — build and verify docker-compose.yml from a YAML tree.
 *
 *   t3x compose verify <compose.yml>            — run `docker compose config` on a file
 *   t3x compose preview <tree.yaml> [-o out]    — yschema-validate, emit, verify
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import { homedir } from 'node:os';
import * as path from 'node:path';
import { emitDockerCompose } from '@t3x-dev/core';
import { applyYOps } from '@t3x-dev/yops';
import { buildFixPlan, parseSchema, validateSchema } from '@t3x-dev/yschema';
import type { Command } from 'commander';
import YAML from 'yaml';
import { error, info, success, warn } from '../utils.js';

const SCHEMA_CANDIDATES = [
  path.join(
    process.cwd(),
    'node_modules',
    '@t3x-dev',
    'yschema',
    'examples',
    'docker-compose.yschema.yaml',
  ),
  path.join(
    process.cwd(),
    'packages',
    'yschema',
    'examples',
    'docker-compose.yschema.yaml',
  ),
];

function loadComposeSchema(): string {
  for (const p of SCHEMA_CANDIDATES) {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  }
  throw new Error(
    `docker-compose.yschema.yaml not found. Tried:\n  ${SCHEMA_CANDIDATES.join('\n  ')}`,
  );
}

function previewDir(): string {
  const dir = path.join(homedir(), '.t3x', 'compose-preview');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function registerComposeCommands(program: Command): void {
  const compose = program
    .command('compose')
    .description('Docker Compose from a YAML tree');

  compose
    .command('verify <file>')
    .description('Run `docker compose config` on a compose file')
    .action((file: string) => {
      if (!fs.existsSync(file)) {
        error(`file not found: ${file}`);
        process.exit(2);
      }
      try {
        execSync(`docker compose -f ${JSON.stringify(file)} config`, {
          stdio: ['ignore', 'ignore', 'pipe'],
        });
        success(`OK: ${file} is valid per docker compose config`);
      } catch (e) {
        const stderr = (e as { stderr?: Buffer }).stderr?.toString() ?? String(e);
        error('docker compose config failed:');
        process.stderr.write(stderr);
        process.exit(1);
      }
    });

  compose
    .command('preview <tree>')
    .description(
      'Validate a YAML tree with yschema, emit preview compose, optionally verify',
    )
    .option('-o, --out <path>', 'Write output to this path instead of the preview dir')
    .option('--no-verify', 'Skip the docker compose config step')
    .action((treeFile: string, opts: { out?: string; verify?: boolean }) => {
      if (!fs.existsSync(treeFile)) {
        error(`tree file not found: ${treeFile}`);
        process.exit(2);
      }
      const treeRaw = fs.readFileSync(treeFile, 'utf8');
      let tree = YAML.parse(treeRaw) as Record<string, unknown>;

      let schema;
      try {
        schema = parseSchema(loadComposeSchema());
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
        process.exit(1);
      }

      const result = validateSchema(tree, schema);
      const byTier = {
        error: result.violations.filter((v) => v.severity === 'error'),
        warn: result.violations.filter((v) => v.severity === 'warn'),
        info: result.violations.filter((v) => v.severity === 'info'),
      };

      if (byTier.error.length > 0) {
        error('Schema errors (blocking):');
        for (const v of byTier.error) {
          process.stderr.write(`  - [${v.code}] ${v.message}\n`);
        }
        process.exit(1);
      }

      if (byTier.warn.length > 0) {
        warn('Warnings — please confirm before shipping:');
        for (const v of byTier.warn) {
          process.stderr.write(`  - [${v.code}] ${v.message}\n`);
        }
      }

      if (byTier.info.length > 0) {
        const plan = buildFixPlan({ violations: byTier.info, valid: true });
        if (plan.ops.length > 0) {
          const applyResult = applyYOps(tree, plan.ops);
          if (applyResult.ok) {
            tree = applyResult.doc as Record<string, unknown>;
          }
          info(`Applied ${plan.fixes_count} style default(s).`);
        }
      }

      const outYaml = emitDockerCompose(tree);
      const outPath =
        opts.out ?? path.join(previewDir(), `compose-${Date.now()}.yml`);
      fs.writeFileSync(outPath, outYaml);
      info(`Preview written: ${outPath}`);

      if (opts.verify !== false) {
        try {
          execSync(`docker compose -f ${JSON.stringify(outPath)} config`, {
            stdio: ['ignore', 'ignore', 'pipe'],
          });
          success('docker compose config: OK');
        } catch (e) {
          const stderr = (e as { stderr?: Buffer }).stderr?.toString() ?? String(e);
          error('docker compose config failed:');
          process.stderr.write(stderr);
          process.exit(1);
        }
      }

      info('Review the file, then approve by copying it to your target location.');
    });
}
