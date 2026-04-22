import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCreateMcpServer,
  mockConnect,
  mockConsoleError,
  mockProcessExit,
  stdioTransportInstances,
} = vi.hoisted(() => ({
  mockCreateMcpServer: vi.fn(),
  mockConnect: vi.fn(() => Promise.resolve()),
  mockConsoleError: vi.fn(),
  mockProcessExit: vi.fn((code?: number) => {
    throw new Error(`process.exit:${code ?? 0}`);
  }),
  stdioTransportInstances: [] as unknown[],
}));

vi.mock('@t3x-dev/mcp-lib', () => ({
  createMcpServer: (...args: unknown[]) => mockCreateMcpServer(...args),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: class MockStdioServerTransport {
    constructor() {
      stdioTransportInstances.push(this);
    }
  },
}));

describe('apps/mcp entrypoint', () => {
  const originalToolsets = process.env.T3X_TOOLSETS;
  const originalTransport = process.env.T3X_TRANSPORT;
  const originalConsoleError = console.error;
  const originalProcessExit = process.exit;

  beforeEach(() => {
    vi.resetModules();
    mockCreateMcpServer.mockReset();
    mockConnect.mockReset();
    mockConnect.mockResolvedValue(undefined);
    mockConsoleError.mockReset();
    mockProcessExit.mockReset();
    stdioTransportInstances.length = 0;

    mockCreateMcpServer.mockReturnValue({
      server: {
        connect: mockConnect,
      },
    });

    console.error = mockConsoleError;
    process.exit = mockProcessExit as typeof process.exit;
    delete process.env.T3X_TOOLSETS;
    delete process.env.T3X_TRANSPORT;
  });

  afterEach(() => {
    if (originalToolsets !== undefined) {
      process.env.T3X_TOOLSETS = originalToolsets;
    } else {
      delete process.env.T3X_TOOLSETS;
    }

    if (originalTransport !== undefined) {
      process.env.T3X_TRANSPORT = originalTransport;
    } else {
      delete process.env.T3X_TRANSPORT;
    }

    console.error = originalConsoleError;
    process.exit = originalProcessExit;
  });

  it('defaults to the core toolset over stdio', async () => {
    await import('../index.ts');

    expect(mockCreateMcpServer).toHaveBeenCalledWith({ toolsets: ['core'] });
    expect(stdioTransportInstances).toHaveLength(1);
    expect(mockConnect).toHaveBeenCalledWith(stdioTransportInstances[0]);
  });

  it('parses multiple toolsets from T3X_TOOLSETS', async () => {
    process.env.T3X_TOOLSETS = 'core, advanced';

    await import('../index.ts');

    expect(mockCreateMcpServer).toHaveBeenCalledWith({ toolsets: ['core', 'advanced'] });
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('fails fast for unsupported http transport', async () => {
    process.env.T3X_TRANSPORT = 'http';

    await expect(import('../index.ts')).rejects.toThrow('process.exit:1');

    expect(mockCreateMcpServer).toHaveBeenCalledWith({ toolsets: ['core'] });
    expect(mockConnect).not.toHaveBeenCalled();
    expect(mockConsoleError).toHaveBeenCalledWith(
      'HTTP transport not yet implemented. Use stdio.'
    );
  });

  it('fails fast for unknown transports', async () => {
    process.env.T3X_TRANSPORT = 'websocket';

    await expect(import('../index.ts')).rejects.toThrow('process.exit:1');

    expect(mockConnect).not.toHaveBeenCalled();
    expect(mockConsoleError).toHaveBeenCalledWith(
      'Unknown transport: websocket. Use "stdio" or "http".'
    );
  });
});
