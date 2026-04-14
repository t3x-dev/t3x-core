import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockClient = {
  listDrafts: vi.fn(),
  getDraft: vi.fn(),
  deleteDraft: vi.fn(),
};

vi.mock('@t3x-dev/api-client', () => ({
  createClient: vi.fn(() => mockClient),
}));

const mockSpinner = { start: vi.fn(), stop: vi.fn(), succeed: vi.fn(), fail: vi.fn() };
vi.mock('ora', () => ({ default: vi.fn(() => mockSpinner) }));

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});
vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

import { Command } from 'commander';
import { registerListDrafts, registerShowDraft } from '../../commands/drafts.js';

function createProgram() {
  const program = new Command();
  program.exitOverride();
  const listCmd = program.command('list');
  registerListDrafts(listCmd);
  return program;
}

describe('list drafts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls client.listDrafts with project id', async () => {
    mockClient.listDrafts.mockResolvedValue({
      drafts: [
        {
          draft_id: 'draft_1',
          project_id: 'proj_1',
          conversation_id: 'conv_1',
          bridge_id: 'b_1',
          intent: 'test',
          status: 'active',
          created_at: '2026-04-12T14:23:01Z',
          metadata: null,
        },
      ],
      limit: 20,
      offset: 0,
    });

    const program = createProgram();
    await program.parseAsync(['node', 'test', 'list', 'drafts', '--project', 'proj_1']);

    expect(mockClient.listDrafts).toHaveBeenCalledWith('proj_1', { limit: 20, offset: 0 });
  });

  it('prints "No drafts found." when empty', async () => {
    mockClient.listDrafts.mockResolvedValue({ drafts: [], limit: 20, offset: 0 });
    const logSpy = vi.spyOn(console, 'log');

    const program = createProgram();
    await program.parseAsync(['node', 'test', 'list', 'drafts', '--project', 'proj_empty']);

    expect(logSpy).toHaveBeenCalledWith('No drafts found.');
  });
});

describe('show draft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.T3X_DRAFT;
  });

  it('fetches draft by positional id', async () => {
    mockClient.getDraft.mockResolvedValue({
      draft_id: 'draft_abc',
      project_id: 'proj_1',
      conversation_id: 'conv_1',
      status: 'active',
      revision: 5,
      created_at: '2026-04-12T14:23:01Z',
      trees: [],
    });

    const program = new Command();
    program.exitOverride();
    const showCmd = program.command('show');
    registerShowDraft(showCmd);

    await program.parseAsync(['node', 'test', 'show', 'draft', 'draft_abc']);

    expect(mockClient.getDraft).toHaveBeenCalledWith('draft_abc');
  });

  it('falls back to T3X_DRAFT env', async () => {
    process.env.T3X_DRAFT = 'draft_env';
    mockClient.getDraft.mockResolvedValue({
      draft_id: 'draft_env',
      project_id: 'p',
      conversation_id: 'c',
      status: 'active',
      revision: 1,
      created_at: '2026-04-12T14:23:01Z',
      trees: [],
    });

    const program = new Command();
    program.exitOverride();
    const showCmd = program.command('show');
    registerShowDraft(showCmd);

    await program.parseAsync(['node', 'test', 'show', 'draft']);

    expect(mockClient.getDraft).toHaveBeenCalledWith('draft_env');
  });
});
