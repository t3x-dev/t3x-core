import { describe, expect, it, vi } from 'vitest';
import { multiRoundGenerate } from '../../leaf/multi-round-generate';
import type { LLMProvider } from '../../llm/types';
import type { CommitV4, Leaf } from '../../types/v4';

function makeMockLLM(responses: string[]): LLMProvider {
  let callIndex = 0;
  return {
    id: 'mock',
    generate: vi.fn(async () => {
      const response = responses[callIndex] ?? responses[responses.length - 1];
      callIndex++;
      return response;
    }),
    resolveConflict: vi.fn().mockResolvedValue(''),
  };
}

const commit: CommitV4 = {
  hash: 'sha256:test',
  schema: 't3x/commit/v4',
  parents: [],
  author: { type: 'human', name: 'test' },
  committed_at: new Date().toISOString(),
  content: {
    sentences: [
      { id: 's_1', text: 'User prefers dark mode for coding.' },
      { id: 's_2', text: 'OAuth 2.0 is the auth standard.' },
    ],
  },
  project_id: 'proj_test',
  message: 'test',
  branch: 'main',
};

const leaf: Leaf = {
  id: 'leaf_test',
  commit_hash: 'sha256:test',
  type: 'tweet',
  title: 'Test Tweet',
  constraints: [
    { id: 'cst_1', type: 'require', match_mode: 'exact', value: 'dark mode' },
  ],
  config: {},
  output: null,
  assertions: null,
  project_id: 'proj_test',
  created_at: new Date().toISOString(),
};

describe('multiRoundGenerate', () => {
  it('executes all rounds and returns final output', async () => {
    const llm = makeMockLLM([
      'Draft: I love dark mode and OAuth 2.0',
      'Refined: Dark mode is great for coding with OAuth 2.0',
      'Final: Experience dark mode coding with secure OAuth 2.0 auth',
    ]);

    const result = await multiRoundGenerate({
      commit,
      leaf,
      provider: llm,
      rounds: [
        { name: 'draft', instruction: 'Write a first draft.' },
        { name: 'refine', instruction: 'Improve clarity and tone.' },
        { name: 'polish', instruction: 'Final polish for publication.' },
      ],
    });

    expect(result.output).toContain('dark mode');
    expect(result.rounds).toHaveLength(3);
    expect(result.rounds[0].name).toBe('draft');
    expect(result.rounds[2].name).toBe('polish');
    expect(llm.generate).toHaveBeenCalledTimes(3);
  });

  it('exits early when earlyExit returns true', async () => {
    const llm = makeMockLLM([
      'Perfect output with dark mode on first try',
      'Should not reach this',
    ]);

    const result = await multiRoundGenerate({
      commit,
      leaf,
      provider: llm,
      rounds: [
        { name: 'draft', instruction: 'Write it.' },
        { name: 'refine', instruction: 'Improve it.' },
      ],
      earlyExit: (output) => output.includes('dark mode'),
    });

    expect(result.output).toContain('dark mode');
    expect(result.rounds).toHaveLength(1);
    expect(llm.generate).toHaveBeenCalledTimes(1);
  });

  it('works with single round', async () => {
    const llm = makeMockLLM(['Single round dark mode output']);

    const result = await multiRoundGenerate({
      commit,
      leaf,
      provider: llm,
      rounds: [{ name: 'generate', instruction: 'Write the tweet.' }],
    });

    expect(result.output).toBe('Single round dark mode output');
    expect(result.rounds).toHaveLength(1);
  });

  it('passes previous output to subsequent rounds', async () => {
    const llm: LLMProvider = {
      id: 'mock',
      generate: vi.fn(async (prompt: string) => {
        if (prompt.includes('Previous output:')) {
          return 'Refined version';
        }
        return 'Initial draft';
      }),
      resolveConflict: vi.fn().mockResolvedValue(''),
    };

    const result = await multiRoundGenerate({
      commit,
      leaf,
      provider: llm,
      rounds: [
        { name: 'draft', instruction: 'Write it.' },
        { name: 'refine', instruction: 'Improve it.' },
      ],
    });

    expect(result.rounds[1].output).toBe('Refined version');
    expect(llm.generate).toHaveBeenCalledTimes(2);
    // Second call should include previous output
    const secondCallPrompt = (llm.generate as any).mock.calls[1][0];
    expect(secondCallPrompt).toContain('Previous output:');
    expect(secondCallPrompt).toContain('Initial draft');
  });
});
