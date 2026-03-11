/**
 * CLI Status Commands Tests
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockClient = {
  health: vi.fn(),
  status: vi.fn(),
};

vi.mock('@t3x-dev/api-client', () => ({
  createClient: vi.fn(() => mockClient),
}));

const mockSpinner = { start: vi.fn(), stop: vi.fn(), succeed: vi.fn(), fail: vi.fn() };
vi.mock('ora', () => ({
  default: vi.fn(() => mockSpinner),
}));

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});
const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

import { Command } from 'commander';
import { registerStatusCommands } from '../../commands/status.js';

function createProgram() {
  const program = new Command();
  program.exitOverride();
  registerStatusCommands(program);
  return program;
}

describe('registerStatusCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('health', () => {
    it('shows healthy status', async () => {
      mockClient.health.mockResolvedValue({
        status: 'ok',
        service: 't3x-api',
        timestamp: '2024-01-01T00:00:00Z',
        database: { connected: true, latency_ms: 5 },
      });

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'health']);

      expect(mockClient.health).toHaveBeenCalled();
      expect(mockSpinner.stop).toHaveBeenCalled();
    });

    it('shows unhealthy status', async () => {
      mockClient.health.mockResolvedValue({
        status: 'error',
        service: 't3x-api',
        timestamp: '2024-01-01T00:00:00Z',
        database: { connected: false },
      });

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'health']);

      expect(mockSpinner.stop).toHaveBeenCalled();
    });

    it('handles missing database info', async () => {
      mockClient.health.mockResolvedValue({
        status: 'ok',
        service: 't3x-api',
        timestamp: '2024-01-01T00:00:00Z',
      });

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'health']);

      expect(mockSpinner.stop).toHaveBeenCalled();
    });

    it('handles error', async () => {
      mockClient.health.mockRejectedValue(new Error('Connection refused'));

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'health']);

      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('status', () => {
    it('shows status info', async () => {
      mockClient.status.mockResolvedValue({
        version: '1.0.0',
        environment: 'development',
        uptime_seconds: 3600,
        database: { type: 'pglite', connected: true },
      });

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'status']);

      expect(mockClient.status).toHaveBeenCalled();
      expect(mockSpinner.stop).toHaveBeenCalled();
    });

    it('handles error', async () => {
      mockClient.status.mockRejectedValue(new Error('Timeout'));

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'status']);

      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });
});
