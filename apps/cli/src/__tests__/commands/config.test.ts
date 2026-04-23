import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

import { Command } from 'commander';
import { registerConfigCommands } from '../../commands/config.js';

function createProgram() {
  const program = new Command();
  program.exitOverride();
  const configCmd = program.command('config');
  registerConfigCommands(configCmd);
  return program;
}

describe('config commands', () => {
  const originalApiKey = process.env.T3X_API_KEY;
  const originalApiUrl = process.env.T3X_API_URL;
  const originalConfigPath = process.env.T3X_CONFIG_PATH;

  let tempDir: string;
  let configPath: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = mkdtempSync(path.join(os.tmpdir(), 't3x-cli-config-'));
    configPath = path.join(tempDir, 'config.json');
    process.env.T3X_CONFIG_PATH = configPath;
    delete process.env.T3X_API_KEY;
    delete process.env.T3X_API_URL;
  });

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.T3X_API_KEY;
    else process.env.T3X_API_KEY = originalApiKey;

    if (originalApiUrl === undefined) delete process.env.T3X_API_URL;
    else process.env.T3X_API_URL = originalApiUrl;

    if (originalConfigPath === undefined) delete process.env.T3X_CONFIG_PATH;
    else process.env.T3X_CONFIG_PATH = originalConfigPath;

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('stores api url with config set api-url', async () => {
    const program = createProgram();
    await program.parseAsync([
      'node',
      'test',
      'config',
      'set',
      'api-url',
      'http://127.0.0.1:8100/api',
    ]);

    const stored = JSON.parse(readFileSync(configPath, 'utf8')) as { api_url: string };
    expect(stored.api_url).toBe('http://127.0.0.1:8100/api');
  });

  it('shows resolved config state as json', async () => {
    const program = createProgram();
    await program.parseAsync([
      'node',
      'test',
      'config',
      'set',
      'api-url',
      'http://127.0.0.1:8100/api',
    ]);

    process.env.T3X_API_KEY = 't3xk_env_override';
    const logSpy = vi.spyOn(console, 'log');

    await program.parseAsync(['node', 'test', 'config', 'show', '--json']);

    const output = logSpy.mock.calls.at(-1)?.[0];
    expect(typeof output).toBe('string');
    const parsed = JSON.parse(String(output)) as {
      api_url: string;
      api_url_source: string;
      api_key_present: boolean;
      api_key_source: string;
    };

    expect(parsed.api_url).toBe('http://127.0.0.1:8100/api');
    expect(parsed.api_url_source).toBe('file');
    expect(parsed.api_key_present).toBe(true);
    expect(parsed.api_key_source).toBe('env');
  });
});
