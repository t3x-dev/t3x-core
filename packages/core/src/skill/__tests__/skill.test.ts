import { t3xSkillP0Fixtures } from '@t3x-dev/yschema';
import { describe, expect, it } from 'vitest';
import { compileSkillBundle, validateSkillPolicy } from '..';

describe('validateSkillPolicy', () => {
  it('accepts the complete Skill fixture', () => {
    expect(
      validateSkillPolicy(t3xSkillP0Fixtures.validCandidateTree, t3xSkillP0Fixtures.validRelations)
    ).toEqual({ valid: true, ready: true, errors: [], gaps: [] });
  });

  it('reports cross-field readiness gaps deterministically', () => {
    const tree = structuredClone(t3xSkillP0Fixtures.validCandidateTree) as Record<string, unknown>;
    const activation = tree.activation as Record<string, unknown>;
    const instructions = tree.instructions as Record<string, Record<string, unknown>>;
    activation.should_not_trigger = [];
    instructions.verify_findings.freedom = 'low';
    instructions.verify_findings.success_criteria = [];
    tree.evals = {};

    const result = validateSkillPolicy(tree, t3xSkillP0Fixtures.validRelations);

    expect(result.valid).toBe(true);
    expect(result.ready).toBe(false);
    expect(result.gaps.map((gap) => gap.code)).toEqual([
      'SKILL_NEGATIVE_TRIGGER_REQUIRED',
      'SKILL_BEHAVIOR_EVAL_REQUIRED',
      'SKILL_NEGATIVE_TRIGGER_EVAL_REQUIRED',
      'SKILL_POSITIVE_TRIGGER_EVAL_REQUIRED',
      'SKILL_LOW_FREEDOM_VERIFICATION_REQUIRED',
    ]);
  });

  it('rejects broken workflow fallback and command check routes', () => {
    const tree = structuredClone(t3xSkillP0Fixtures.validCandidateTree) as Record<string, unknown>;
    const workflows = tree.workflows as Record<string, Record<string, unknown>>;
    const checks = tree.checks as Record<string, Record<string, unknown>>;
    workflows.review_changes.on_failure = 'fallback';
    workflows.review_changes.fallback_workflow = 'missing_workflow';
    checks.validate_review_output.command_resource = 'scripts/missing.py';

    const result = validateSkillPolicy(tree, t3xSkillP0Fixtures.validRelations);

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.code)).toEqual([
      'SKILL_CHECK_COMMAND_UNKNOWN',
      'SKILL_FALLBACK_WORKFLOW_UNKNOWN',
    ]);
  });
});

describe('compileSkillBundle', () => {
  it('creates a portable, deterministic SKILL.md bundle', () => {
    const input = {
      tree: t3xSkillP0Fixtures.validCandidateTree,
      relations: t3xSkillP0Fixtures.validRelations,
      resourceContents: {
        'data/severity-rules.csv': 'severity,rule\nhigh,authorization bypass\n',
        'references/review-policy.md': '# Review policy\n',
        'scripts/validate-review.py': 'raise SystemExit(0)\n',
      },
    };

    const first = compileSkillBundle(input);
    const second = compileSkillBundle(input);

    expect(first).toEqual(second);
    expect(first.missingResources).toEqual([]);
    expect(first.files.map((file) => file.path)).toEqual([
      'SKILL.md',
      'data/severity-rules.csv',
      'references/review-policy.md',
      'scripts/validate-review.py',
    ]);
    expect(first.files[0]?.content).toContain('name: review-code');
    expect(first.files[0]?.content).toContain('Use when: Review this pull request for defects.');
    expect(first.files[0]?.content).toContain('## Workflows');
    expect(first.files[0]?.content).toContain('### Review changes');
    expect(first.files[0]?.content).toContain('## Deterministic checks');
    expect(first.files[0]?.content).not.toContain('default_freedom:');
    expect(first.generatedDescription).toContain('Do not use when:');
    expect(first.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'validate_review_output',
          blocking: true,
          workflowKeys: ['review_changes'],
        }),
      ])
    );
    expect(first.bundleHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('surfaces declared resources that are not available to the compiler', () => {
    const bundle = compileSkillBundle({
      tree: t3xSkillP0Fixtures.validCandidateTree,
      relations: t3xSkillP0Fixtures.validRelations,
    });
    expect(bundle.missingResources).toEqual([
      'data/severity-rules.csv',
      'references/review-policy.md',
      'scripts/validate-review.py',
    ]);
    expect(bundle.files.map((file) => file.path)).toEqual(['SKILL.md']);
  });
});
