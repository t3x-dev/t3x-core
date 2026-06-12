import { spawnSync } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline/promises';
import { resolveStartOptions } from '../runtime/env.js';
import { getLocalPaths, getMissingStartArtifacts } from '../runtime/paths.js';
import { runStartCommand } from './start.js';

export interface LaunchIntroInput {
  webUrl: string;
  dataDir: string;
  runtimeInstalled: boolean;
}

export interface LaunchConfirmInput {
  yes: boolean;
  interactive: boolean;
}

export interface LaunchReadyInput {
  webUrl: string;
  apiUrl: string;
  verbose: boolean;
}

export interface LaunchCommandOptions {
  yes?: boolean;
  open?: boolean;
  verbose?: boolean;
  dataDir?: string;
  apiPort?: number;
  webPort?: number;
}

export interface LaunchRuntimeState {
  apiUrl: string;
  webUrl: string;
}

export interface LaunchStartOptions {
  dataDir?: string;
  apiPort?: number;
  webPort?: number;
  verbose?: boolean;
}

export interface LaunchOutput {
  write(chunk: string): void;
}

export interface LaunchDependencies {
  output?: LaunchOutput;
  isInteractive?: () => boolean;
  isRuntimeInstalled?: () => boolean;
  promptConfirm?: (message: string) => Promise<boolean>;
  ensureRuntimeInstalled?: () => Promise<void>;
  start?: (options: LaunchStartOptions) => Promise<LaunchRuntimeState>;
  openBrowser?: (url: string) => Promise<void>;
}

export type LaunchResult = 'launched' | 'cancelled' | 'needs-yes';

export function formatLaunchIntro(input: LaunchIntroInput): string {
  return [
    '+-----+',
    '| T3X |',
    '+-----+',
    '',
    'T3X Local',
    '',
    'Set up and launch T3X on this machine.',
    '',
    `Runtime: ${input.runtimeInstalled ? 'installed' : 'install required'}`,
    `WebUI:    ${input.webUrl}`,
    `Data:     ${input.dataDir}`,
    '',
    'Steps:',
    '1. Check local runtime',
    '2. Download runtime assets if needed',
    '3. Verify package integrity',
    '4. Prepare local data directory',
    '5. Start API and WebUI',
    '6. Ask to open T3X in your browser',
  ].join('\n');
}

export function shouldConfirmLaunch(input: LaunchConfirmInput): boolean {
  return input.interactive && !input.yes;
}

export function formatLaunchReady(input: LaunchReadyInput): string {
  const lines = [`T3X is ready: ${input.webUrl}`];

  if (input.verbose) {
    lines.push(`API: ${input.apiUrl}`);
  }

  return lines.join('\n');
}

export async function runLaunchCommand(
  input: LaunchCommandOptions = {},
  dependencies: LaunchDependencies = {}
): Promise<LaunchResult> {
  const output = dependencies.output ?? process.stdout;
  const paths = getLocalPaths();
  const options = resolveStartOptions(input, paths, process.env);
  const webUrl = `http://localhost:${options.webPort}`;
  const runtimeInstalled =
    dependencies.isRuntimeInstalled?.() ?? getMissingStartArtifacts(paths).length === 0;

  output.write(
    `${formatLaunchIntro({
      webUrl,
      dataDir: options.dataDir,
      runtimeInstalled,
    })}\n\n`
  );

  const yes = input.yes === true;
  const interactive = dependencies.isInteractive?.() ?? isInteractiveTerminal();

  if (!interactive && !yes) {
    output.write('Run `t3x-local --yes` in non-interactive shells.\n');
    return 'needs-yes';
  }

  if (shouldConfirmLaunch({ yes, interactive })) {
    const confirmed =
      (await dependencies.promptConfirm?.('Run setup now? Y/n ')) ??
      (await promptConfirm('Run setup now? Y/n '));

    if (!confirmed) {
      output.write('Setup cancelled.\n');
      return 'cancelled';
    }
  }

  if (!runtimeInstalled) {
    output.write('Installing runtime assets...\n');
    await (dependencies.ensureRuntimeInstalled?.() ?? ensureRuntimeInstalled());
  }

  const runtimeState =
    (await dependencies.start?.({
      dataDir: input.dataDir,
      apiPort: input.apiPort,
      webPort: input.webPort,
      verbose: input.verbose === true,
    })) ??
    (await runStartCommand({
      dataDir: input.dataDir,
      apiPort: input.apiPort,
      webPort: input.webPort,
      verbose: input.verbose === true,
    }));

  if (input.open !== false) {
    const shouldOpen =
      yes ||
      !interactive ||
      ((await dependencies.promptConfirm?.('Open WebUI in your browser? Y/n ')) ??
        (await promptConfirm('Open WebUI in your browser? Y/n ')));

    if (shouldOpen) {
      try {
        await (dependencies.openBrowser?.(runtimeState.webUrl) ?? openBrowser(runtimeState.webUrl));
        output.write('Opened WebUI.\n\n');
      } catch {
        output.write(`Could not open WebUI automatically. Open ${runtimeState.webUrl}\n\n`);
      }
    }
  }

  output.write(
    `${formatLaunchReady({
      webUrl: runtimeState.webUrl,
      apiUrl: runtimeState.apiUrl,
      verbose: input.verbose === true,
    })}\n`
  );
  return 'launched';
}

function isInteractiveTerminal(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

async function promptConfirm(message: string): Promise<boolean> {
  const prompt = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = (await prompt.question(message)).trim().toLowerCase();
    return answer === '' || answer === 'y' || answer === 'yes';
  } finally {
    prompt.close();
  }
}

async function ensureRuntimeInstalled(): Promise<void> {
  const paths = getLocalPaths();
  if (paths.runtimeSource !== 'installed') {
    return;
  }

  const scriptPath = path.join(paths.packageDir, 'scripts', 'postinstall-download.mjs');
  const result = spawnSync(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      T3X_LOCAL_DOWNLOAD_PREFIX: 't3x-local:setup',
    },
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(
      `[t3x-local] Runtime install failed with exit code ${String(result.status ?? 'unknown')}`
    );
  }
}

async function openBrowser(url: string): Promise<void> {
  const command = getOpenCommand(url);
  const result = spawnSync(command.command, command.args, {
    stdio: 'ignore',
  });

  if (result.status !== 0) {
    throw new Error(`[t3x-local] Failed to open browser for ${url}`);
  }
}

function getOpenCommand(url: string): { command: string; args: string[] } {
  if (process.platform === 'darwin') {
    return { command: 'open', args: [url] };
  }

  if (process.platform === 'win32') {
    return { command: 'cmd', args: ['/c', 'start', '', url] };
  }

  return { command: 'xdg-open', args: [url] };
}
