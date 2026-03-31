import { describe, expect, it } from 'vitest';
import { collectLessonsFromAssertions } from '../../feedback/collect';
import { validateConstraintsExactOnly } from '../../leaf/validate-constraints';
import { buildLeafPrompt } from '../../leaf/build-prompt';
import type { Constraint, Leaf } from '../../types';

describe('Feedback loop E2E', () => {
  it('full cycle: validate -> collect lessons -> include in prompt', () => {
    // Step 1: Validate output against constraints (fails)
    const constraints: Constraint[] = [
      { id: 'cst_1', type: 'require', match_mode: 'exact', value: 'budget: $5000' },
      {
        id: 'cst_2',
        type: 'exclude',
        match_mode: 'exact',
        value: 'TODO',
        reason: 'not production ready',
      },
    ];

    const validationResult = validateConstraintsExactOnly(
      'The trip costs around five thousand. TODO: finalize.',
      constraints,
    );

    // Should have 2 failures
    expect(validationResult.allPassed).toBe(false);
    const failedAssertions = validationResult.assertions.filter((a) => !a.passed);
    expect(failedAssertions).toHaveLength(2);

    // Each failure should have a lesson
    expect(failedAssertions[0].lesson).toBeTruthy();
    expect(failedAssertions[1].lesson).toBeTruthy();

    // Step 2: Collect lessons from the leaf's assertions
    const leaf = { id: 'leaf_1', assertions: validationResult.assertions };
    const lessons = collectLessonsFromAssertions([leaf]);

    expect(lessons).toHaveLength(2);
    expect(lessons[0].source).toBe('assertion');
    expect(lessons[0].leaf_id).toBe('leaf_1');

    // Step 3: Build prompt with lessons
    const prompt = buildLeafPrompt({
      knowledge: {
        trees: [{ key: 'trip', slots: { cost: '5000' }, children: [] }],
        relations: [],
      },
      leaf: {
        id: 'leaf_1',
        commit_hash: 'sha256:test',
        type: 'tweet',
        title: 'Trip Tweet',
        constraints,
        config: {},
        output: null,
        assertions: validationResult.assertions,
        project_id: 'proj_1',
        created_at: new Date().toISOString(),
      } as unknown as Leaf,
      lessons,
    });

    // Prompt should contain both lessons
    expect(prompt.userPrompt).toContain('budget: $5000');
    expect(prompt.userPrompt).toContain('TODO');
    expect(prompt.userPrompt).toContain('Lessons');
  });
});
