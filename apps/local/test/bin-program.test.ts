import { describe, expect, it } from 'vitest';
import packageJson from '../package.json' with { type: 'json' };
import { createLocalProgram, type LocalCliDependencies } from '../src/bin/t3x-local.js';
import type { LaunchCommandOptions, LaunchResult } from '../src/commands/launch.js';
import type { StartCommandOptions } from '../src/commands/start.js';

describe('t3x-local command parser', () => {
  it('keeps root launch options working without a subcommand', async () => {
    const calls = createCallRecorder();
    const program = createLocalProgram(calls.dependencies);

    await program.parseAsync([
      'node',
      't3x-local',
      '--yes',
      '--no-open',
      '--api-port',
      '8371',
      '--web-port',
      '3371',
      '--data-dir',
      '/tmp/t3x-data',
    ]);

    expect(calls.launch).toEqual({
      yes: true,
      open: false,
      apiPort: 8371,
      webPort: 3371,
      dataDir: '/tmp/t3x-data',
      packageVersion: packageJson.version,
    });
  });

  it('passes option values to subcommands that share root option names', async () => {
    const calls = createCallRecorder();
    const program = createLocalProgram(calls.dependencies);

    await program.parseAsync([
      'node',
      't3x-local',
      'doctor',
      '--api-port',
      '8371',
      '--web-port',
      '3371',
      '--data-dir',
      '/tmp/t3x-data',
    ]);

    expect(calls.doctor).toEqual({
      apiPort: 8371,
      webPort: 3371,
      dataDir: '/tmp/t3x-data',
    });
  });

  it('passes start options after the start subcommand', async () => {
    const calls = createCallRecorder();
    const program = createLocalProgram(calls.dependencies);

    await program.parseAsync([
      'node',
      't3x-local',
      'start',
      '--api-port',
      '8371',
      '--web-port',
      '3371',
      '--data-dir',
      '/tmp/t3x-data',
      '--verbose',
    ]);

    expect(calls.start).toEqual({
      apiPort: 8371,
      webPort: 3371,
      dataDir: '/tmp/t3x-data',
      verbose: true,
    });
  });
});

function createCallRecorder(): {
  dependencies: LocalCliDependencies;
  doctor?: unknown;
  launch?: unknown;
  start?: unknown;
} {
  const calls: {
    dependencies: LocalCliDependencies;
    doctor?: unknown;
    launch?: unknown;
    start?: unknown;
  } = {
    dependencies: {
      runDoctorCommand: async (options) => {
        calls.doctor = options;
      },
      runLaunchCommand: async (options: LaunchCommandOptions): Promise<LaunchResult> => {
        calls.launch = options;
        return 'launched';
      },
      runResetCommand: async () => undefined,
      runStartCommand: async (options: StartCommandOptions) => {
        calls.start = options;
        return {
          schemaVersion: 1,
          startedAt: new Date(0).toISOString(),
          dataDir: options.dataDir ?? '/tmp/t3x-data',
          apiPort: options.apiPort ?? 8000,
          webPort: options.webPort ?? 3000,
          apiPid: 1,
          webPid: 2,
          apiUrl: `http://localhost:${options.apiPort ?? 8000}`,
          webUrl: `http://localhost:${options.webPort ?? 3000}`,
          apiHealthUrl: `http://127.0.0.1:${options.apiPort ?? 8000}/health`,
          webHealthUrl: `http://127.0.0.1:${options.webPort ?? 3000}/health`,
          apiLogPath: '/tmp/t3x-api.log',
          webLogPath: '/tmp/t3x-web.log',
        };
      },
      runStopCommand: async () => undefined,
    },
  };

  return calls;
}
