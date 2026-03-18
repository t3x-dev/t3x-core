import { describe, expect, it, vi } from 'vitest';
import {
  buildRound1Prompt,
  buildRound2Prompt,
  buildRound3Prompt,
  modeGenerate,
  multiRoundGenerate,
  validateConstraintsSimple,
} from '../../leaf/multi-round-generate';
import type { LLMProvider } from '../../llm/types';
import type { CommitV4, Leaf } from '../../types/v4';

function makeMockLLM(responses: string[]): LLMProvider {
  let callIndex = 0;
  return {
    id: 'mock',
    generate: vi.fn(async () => {
      const response = responses[callIndex] ?? responses[responses.length - 1];
      callIndex++;
      return { text: response, usage: { inputTokens: 10, outputTokens: 5 } };
    }),
    resolveConflict: vi
      .fn()
      .mockResolvedValue({ text: '', usage: { inputTokens: 0, outputTokens: 0 } }),
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
  constraints: [{ id: 'cst_1', type: 'require', match_mode: 'exact', value: 'dark mode' }],
  config: {},
  output: null,
  assertions: null,
  project_id: 'proj_test',
  created_at: new Date().toISOString(),
};

// ═══════════════════════════════════════════════════════════════════════════
// multiRoundGenerate (Custom Rounds)
// ═══════════════════════════════════════════════════════════════════════════

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
    expect(result.total_rounds).toBe(3);
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
          return { text: 'Refined version', usage: { inputTokens: 10, outputTokens: 5 } };
        }
        return { text: 'Initial draft', usage: { inputTokens: 10, outputTokens: 5 } };
      }),
      resolveConflict: vi
        .fn()
        .mockResolvedValue({ text: '', usage: { inputTokens: 0, outputTokens: 0 } }),
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
    const secondCallPrompt = (llm.generate as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(secondCallPrompt).toContain('Previous output:');
    expect(secondCallPrompt).toContain('Initial draft');
  });

  it('includes constraint validation in round results', async () => {
    const llm = makeMockLLM([
      'Output without the required value',
      'Output with dark mode included',
    ]);

    const result = await multiRoundGenerate({
      commit,
      leaf,
      provider: llm,
      rounds: [
        { name: 'draft', instruction: 'Write it.' },
        { name: 'refine', instruction: 'Fix constraints.' },
      ],
    });

    // Round 1 should fail constraint (no "dark mode")
    expect(result.rounds[0].constraints_passed).toBe(false);
    expect(result.rounds[0].failed_constraints).toContain('cst_1');

    // Round 2 should pass constraint
    expect(result.rounds[1].constraints_passed).toBe(true);
    expect(result.rounds[1].failed_constraints).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// validateConstraintsSimple
// ═══════════════════════════════════════════════════════════════════════════

describe('validateConstraintsSimple', () => {
  it('passes when require exact constraint is satisfied', () => {
    const failed = validateConstraintsSimple('I love dark mode for coding', [
      { id: 'cst_1', type: 'require', value: 'dark mode', match_mode: 'exact' },
    ]);
    expect(failed).toHaveLength(0);
  });

  it('fails when require exact constraint is not satisfied', () => {
    const failed = validateConstraintsSimple('I love light theme for coding', [
      { id: 'cst_1', type: 'require', value: 'dark mode', match_mode: 'exact' },
    ]);
    expect(failed).toEqual(['cst_1']);
  });

  it('is case-insensitive for exact matching', () => {
    const failed = validateConstraintsSimple('I love DARK MODE for coding', [
      { id: 'cst_1', type: 'require', value: 'dark mode', match_mode: 'exact' },
    ]);
    expect(failed).toHaveLength(0);
  });

  it('passes when exclude exact constraint is satisfied (value absent)', () => {
    const failed = validateConstraintsSimple('I love dark mode', [
      {
        id: 'cst_2',
        type: 'exclude',
        value: 'light theme',
        match_mode: 'exact',
      },
    ]);
    expect(failed).toHaveLength(0);
  });

  it('fails when exclude exact constraint is violated (value present)', () => {
    const failed = validateConstraintsSimple('I love dark mode and light theme', [
      {
        id: 'cst_2',
        type: 'exclude',
        value: 'light theme',
        match_mode: 'exact',
      },
    ]);
    expect(failed).toEqual(['cst_2']);
  });

  it('handles semantic require with keyword overlap', () => {
    // "machine learning models" has "machine", "learning", "models" — all present
    const failed = validateConstraintsSimple('We use machine learning models for predictions', [
      {
        id: 'cst_3',
        type: 'require',
        value: 'machine learning models',
        match_mode: 'semantic',
      },
    ]);
    expect(failed).toHaveLength(0);
  });

  it('fails semantic require when keywords do not overlap enough', () => {
    const failed = validateConstraintsSimple('We use traditional algorithms for predictions', [
      {
        id: 'cst_3',
        type: 'require',
        value: 'machine learning models',
        match_mode: 'semantic',
      },
    ]);
    expect(failed).toEqual(['cst_3']);
  });

  it('handles semantic exclude with high keyword overlap', () => {
    const failed = validateConstraintsSimple(
      'The competitor product uses machine learning models extensively',
      [
        {
          id: 'cst_4',
          type: 'exclude',
          value: 'competitor product uses machine learning',
          match_mode: 'semantic',
        },
      ]
    );
    expect(failed).toEqual(['cst_4']);
  });

  it('handles multiple constraints simultaneously', () => {
    const failed = validateConstraintsSimple('I love dark mode', [
      { id: 'cst_1', type: 'require', value: 'dark mode', match_mode: 'exact' },
      {
        id: 'cst_2',
        type: 'require',
        value: 'OAuth 2.0',
        match_mode: 'exact',
      },
      {
        id: 'cst_3',
        type: 'exclude',
        value: 'light theme',
        match_mode: 'exact',
      },
    ]);
    // cst_1 passes (dark mode present), cst_2 fails (OAuth 2.0 absent), cst_3 passes (light theme absent)
    expect(failed).toEqual(['cst_2']);
  });

  it('returns empty array when no constraints', () => {
    const failed = validateConstraintsSimple('any output', []);
    expect(failed).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildRound1Prompt
// ═══════════════════════════════════════════════════════════════════════════

describe('buildRound1Prompt', () => {
  it('includes sentences in numbered format', () => {
    const prompt = buildRound1Prompt(
      [{ text: 'First sentence.' }, { text: 'Second sentence.' }],
      []
    );
    expect(prompt).toContain('1. First sentence.');
    expect(prompt).toContain('2. Second sentence.');
  });

  it('includes require constraints', () => {
    const prompt = buildRound1Prompt(
      [{ text: 'A sentence.' }],
      [{ type: 'require', value: 'dark mode', match_mode: 'exact' }]
    );
    expect(prompt).toContain('MUST include');
    expect(prompt).toContain('EXACTLY');
    expect(prompt).toContain('"dark mode"');
  });

  it('includes exclude constraints', () => {
    const prompt = buildRound1Prompt(
      [{ text: 'A sentence.' }],
      [{ type: 'exclude', value: 'light theme', match_mode: 'semantic' }]
    );
    expect(prompt).toContain('MUST NOT include');
    expect(prompt).toContain('"light theme"');
  });

  it('uses custom prompt template when provided', () => {
    const prompt = buildRound1Prompt([{ text: 'A sentence.' }], [], {
      promptTemplate: 'Custom template instructions here.',
    });
    expect(prompt).toContain('Custom template instructions here.');
  });

  it('includes the task instruction', () => {
    const prompt = buildRound1Prompt([{ text: 'A sentence.' }], []);
    expect(prompt).toContain('Generate a structured output');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildRound2Prompt
// ═══════════════════════════════════════════════════════════════════════════

describe('buildRound2Prompt', () => {
  it('includes previous output', () => {
    const prompt = buildRound2Prompt('Previous output text here.', [], []);
    expect(prompt).toContain('Previous output text here.');
  });

  it('lists failed constraints', () => {
    const prompt = buildRound2Prompt(
      'Some output.',
      [{ type: 'require', value: 'dark mode' }],
      [{ type: 'require', value: 'dark mode', match_mode: 'exact' }]
    );
    expect(prompt).toContain('Failed Constraints');
    expect(prompt).toContain('[REQUIRE]');
    expect(prompt).toContain('"dark mode"');
    expect(prompt).toContain('was NOT found');
  });

  it('lists exclude failures correctly', () => {
    const prompt = buildRound2Prompt(
      'Some output with bad stuff.',
      [{ type: 'exclude', value: 'bad stuff' }],
      [{ type: 'exclude', value: 'bad stuff', match_mode: 'exact' }]
    );
    expect(prompt).toContain('[EXCLUDE]');
    expect(prompt).toContain('should be excluded');
  });

  it('includes all constraints as reference', () => {
    const prompt = buildRound2Prompt(
      'Output.',
      [],
      [
        { type: 'require', value: 'dark mode', match_mode: 'exact' },
        { type: 'exclude', value: 'light', match_mode: 'semantic' },
      ]
    );
    expect(prompt).toContain('All Constraints (Reference)');
    expect(prompt).toContain('[REQUIRE] (exact)');
    expect(prompt).toContain('[EXCLUDE] (semantic)');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildRound3Prompt
// ═══════════════════════════════════════════════════════════════════════════

describe('buildRound3Prompt', () => {
  it('includes current output', () => {
    const prompt = buildRound3Prompt('Current output.');
    expect(prompt).toContain('Current output.');
  });

  it('includes style preferences when provided', () => {
    const prompt = buildRound3Prompt('Output.', {
      tone: 'professional',
      length: 'concise',
      formality: 'formal',
    });
    expect(prompt).toContain('Tone: professional');
    expect(prompt).toContain('Length: concise');
    expect(prompt).toContain('Formality: formal');
  });

  it('uses default message when no preferences provided', () => {
    const prompt = buildRound3Prompt('Output.');
    expect(prompt).toContain('No specific preferences');
    expect(prompt).toContain('readability');
  });

  it('includes the polish task instruction', () => {
    const prompt = buildRound3Prompt('Output.');
    expect(prompt).toContain('Polish the output');
    expect(prompt).toContain('Do NOT change the factual content');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// modeGenerate
// ═══════════════════════════════════════════════════════════════════════════

describe('modeGenerate', () => {
  it('fast mode: runs 1 round', async () => {
    const llm = makeMockLLM(['Fast output with dark mode']);

    const result = await modeGenerate({
      commit,
      leaf,
      provider: llm,
      mode: 'fast',
    });

    expect(result.mode).toBe('fast');
    expect(result.total_rounds).toBe(1);
    expect(result.rounds).toHaveLength(1);
    expect(result.rounds[0].name).toBe('draft');
    expect(result.output).toBe('Fast output with dark mode');
    expect(llm.generate).toHaveBeenCalledTimes(1);
  });

  it('standard mode: runs 2 rounds', async () => {
    const llm = makeMockLLM(['Draft without required value', 'Refined output with dark mode']);

    const result = await modeGenerate({
      commit,
      leaf,
      provider: llm,
      mode: 'standard',
    });

    expect(result.mode).toBe('standard');
    expect(result.total_rounds).toBe(2);
    expect(result.rounds).toHaveLength(2);
    expect(result.rounds[0].name).toBe('draft');
    expect(result.rounds[1].name).toBe('refine');
    expect(llm.generate).toHaveBeenCalledTimes(2);
  });

  it('thorough mode: runs 3 rounds', async () => {
    const llm = makeMockLLM([
      'Draft with dark mode',
      'Refined dark mode output',
      'Polished dark mode output',
    ]);

    const result = await modeGenerate({
      commit,
      leaf,
      provider: llm,
      mode: 'thorough',
    });

    expect(result.mode).toBe('thorough');
    expect(result.total_rounds).toBe(3);
    expect(result.rounds).toHaveLength(3);
    expect(result.rounds[0].name).toBe('draft');
    expect(result.rounds[1].name).toBe('refine');
    expect(result.rounds[2].name).toBe('polish');
    expect(llm.generate).toHaveBeenCalledTimes(3);
  });

  it('standard mode: detects failed constraints in round 1', async () => {
    const llm = makeMockLLM([
      'Output without the required keyword',
      'Output with dark mode included',
    ]);

    const result = await modeGenerate({
      commit,
      leaf,
      provider: llm,
      mode: 'standard',
    });

    // Round 1 should fail (no "dark mode")
    expect(result.rounds[0].constraints_passed).toBe(false);
    expect(result.rounds[0].failed_constraints).toContain('cst_1');

    // Round 2 should pass
    expect(result.rounds[1].constraints_passed).toBe(true);
  });

  it('thorough mode: passes style preferences to round 3', async () => {
    const llm: LLMProvider = {
      id: 'mock',
      generate: vi.fn(async (prompt: string) => {
        if (prompt.includes('Tone: casual')) {
          return { text: 'Casual dark mode output', usage: { inputTokens: 10, outputTokens: 5 } };
        }
        return { text: 'dark mode output', usage: { inputTokens: 10, outputTokens: 5 } };
      }),
      resolveConflict: vi
        .fn()
        .mockResolvedValue({ text: '', usage: { inputTokens: 0, outputTokens: 0 } }),
    };

    const result = await modeGenerate({
      commit,
      leaf,
      provider: llm,
      mode: 'thorough',
      stylePreferences: { tone: 'casual' },
    });

    expect(result.rounds[2].output).toBe('Casual dark mode output');
    // Verify the prompt for round 3 included style preferences
    const calls = (llm.generate as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[2][0]).toContain('Tone: casual');
  });

  it('works with leaf that has no constraints', async () => {
    const leafNoConstraints: Leaf = {
      ...leaf,
      constraints: [],
    };
    const llm = makeMockLLM(['Output 1', 'Output 2']);

    const result = await modeGenerate({
      commit,
      leaf: leafNoConstraints,
      provider: llm,
      mode: 'standard',
    });

    expect(result.total_rounds).toBe(2);
    // All rounds pass when no constraints
    expect(result.rounds[0].constraints_passed).toBe(true);
    expect(result.rounds[1].constraints_passed).toBe(true);
  });
});
