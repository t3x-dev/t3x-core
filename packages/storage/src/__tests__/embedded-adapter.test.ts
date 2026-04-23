import { beforeEach, describe, expect, it, vi } from 'vitest';

const socketHandlers = new Map<string, () => void>();
const embeddedStart = vi.fn();
const embeddedInitialise = vi.fn();
const embeddedCreateDatabase = vi.fn();
const embeddedCtor = vi.fn();
const createPostgresStorage = vi.fn();
const closePostgresStorage = vi.fn();

vi.mock('node:net', () => ({
  default: {
    Socket: class MockSocket {
      setTimeout() {}

      once(event: string, handler: () => void) {
        socketHandlers.set(event, handler);
      }

      destroy() {}

      connect() {
        const handler = socketHandlers.get('error');
        if (handler) {
          const error = Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
          (handler as (error: Error) => void)(error);
        }
      }
    },
  },
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn((file: string) => file.endsWith('pnpm-workspace.yaml')),
    readFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}));

vi.mock('embedded-postgres', () => ({
  default: class MockEmbeddedPostgres {
    constructor(...args: unknown[]) {
      embeddedCtor(...args);
    }

    initialise = embeddedInitialise;
    start = embeddedStart;
    createDatabase = embeddedCreateDatabase;
    getPgClient = vi.fn();
    stop = vi.fn();
  },
}));

vi.mock('../adapters/postgres', () => ({
  createPostgresStorage,
  closePostgresStorage,
}));

describe('createEmbeddedStorage', () => {
  beforeEach(() => {
    socketHandlers.clear();
    embeddedCtor.mockReset();
    embeddedInitialise.mockReset();
    embeddedStart.mockReset();
    embeddedCreateDatabase.mockReset();
    createPostgresStorage.mockReset();
    closePostgresStorage.mockReset();
  });

  it('fails safely when port probing is blocked by EPERM', async () => {
    const { createEmbeddedStorage } = await import('../adapters/embedded.js');

    await expect(createEmbeddedStorage({ dataDir: '.t3x/pg-data', port: 5445 })).rejects.toThrow(
      /EPERM|operation not permitted|blocked/i
    );

    expect(embeddedCtor).not.toHaveBeenCalled();
    expect(embeddedInitialise).not.toHaveBeenCalled();
    expect(embeddedStart).not.toHaveBeenCalled();
    expect(createPostgresStorage).not.toHaveBeenCalled();
  });
});
