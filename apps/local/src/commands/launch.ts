import { spawnSync } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline/promises';
import { Chalk } from 'chalk';
import { resolveStartOptions } from '../runtime/env.js';
import { getLocalPaths, getMissingStartArtifacts } from '../runtime/paths.js';
import { buildIntroDemoUrl } from '../runtime/urls.js';
import { runStartCommand, type StartProgressEvent } from './start.js';

const PRODUCT_TAGLINE = 'Version control for structured state.';
type TerminalColor = InstanceType<typeof Chalk>;

export interface LaunchIntroInput {
  webUrl: string;
  dataDir: string;
  runtimeInstalled: boolean;
  packageVersion?: string;
  color?: boolean;
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

export type SetupProgressStatus = 'running' | 'done' | 'skipped' | 'failed';

export interface SetupProgressInput {
  current: number;
  total: number;
  label: string;
  status: SetupProgressStatus;
  detail?: string;
}

export interface LaunchCommandOptions {
  yes?: boolean;
  open?: boolean;
  verbose?: boolean;
  packageVersion?: string;
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
  isTTY?: boolean;
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
  const color = new Chalk({ level: input.color ? 1 : 0 });
  const logo = formatTerminalLogo(color, input.color === true);
  const version = `v${input.packageVersion ?? '0.0.0'}`;
  const runtimeStatus = input.runtimeInstalled
    ? color.green('installed')
    : color.yellow('install required');

  return [
    `${color.bold('T3X Local')} ${color.dim(version)}`,
    PRODUCT_TAGLINE,
    '',
    `${logo[0]}   ${color.bold('Local alpha runtime')}`,
    `${logo[1]}   ${color.dim('WebUI-first setup')}`,
    `${logo[2]}   Runtime: ${runtimeStatus}`,
    `${logo[3]}   WebUI:    ${input.webUrl}`,
    `             Data:     ${input.dataDir}`,
    '',
    color.bold('Setup'),
    `  ${color.cyan('1.')} Check local runtime`,
    `  ${color.cyan('2.')} Download runtime assets if needed`,
    `  ${color.cyan('3.')} Verify package integrity`,
    `  ${color.cyan('4.')} Prepare local data directory`,
    `  ${color.cyan('5.')} Start API and WebUI`,
    `  ${color.cyan('6.')} Ask to open T3X in your browser`,
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

export function formatSetupProgressLine(input: SetupProgressInput): string {
  const detail = input.detail ? ` (${input.detail})` : '';
  return `[t3x-local] [${input.current}/${input.total}] ${input.label}: ${input.status}${detail}`;
}

export async function runLaunchCommand(
  input: LaunchCommandOptions = {},
  dependencies: LaunchDependencies = {}
): Promise<LaunchResult> {
  const output = dependencies.output ?? process.stdout;
  const paths = getLocalPaths();
  const options = resolveStartOptions(input, paths, process.env);
  const webUrl = buildIntroDemoUrl(`http://localhost:${options.webPort}`);
  const runtimeInstalled =
    dependencies.isRuntimeInstalled?.() ?? getMissingStartArtifacts(paths).length === 0;

  output.write(
    `${formatLaunchIntro({
      webUrl,
      dataDir: options.dataDir,
      runtimeInstalled,
      packageVersion: input.packageVersion,
      color: shouldUseColor(output),
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

  output.write('Setup progress\n');
  writeSetupProgressLine(output, {
    current: 1,
    total: 6,
    label: 'Check local runtime',
    status: 'done',
  });

  if (!runtimeInstalled) {
    writeSetupProgressLine(output, {
      current: 2,
      total: 6,
      label: 'Download runtime assets if needed',
      status: 'running',
    });

    try {
      await (dependencies.ensureRuntimeInstalled?.() ?? ensureRuntimeInstalled());
      writeSetupProgressLine(output, {
        current: 2,
        total: 6,
        label: 'Download runtime assets if needed',
        status: 'done',
      });
    } catch (error) {
      writeSetupProgressLine(output, {
        current: 2,
        total: 6,
        label: 'Download runtime assets if needed',
        status: 'failed',
      });
      throw error;
    }
  } else {
    writeSetupProgressLine(output, {
      current: 2,
      total: 6,
      label: 'Download runtime assets if needed',
      status: 'skipped',
      detail: 'already installed',
    });
  }

  let runtimeState: LaunchRuntimeState;
  if (dependencies.start) {
    writeSetupProgressLine(output, {
      current: 3,
      total: 6,
      label: 'Verify package integrity',
      status: 'running',
    });
    writeSetupProgressLine(output, {
      current: 3,
      total: 6,
      label: 'Verify package integrity',
      status: 'done',
    });
    writeSetupProgressLine(output, {
      current: 4,
      total: 6,
      label: 'Prepare local data directory',
      status: 'running',
    });
    writeSetupProgressLine(output, {
      current: 4,
      total: 6,
      label: 'Prepare local data directory',
      status: 'done',
    });
    writeSetupProgressLine(output, {
      current: 5,
      total: 6,
      label: 'Start API and WebUI',
      status: 'running',
    });

    try {
      runtimeState = await dependencies.start({
        dataDir: input.dataDir,
        apiPort: input.apiPort,
        webPort: input.webPort,
        verbose: input.verbose === true,
      });
      writeSetupProgressLine(output, {
        current: 5,
        total: 6,
        label: 'Start API and WebUI',
        status: 'done',
      });
    } catch (error) {
      writeSetupProgressLine(output, {
        current: 5,
        total: 6,
        label: 'Start API and WebUI',
        status: 'failed',
      });
      throw error;
    }
  } else {
    runtimeState = await runStartCommand(
      {
        dataDir: input.dataDir,
        apiPort: input.apiPort,
        webPort: input.webPort,
        verbose: input.verbose === true,
      },
      {
        onProgress: (event) => writeStartProgressLine(output, event),
      }
    );
  }

  const openWebUrl = buildIntroDemoUrl(runtimeState.webUrl);

  if (input.open !== false) {
    writeSetupProgressLine(output, {
      current: 6,
      total: 6,
      label: 'Ask to open T3X in your browser',
      status: 'running',
    });

    const shouldOpen =
      yes ||
      !interactive ||
      ((await dependencies.promptConfirm?.('Open WebUI in your browser? Y/n ')) ??
        (await promptConfirm('Open WebUI in your browser? Y/n ')));

    if (shouldOpen) {
      try {
        await (dependencies.openBrowser?.(openWebUrl) ?? openBrowser(openWebUrl));
        writeSetupProgressLine(output, {
          current: 6,
          total: 6,
          label: 'Ask to open T3X in your browser',
          status: 'done',
        });
        output.write('Opened WebUI.\n\n');
      } catch {
        writeSetupProgressLine(output, {
          current: 6,
          total: 6,
          label: 'Ask to open T3X in your browser',
          status: 'failed',
          detail: 'manual open required',
        });
        output.write(`Could not open WebUI automatically. Open ${openWebUrl}\n\n`);
      }
    } else {
      writeSetupProgressLine(output, {
        current: 6,
        total: 6,
        label: 'Ask to open T3X in your browser',
        status: 'skipped',
        detail: 'user declined',
      });
    }
  } else {
    writeSetupProgressLine(output, {
      current: 6,
      total: 6,
      label: 'Ask to open T3X in your browser',
      status: 'skipped',
      detail: 'disabled',
    });
  }

  output.write(
    `${formatLaunchReady({
      webUrl: openWebUrl,
      apiUrl: runtimeState.apiUrl,
      verbose: input.verbose === true,
    })}\n`
  );
  return 'launched';
}

function writeStartProgressLine(output: LaunchOutput, event: StartProgressEvent): void {
  const step = getStartProgressStep(event.phase);
  writeSetupProgressLine(output, {
    ...step,
    total: 6,
    status: event.status,
  });
}

function getStartProgressStep(phase: StartProgressEvent['phase']): {
  current: number;
  label: string;
} {
  switch (phase) {
    case 'verify':
      return { current: 3, label: 'Verify package integrity' };
    case 'prepare':
      return { current: 4, label: 'Prepare local data directory' };
    case 'start':
      return { current: 5, label: 'Start API and WebUI' };
  }
}

function writeSetupProgressLine(output: LaunchOutput, input: SetupProgressInput): void {
  output.write(`${formatSetupProgressLine(input)}\n`);
}

function isInteractiveTerminal(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

function shouldUseColor(output: LaunchOutput): boolean {
  if (process.env.NO_COLOR) return false;
  return output.isTTY === true;
}

function formatTerminalLogo(color: TerminalColor, unicode: boolean): string[] {
  const shell = color.dim;
  const orange = color.hex('#FB923C');
  const blue = color.hex('#2563EB');

  if (unicode) {
    return [
      `  ${shell('╭────────╮')}`,
      `  ${shell('│')} ${orange('╲____')}${blue('╱')} ${shell('│')}`,
      `  ${shell('│')} ${blue('╱    ')}${orange('╲')} ${shell('│')}`,
      `  ${shell('╰────────╯')}`,
    ];
  }

  return [
    `  ${shell('.--------.')}`,
    `  ${shell('|')} ${orange('\\____')}${blue('/')} ${shell('|')}`,
    `  ${shell('|')} ${blue('/    ')}${orange('\\')} ${shell('|')}`,
    `  ${shell("'--------'")}`,
  ];
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
