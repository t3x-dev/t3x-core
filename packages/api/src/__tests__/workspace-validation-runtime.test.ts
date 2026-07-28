import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ESPHOME_CONFIG_FAILED_CODE,
  ESPHOME_CONFIG_STEP_ID,
  ESPHOME_OCI_IMAGE,
  LOCAL_OCI_PREFLIGHT_STEP_ID,
  type LocalOciCommandExecutor,
  type LocalOciCommandResult,
  OCI_RUNTIME_MISSING_CODE,
  runLocalEsphomeConfigValidation,
} from '../lib/workspace-validation/local-oci-provider';

describe('local OCI ESPHome validation provider', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), 't3x-esphome-test-'));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('returns environment_required when Docker and Podman are unavailable', async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const executor: LocalOciCommandExecutor = async (command, args) => {
      calls.push({ command, args });
      return commandResult({ exit_code: null, error: { code: 'ENOENT', message: 'not found' } });
    };

    const result = await runLocalEsphomeConfigValidation(
      { deviceYaml: 'esphome:\n  name: energy-meter\n' },
      { executor, tempRoot }
    );

    expect(calls).toEqual([
      { command: 'docker', args: ['info'] },
      { command: 'podman', args: ['info'] },
    ]);
    expect(result.status).toBe('environment_required');
    expect(result.gate_status).toBe('blocked');
    expect(result.environment_hash).toBeNull();
    expect(result.step).toMatchObject({
      step_id: LOCAL_OCI_PREFLIGHT_STEP_ID,
      status: 'environment_required',
      error_code: OCI_RUNTIME_MISSING_CODE,
    });
    expect(result.findings[0]).toMatchObject({
      code: OCI_RUNTIME_MISSING_CODE,
      message: 'Docker or Podman is required to run ESPHome validation.',
    });
  });

  it('runs esphome config in Docker and returns a passed result', async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const executor: LocalOciCommandExecutor = async (command, args) => {
      calls.push({ command, args });
      if (command === 'docker' && args[0] === 'info') return commandResult({ exit_code: 0 });
      if (command === 'docker' && args[0] === 'run') {
        await expectMountedDeviceYaml(args, 'esphome:\n  name: energy-meter\n');
        return commandResult({ exit_code: 0, stdout: 'INFO Configuration is valid!\n' });
      }
      return commandResult({ exit_code: 1, stderr: 'unexpected command' });
    };

    const result = await runLocalEsphomeConfigValidation(
      { deviceYaml: 'esphome:\n  name: energy-meter\n' },
      { executor, tempRoot }
    );

    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({
      command: 'docker',
      args: [
        'run',
        '--rm',
        '--network',
        'none',
        '-v',
        expect.stringContaining(':/config:ro'),
        ESPHOME_OCI_IMAGE,
        'esphome',
        'config',
        '/config/device.yaml',
      ],
    });
    expect(result.status).toBe('passed');
    expect(result.gate_status).toBe('ready');
    expect(result.step).toMatchObject({
      step_id: ESPHOME_CONFIG_STEP_ID,
      status: 'passed',
      exit_code: 0,
      command_json: ['esphome', 'config', '/config/device.yaml'],
      log_excerpt: 'INFO Configuration is valid!',
    });
    expect(result.findings).toEqual([]);
    expect(result.environment_hash).toMatch(/^sha256:/);
  });

  it('returns a failed result with bounded ESPHome evidence when config exits nonzero', async () => {
    const executor: LocalOciCommandExecutor = async (command, args) => {
      if (command === 'docker' && args[0] === 'info') return commandResult({ exit_code: 0 });
      if (command === 'docker' && args[0] === 'run') {
        return commandResult({
          exit_code: 1,
          stderr: [
            'Failed config',
            '',
            'sensor: [source /config/device.yaml:42]',
            '  server_registers is not a valid option for modbus.',
            '',
          ].join('\n'),
        });
      }
      return commandResult({ exit_code: 1, stderr: 'unexpected command' });
    };

    const result = await runLocalEsphomeConfigValidation(
      { deviceYaml: 'sensor:\n  - platform: modbus_controller\n' },
      { executor, tempRoot }
    );

    expect(result.status).toBe('failed');
    expect(result.gate_status).toBe('blocked');
    expect(result.step).toMatchObject({
      step_id: ESPHOME_CONFIG_STEP_ID,
      status: 'failed',
      error_code: ESPHOME_CONFIG_FAILED_CODE,
      exit_code: 1,
      command_json: ['esphome', 'config', '/config/device.yaml'],
      log_excerpt: expect.stringContaining('server_registers is not a valid option'),
      log_truncated: false,
    });
    expect(result.findings[0]).toMatchObject({
      severity: 'error',
      file: 'device.yaml',
      line: 42,
      code: ESPHOME_CONFIG_FAILED_CODE,
      message: 'Failed config',
      log_excerpt: expect.stringContaining('sensor: [source /config/device.yaml:42]'),
    });
  });
});

function commandResult(input: Partial<LocalOciCommandResult>): LocalOciCommandResult {
  return {
    exit_code: Object.hasOwn(input, 'exit_code') ? (input.exit_code ?? null) : 0,
    stdout: input.stdout ?? '',
    stderr: input.stderr ?? '',
    timed_out: input.timed_out,
    output_truncated: input.output_truncated,
    error: input.error,
  };
}

async function expectMountedDeviceYaml(args: string[], expectedYaml: string) {
  const volumeIndex = args.indexOf('-v');
  expect(volumeIndex).toBeGreaterThan(-1);
  const volume = args[volumeIndex + 1];
  expect(volume.endsWith(':/config:ro')).toBe(true);

  const configDir = volume.slice(0, -':/config:ro'.length);
  await expect(readFile(path.join(configDir, 'device.yaml'), 'utf8')).resolves.toBe(expectedYaml);
}
