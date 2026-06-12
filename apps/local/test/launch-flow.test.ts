import { describe, expect, it } from 'vitest';
import {
  formatLaunchIntro,
  formatLaunchReady,
  runLaunchCommand,
  shouldConfirmLaunch,
} from '../src/commands/launch.js';

describe('local launch flow', () => {
  it('shows a branded first-run intro with the web URL and setup steps', () => {
    const intro = formatLaunchIntro({
      webUrl: 'http://localhost:3000',
      dataDir: '/tmp/t3x-data',
      runtimeInstalled: false,
      packageVersion: '0.5.0',
    });

    expect(intro).toContain('T3X Local v0.5.0');
    expect(intro).toContain('Version control for structured state.');
    expect(intro).toContain('Local alpha runtime');
    expect(intro).toContain('WebUI-first setup');
    expect(intro).toContain('\\____/');
    expect(intro).toContain('/    \\');
    expect(intro).toContain('Runtime: install required');
    expect(intro).toContain('WebUI:    http://localhost:3000');
    expect(intro).toContain('1. Check local runtime');
    expect(intro).toContain('5. Start API and WebUI');
    expect(intro).not.toContain('API:');
    expect(intro).not.toContain('\u001b[');
  });

  it('can render the launcher intro with ANSI color for interactive terminals', () => {
    const intro = formatLaunchIntro({
      webUrl: 'http://localhost:3000',
      dataDir: '/tmp/t3x-data',
      runtimeInstalled: true,
      packageVersion: '0.5.0',
      color: true,
    });

    expect(intro).toContain('T3X Local');
    expect(intro).toContain('v0.5.0');
    expect(intro).toContain('Version control for structured state.');
    expect(intro).toContain('\u001b[');
  });

  it('prompts for confirmation only for interactive non-yes launches', () => {
    expect(shouldConfirmLaunch({ yes: true, interactive: true })).toBe(false);
    expect(shouldConfirmLaunch({ yes: false, interactive: false })).toBe(false);
    expect(shouldConfirmLaunch({ yes: false, interactive: true })).toBe(true);
  });

  it('keeps the default ready output focused on the WebUI URL', () => {
    const ready = formatLaunchReady({
      webUrl: 'http://localhost:3000',
      apiUrl: 'http://localhost:8000',
      verbose: false,
    });

    expect(ready).toContain('T3X is ready: http://localhost:3000');
    expect(ready).not.toContain('http://localhost:8000');
  });

  it('shows API details only in verbose ready output', () => {
    const ready = formatLaunchReady({
      webUrl: 'http://localhost:3000',
      apiUrl: 'http://localhost:8000',
      verbose: true,
    });

    expect(ready).toContain('T3X is ready: http://localhost:3000');
    expect(ready).toContain('API: http://localhost:8000');
  });

  it('runs start, opens the fixture demo WebUI, and hides API details by default', async () => {
    const output: string[] = [];
    const startedWith: unknown[] = [];
    const openedUrls: string[] = [];

    await runLaunchCommand(
      {
        yes: true,
        open: true,
        verbose: false,
        packageVersion: '0.5.0',
        dataDir: '/tmp/t3x-data',
        apiPort: 8000,
        webPort: 3000,
      },
      {
        output: {
          write(chunk) {
            output.push(String(chunk));
          },
        },
        isInteractive: () => true,
        isRuntimeInstalled: () => true,
        promptConfirm: async () => true,
        ensureRuntimeInstalled: async () => undefined,
        start: async (options) => {
          startedWith.push(options);
          return {
            apiUrl: 'http://localhost:8000',
            webUrl: 'http://localhost:3000',
          };
        },
        openBrowser: async (url) => {
          openedUrls.push(url);
        },
      }
    );

    const text = output.join('');
    expect(text).toContain('T3X Local v0.5.0');
    expect(text).toContain('Version control for structured state.');
    expect(text).toContain('Runtime: installed');
    expect(text).toContain('T3X is ready: http://localhost:3000/chat?introDemo=1');
    expect(text).not.toContain('http://localhost:8000');
    expect(startedWith).toEqual([
      {
        dataDir: '/tmp/t3x-data',
        apiPort: 8000,
        webPort: 3000,
        verbose: false,
      },
    ]);
    expect(openedUrls).toEqual(['http://localhost:3000/chat?introDemo=1']);
  });

  it('asks before opening the WebUI during interactive launches', async () => {
    const output: string[] = [];
    const prompts: string[] = [];
    const openedUrls: string[] = [];
    const answers = [true, false];

    await runLaunchCommand(
      {
        yes: false,
        open: true,
        verbose: false,
        dataDir: '/tmp/t3x-data',
        apiPort: 8000,
        webPort: 3000,
      },
      {
        output: {
          write(chunk) {
            output.push(String(chunk));
          },
        },
        isInteractive: () => true,
        isRuntimeInstalled: () => true,
        promptConfirm: async (message) => {
          prompts.push(message);
          return answers.shift() ?? false;
        },
        start: async () => ({
          apiUrl: 'http://localhost:8000',
          webUrl: 'http://localhost:3000',
        }),
        openBrowser: async (url) => {
          openedUrls.push(url);
        },
      }
    );

    expect(prompts).toEqual(['Run setup now? Y/n ', 'Open WebUI in your browser? Y/n ']);
    expect(openedUrls).toEqual([]);
    expect(output.join('')).toContain('T3X is ready: http://localhost:3000/chat?introDemo=1');
  });

  it('refuses non-interactive launches unless --yes is provided', async () => {
    const output: string[] = [];
    let didStart = false;

    const result = await runLaunchCommand(
      {
        yes: false,
        open: true,
        verbose: false,
        dataDir: '/tmp/t3x-data',
        apiPort: 8000,
        webPort: 3000,
      },
      {
        output: {
          write(chunk) {
            output.push(String(chunk));
          },
        },
        isInteractive: () => false,
        isRuntimeInstalled: () => true,
        start: async () => {
          didStart = true;
          return {
            apiUrl: 'http://localhost:8000',
            webUrl: 'http://localhost:3000',
          };
        },
      }
    );

    expect(didStart).toBe(false);
    expect(result).toBe('needs-yes');
    expect(output.join('')).toContain('Run `t3x-local --yes` in non-interactive shells.');
  });

  it('keeps the runtime running and prints the WebUI URL if browser opening fails', async () => {
    const output: string[] = [];

    await runLaunchCommand(
      {
        yes: true,
        open: true,
        verbose: false,
        dataDir: '/tmp/t3x-data',
        apiPort: 8000,
        webPort: 3000,
      },
      {
        output: {
          write(chunk) {
            output.push(String(chunk));
          },
        },
        isInteractive: () => true,
        isRuntimeInstalled: () => true,
        start: async () => ({
          apiUrl: 'http://localhost:8000',
          webUrl: 'http://localhost:3000',
        }),
        openBrowser: async () => {
          throw new Error('open failed');
        },
      }
    );

    const text = output.join('');
    expect(text).toContain('Could not open WebUI automatically.');
    expect(text).toContain('http://localhost:3000/chat?introDemo=1');
    expect(text).toContain('T3X is ready: http://localhost:3000/chat?introDemo=1');
  });
});
