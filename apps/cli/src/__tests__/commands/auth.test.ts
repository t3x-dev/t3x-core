import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});
const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

import { Command } from 'commander';
import { registerAuthCommands } from '../../commands/auth.js';

function createProgram() {
  const program = new Command();
  program.exitOverride();
  const authCmd = program.command('auth');
  registerAuthCommands(authCmd);
  return program;
}

describe('auth commands', () => {
  const originalApiKey = process.env.T3X_API_KEY;
  const originalApiUrl = process.env.T3X_API_URL;
  const originalConfigPath = process.env.T3X_CONFIG_PATH;

  let tempDir: string;
  let configPath: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = mkdtempSync(path.join(os.tmpdir(), 't3x-cli-auth-'));
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

  it('stores a shared api key with auth use-key', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'test', 'auth', 'use-key', 't3xk_local_test_key']);

    const stored = JSON.parse(readFileSync(configPath, 'utf8')) as { api_key: string };
    expect(stored.api_key).toBe('t3xk_local_test_key');
    expect(mockExit).not.toHaveBeenCalled();
  });

  it('reports env key as the active auth source', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'test', 'auth', 'use-key', 't3xk_file_key']);
    process.env.T3X_API_KEY = 't3xk_env_override';

    const logSpy = vi.spyOn(console, 'log');
    await program.parseAsync(['node', 'test', 'auth', 'status']);

    const lines = logSpy.mock.calls.map((call) => String(call[0]));
    expect(lines.some((line) => line.includes('Source:') && line.includes('env'))).toBe(true);
    expect(lines.some((line) => line.includes('Configured:') && line.includes('yes'))).toBe(true);
  });

  it('clears only the stored api key on auth logout', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'test', 'auth', 'use-key', 't3xk_local_test_key']);

    const initial = JSON.parse(readFileSync(configPath, 'utf8')) as { api_url?: string };
    initial.api_url = 'http://127.0.0.1:9000/api';
    writeFileSync(configPath, `${JSON.stringify(initial, null, 2)}\n`, 'utf8');

    await program.parseAsync(['node', 'test', 'auth', 'logout']);

    const stored = JSON.parse(readFileSync(configPath, 'utf8')) as {
      api_url?: string;
      api_key?: string;
    };
    expect(stored.api_url).toBe('http://127.0.0.1:9000/api');
    expect(stored.api_key).toBeUndefined();
  });

  it('reports when the target api does not require a key', async () => {
    const program = createProgram();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const logSpy = vi.spyOn(console, 'log');

    await program.parseAsync(['node', 'test', 'auth', 'check']);

    const lines = logSpy.mock.calls.map((call) => String(call[0]));
    expect(lines.some((line) => line.includes('AUTH_NOT_REQUIRED'))).toBe(true);
    expect(lines.some((line) => line.includes('does not currently require a key'))).toBe(true);
  });
});
