/**
 * `t3x compose` — build and verify docker-compose.yml from a YAML tree.
 *
 *   t3x compose verify <compose.yml>            — run `docker compose config` on a file
 *   t3x compose preview <tree.yaml> [-o out]    — emit preview compose, optionally verify
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import { homedir } from 'node:os';
import * as path from 'node:path';
import { emitDockerCompose } from '@t3x-dev/core';
import type { Command } from 'commander';
import YAML from 'yaml';
import { error, info, success } from '../utils.js';

function previewDir(): string {
  const dir = path.join(homedir(), '.t3x', 'compose-preview');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function registerComposeCommands(program: Command): void {
  const compose = program.command('compose').description('Docker Compose from a YAML tree');

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
    .description('Emit preview compose from a YAML tree, optionally verify')
    .option('-o, --out <path>', 'Write output to this path instead of the preview dir')
    .option('--no-verify', 'Skip the docker compose config step')
    .action((treeFile: string, opts: { out?: string; verify?: boolean }) => {
      if (!fs.existsSync(treeFile)) {
        error(`tree file not found: ${treeFile}`);
        process.exit(2);
      }
      const treeRaw = fs.readFileSync(treeFile, 'utf8');
      const tree = YAML.parse(treeRaw) as unknown;
      if (!tree || typeof tree !== 'object' || Array.isArray(tree)) {
        error('tree file must contain a YAML mapping');
        process.exit(1);
      }
      const outYaml = emitDockerCompose(tree as Record<string, unknown>);
      const outPath = opts.out ?? path.join(previewDir(), `compose-${Date.now()}.yml`);
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
