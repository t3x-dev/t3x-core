import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@t3x-dev/api-client', () => ({
  createClient: vi.fn(() => ({
    extract: vi.fn().mockResolvedValue({
      conversation_id: 'conv_test',
      draft_id: 'draft_test',
      trees: [{ key: 's_0', slots: { text: 'Test tree node' }, children: [] }],
    }),
    check: vi.fn().mockResolvedValue({ passed: true, violations: [] }),
    context: vi.fn().mockResolvedValue({
      commit_hash: 'sha256:abc',
      branch: 'main',
      trees: [],
    }),
    generateLeaf: vi.fn().mockResolvedValue({ output: 'Generated text' }),
    commitFromDraft: vi
      .fn()
      .mockResolvedValue({ commit_hash: 'sha256:def', tree_count: 3, branch: 'main' }),
    listProjects: vi.fn().mockResolvedValue({
      projects: [{ id: 'proj_1', name: 'Test Project', description: 'A test', commit_count: 3 }],
      total: 1,
    }),
    createProject: vi.fn().mockResolvedValue({
      id: 'proj_new',
      name: 'New Project',
      description: 'Created',
    }),
    getDraft: vi.fn().mockResolvedValue({
      id: 'draft_test',
      nodes: [{ key: 'budget', slots: { amount: { value: '$5000' } }, children: [] }],
      revision: 3,
      status: 'editing',
    }),
    applyYOps: vi.fn().mockResolvedValue({
      draft_id: 'draft_test',
      revision: 4,
      trees: [{ key: 'budget', slots: { amount: { value: '$6000' } }, children: [] }],
      applied_count: 1,
      tree_count: 1,
      slot_count: 1,
    }),
    listCommits: vi.fn().mockResolvedValue({
      commits: [{ hash: 'sha256:abc', message: 'test', branch: 'main' }],
      total: 1,
    }),
    twoWayDiff: vi.fn().mockResolvedValue({
      changes: [{ type: 'added', path: 'budget' }],
      stats: { added: 1, removed: 0, modified: 0 },
    }),
    createBranch: vi.fn().mockResolvedValue({ name: 'experiment', head_hash: 'sha256:abc' }),
    switchBranch: vi.fn().mockResolvedValue({ name: 'experiment' }),
    listBranches: vi.fn().mockResolvedValue({
      branches: [{ name: 'main' }, { name: 'experiment' }],
    }),
    deleteProject: vi.fn().mockResolvedValue(undefined),
    listLeaves: vi.fn().mockResolvedValue({
      leaves: [{ id: 'leaf_1', type: 'tweet', title: 'Test leaf' }],
    }),
    createLeaf: vi.fn().mockResolvedValue({
      id: 'leaf_new',
      type: 'tweet',
      title: 'New leaf',
      commit_hash: 'sha256:abc',
    }),
    getCommit: vi.fn().mockResolvedValue({
      hash: 'sha256:abc',
      message: 'test commit',
      trees: [{ key: 'budget', slots: { amount: '$5000' }, children: [] }],
      parents: [],
      branch: 'main',
    }),
    prepareMerge: vi.fn().mockResolvedValue({
      autoKept: [{ text: 'shared item' }],
      conflicts: [],
      onlyInSource: [],
      onlyInTarget: [],
    }),
    executeMerge: vi.fn().mockResolvedValue({
      commit_hash: 'sha256:merged',
      message: 'Merge complete',
    }),
    listConversations: vi.fn().mockResolvedValue({
      conversations: [{ conversation_id: 'conv_1', title: 'Test' }],
      total: 1,
    }),
    createConversation: vi.fn().mockResolvedValue({
      conversation_id: 'conv_new',
      project_id: 'proj_1',
      title: 'New conv',
    }),
    getLeaf: vi.fn().mockResolvedValue({
      id: 'leaf_1',
      type: 'tweet',
      title: 'Test leaf',
      constraints: [],
      output: 'Generated output',
    }),
    deleteLeaf: vi.fn().mockResolvedValue(undefined),
    getProject: vi.fn().mockResolvedValue({
      id: 'proj_1',
      name: 'Test Project',
      description: 'A test',
      commit_count: 3,
      conversation_count: 2,
    }),
    listDrafts: vi.fn().mockResolvedValue({
      drafts: [{ id: 'draft_1', status: 'editing', revision: 2 }],
      total: 1,
    }),
    deleteDraft: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { handleCheck } from '../tools/check.js';
import { handleCommit } from '../tools/commit.js';
import { handleCreateBranch } from '../tools/create-branch.js';
import { handleCreateConversation } from '../tools/create-conversation.js';
import { handleCreateLeaf } from '../tools/create-leaf.js';
import { handleCreateProject } from '../tools/create-project.js';
import { handleDeleteDraft } from '../tools/delete-draft.js';
import { handleDeleteLeaf } from '../tools/delete-leaf.js';
import { handleDeleteProject } from '../tools/delete-project.js';
import { handleDiff } from '../tools/diff.js';
import { handleEditDraft } from '../tools/edit-draft.js';
import { handleExtract } from '../tools/extract.js';
import { handleGenerate } from '../tools/generate.js';
import { handleListBranches } from '../tools/list-branches.js';
import { handleListCommits } from '../tools/list-commits.js';
import { handleListConversations } from '../tools/list-conversations.js';
import { handleListDrafts } from '../tools/list-drafts.js';
import { handleListLeaves } from '../tools/list-leaves.js';
import { handleListProjects } from '../tools/list-projects.js';
import { handleMergeExecute } from '../tools/merge-execute.js';
import { handleMergePrepare } from '../tools/merge-prepare.js';
import { handleShow } from '../tools/show.js';
import { handleShowCommit } from '../tools/show-commit.js';
import { handleShowDraft } from '../tools/show-draft.js';
import { handleShowLeaf } from '../tools/show-leaf.js';
import { handleShowProject } from '../tools/show-project.js';

beforeEach(() => {
  // Reset the singleton client between tests so each test gets a fresh mock
  vi.resetModules();
});

describe('handleExtract', () => {
  it('returns extraction result with conversation_id, draft_id, and trees', async () => {
    const result = await handleExtract({ project_id: 'proj_test', text: 'Hello world' });
    const data = JSON.parse(result.content[0].text);

    expect(data.conversation_id).toBe('conv_test');
    expect(data.draft_id).toBe('draft_test');
    expect(Array.isArray(data.trees)).toBe(true);
    expect(data.trees[0].key).toBe('s_0');
  });
});

describe('handleCommit', () => {
  it('returns commit result with commit_hash, tree_count, and branch', async () => {
    const result = await handleCommit({
      project_id: 'proj_test',
      draft_id: 'draft_test',
      message: 'Initial commit',
    });
    const data = JSON.parse(result.content[0].text);

    expect(data.commit_hash).toBe('sha256:def');
    expect(data.tree_count).toBe(3);
    expect(data.branch).toBe('main');
  });
});

describe('handleCheck', () => {
  it('returns check result with passed flag and violations array', async () => {
    const result = await handleCheck({ project_id: 'proj_test', text: 'Some text to validate' });
    const data = JSON.parse(result.content[0].text);

    expect(data.passed).toBe(true);
    expect(Array.isArray(data.violations)).toBe(true);
    expect(data.violations).toHaveLength(0);
  });
});

describe('handleGenerate', () => {
  it('returns generated output text', async () => {
    const result = await handleGenerate({ leaf_id: 'leaf_test' });
    const data = JSON.parse(result.content[0].text);

    expect(data.output).toBe('Generated text');
  });
});

describe('handleShow', () => {
  it('returns context with commit_hash, branch, and trees', async () => {
    const result = await handleShow({ project_id: 'proj_test' });
    const data = JSON.parse(result.content[0].text);

    expect(data.commit_hash).toBe('sha256:abc');
    expect(data.branch).toBe('main');
    expect(Array.isArray(data.trees)).toBe(true);
  });
});

describe('handleListProjects', () => {
  it('returns project list', async () => {
    const result = await handleListProjects({});
    const data = JSON.parse(result.content[0].text);
    expect(data.projects).toHaveLength(1);
    expect(data.projects[0].id).toBe('proj_1');
  });
});

describe('handleCreateProject', () => {
  it('creates project and returns result', async () => {
    const result = await handleCreateProject({ name: 'New Project' });
    const data = JSON.parse(result.content[0].text);
    expect(data.id).toBe('proj_new');
    expect(data.name).toBe('New Project');
  });
});

describe('handleShowDraft', () => {
  it('returns draft with nodes and revision', async () => {
    const result = await handleShowDraft({ draft_id: 'draft_test' });
    const data = JSON.parse(result.content[0].text);
    expect(data.nodes).toBeDefined();
    expect(data.revision).toBe(3);
    expect(data.status).toBe('editing');
  });
});

describe('handleEditDraft', () => {
  it('applies YOps and returns updated result', async () => {
    const result = await handleEditDraft({
      draft_id: 'draft_test',
      yops: [
        { set: { path: 'budget/amount', value: '$6000', source: 'make it $6000', from: 'T7' } },
      ],
      if_revision: 3,
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.applied_count).toBe(1);
    expect(data.revision).toBe(4);
  });
});

describe('handleListCommits', () => {
  it('returns commits list with total', async () => {
    const result = await handleListCommits({ project_id: 'proj_test' });
    const data = JSON.parse(result.content[0].text);
    expect(data.commits).toHaveLength(1);
    expect(data.commits[0].hash).toBe('sha256:abc');
    expect(data.total).toBe(1);
  });
});

describe('handleDiff', () => {
  it('returns diff with changes and stats', async () => {
    const result = await handleDiff({
      source_hash: 'sha256:aaa',
      target_hash: 'sha256:bbb',
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.changes).toHaveLength(1);
    expect(data.changes[0].type).toBe('added');
    expect(data.stats.added).toBe(1);
  });
});

describe('handleCreateBranch', () => {
  it('creates branch and returns result', async () => {
    const result = await handleCreateBranch({
      project_id: 'proj_test',
      name: 'experiment',
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.name).toBe('experiment');
    expect(data.head_hash).toBe('sha256:abc');
  });
});

describe('handleListBranches', () => {
  it('returns all branches', async () => {
    const result = await handleListBranches({ project_id: 'proj_test' });
    const data = JSON.parse(result.content[0].text);
    expect(data.branches).toHaveLength(2);
    expect(data.branches[0].name).toBe('main');
    expect(data.branches[1].name).toBe('experiment');
  });
});

describe('handleDeleteProject', () => {
  it('deletes project and returns confirmation', async () => {
    const result = await handleDeleteProject({ project_id: 'proj_test' });
    const data = JSON.parse(result.content[0].text);
    expect(data.deleted).toBe(true);
  });
});

describe('handleListLeaves', () => {
  it('returns leaves list', async () => {
    const result = await handleListLeaves({ project_id: 'proj_test' });
    const data = JSON.parse(result.content[0].text);
    expect(data.leaves).toHaveLength(1);
  });
});

describe('handleCreateLeaf', () => {
  it('creates leaf and returns result', async () => {
    const result = await handleCreateLeaf({
      project_id: 'proj_test',
      commit_hash: 'sha256:abc',
      type: 'tweet',
      title: 'Test',
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.id).toBe('leaf_new');
  });
});

describe('handleShowProject', () => {
  it('returns project details with stats', async () => {
    const result = await handleShowProject({ project_id: 'proj_1' });
    const data = JSON.parse(result.content[0].text);
    expect(data.id).toBe('proj_1');
    expect(data.name).toBe('Test Project');
    expect(data.commit_count).toBe(3);
  });
});

describe('handleListDrafts', () => {
  it('returns drafts list with total', async () => {
    const result = await handleListDrafts({ project_id: 'proj_test' });
    const data = JSON.parse(result.content[0].text);
    expect(data.drafts).toHaveLength(1);
    expect(data.drafts[0].id).toBe('draft_1');
    expect(data.total).toBe(1);
  });
});

describe('handleDeleteDraft', () => {
  it('deletes draft and returns confirmation', async () => {
    const result = await handleDeleteDraft({ draft_id: 'draft_1' });
    const data = JSON.parse(result.content[0].text);
    expect(data.deleted).toBe(true);
    expect(data.draft_id).toBe('draft_1');
  });
});

describe('handleShowCommit', () => {
  it('returns commit content with trees', async () => {
    const result = await handleShowCommit({ hash: 'sha256:abc' });
    const data = JSON.parse(result.content[0].text);
    expect(data.hash).toBe('sha256:abc');
    expect(data.trees).toHaveLength(1);
  });
});

describe('handleMergePrepare', () => {
  it('returns merge analysis', async () => {
    const result = await handleMergePrepare({
      source_hash: 'sha256:aaa',
      target_hash: 'sha256:bbb',
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.autoKept).toBeDefined();
    expect(data.conflicts).toBeDefined();
  });
});

describe('handleMergeExecute', () => {
  it('executes merge and returns commit', async () => {
    const result = await handleMergeExecute({
      source_hash: 'sha256:aaa',
      target_hash: 'sha256:bbb',
      prepared: {},
      decisions: {},
      message: 'Merge test',
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.commit_hash).toBe('sha256:merged');
  });
});

describe('handleListConversations', () => {
  it('returns conversations list', async () => {
    const result = await handleListConversations({ project_id: 'proj_test' });
    const data = JSON.parse(result.content[0].text);
    expect(data.conversations).toHaveLength(1);
  });
});

describe('handleCreateConversation', () => {
  it('creates conversation', async () => {
    const result = await handleCreateConversation({ project_id: 'proj_test' });
    const data = JSON.parse(result.content[0].text);
    expect(data.conversation_id).toBe('conv_new');
  });
});

describe('handleShowLeaf', () => {
  it('returns leaf details', async () => {
    const result = await handleShowLeaf({ leaf_id: 'leaf_1' });
    const data = JSON.parse(result.content[0].text);
    expect(data.id).toBe('leaf_1');
    expect(data.type).toBe('tweet');
    expect(data.output).toBe('Generated output');
  });
});

describe('handleDeleteLeaf', () => {
  it('deletes leaf and returns confirmation', async () => {
    const result = await handleDeleteLeaf({ leaf_id: 'leaf_1' });
    const data = JSON.parse(result.content[0].text);
    expect(data.deleted).toBe(true);
    expect(data.leaf_id).toBe('leaf_1');
  });
});

// Local-only tools (no API client mock needed, they import from @t3x-dev/core)
describe('handleSchema', () => {
  it('returns JSON schema object', async () => {
    const { handleSchema: handler } = await import('../tools/schema.js');
    const result = await handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data).toBeDefined();
    expect(typeof data).toBe('object');
  });
});

describe('handleValidate', () => {
  it('returns validation result for valid content', async () => {
    const { handleValidate: handler } = await import('../tools/validate.js');
    const result = await handler({
      content: { trees: [], relations: [] },
    });
    const data = JSON.parse(result.content[0].text);
    expect(data).toBeDefined();
  });
});

