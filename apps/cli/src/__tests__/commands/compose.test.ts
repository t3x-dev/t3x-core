import { execFileSync } from 'node:child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyDockerCompose } from '../../commands/compose.js';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

const mockedExecFileSync = vi.mocked(execFileSync);

describe('verifyDockerCompose', () => {
  beforeEach(() => {
    mockedExecFileSync.mockReset();
  });

  it.each([
    '/tmp/compose file.yml',
    '/tmp/compose"file.yml',
    "/tmp/compose'file.yml",
    '/tmp/compose; touch should-not-run.yml',
    '/tmp/compose$(touch should-not-run).yml',
    '/tmp/compose`touch should-not-run`.yml',
  ])('passes a hostile path as one literal argument: %s', (file) => {
    verifyDockerCompose(file);

    expect(mockedExecFileSync).toHaveBeenCalledOnce();
    expect(mockedExecFileSync).toHaveBeenCalledWith('docker', ['compose', '-f', file, 'config'], {
      shell: false,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
  });
});
