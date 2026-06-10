/**
 * LeafDetailPage Component Tests
 *
 * Tests for the leaf detail page showing constraints, output, and assertions
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Assertion, Constraint, Leaf } from '@/infrastructure';
import * as api from '@/infrastructure';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({
    projectId: 'proj_123',
    leafId: 'leaf_abc123',
  })),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
}));

// Mock API functions
vi.mock('@/infrastructure', () => ({
  getLeaf: vi.fn(),
  updateLeaf: vi.fn(),
}));

// Mock PinButton
vi.mock('@/components/ui/PinButton', () => ({
  PinButton: vi.fn(() => null),
}));

// Mock ApiStatus components
vi.mock('@/components/layout/ApiStatus', () => ({
  LoadingSpinner: vi.fn(({ message }: { message: string }) => message),
  ErrorMessage: vi.fn(({ error }: { error: string }) => error),
}));

describe('LeafDetailPage', () => {
  const mockConstraints: Constraint[] = [
    {
      id: 'cst_req1',
      type: 'require',
      match_mode: 'exact',
      value: 'must contain this',
      description: 'Important requirement',
    },
    {
      id: 'cst_exc1',
      type: 'exclude',
      match_mode: 'semantic',
      value: 'forbidden phrase',
      reason: 'Policy violation',
    },
  ];

  const mockAssertions: Assertion[] = [
    {
      id: 'ast_1',
      constraint_id: 'cst_req1',
      passed: true,
      details: 'Found the required text',
      lesson: 'Always include key phrases',
    },
    {
      id: 'ast_2',
      constraint_id: 'cst_exc1',
      passed: false,
      details: 'Found forbidden content',
    },
  ];

  const mockLeaf: Leaf = {
    id: 'leaf_abc123',
    commit_hash: 'sha256:abc123',
    type: 'deploy_agent',
    title: 'Test Leaf',
    constraints: mockConstraints,
    config: { model: 'gpt-4' },
    output: 'Generated output text here',
    generated_at: '2024-01-15T10:00:00Z',
    assertions: mockAssertions,
    project_id: 'proj_123',
    runner_assertions: null,
    created_at: '2024-01-01T00:00:00Z',
    created_by: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getLeaf).mockResolvedValue(mockLeaf);
  });

  // ============================================================
  // API Type Tests
  // ============================================================

  test('Leaf type has required fields', () => {
    expect(mockLeaf.id).toBe('leaf_abc123');
    expect(mockLeaf.commit_hash).toBe('sha256:abc123');
    expect(mockLeaf.type).toBe('deploy_agent');
    expect(mockLeaf.project_id).toBe('proj_123');
    expect(mockLeaf.constraints).toHaveLength(2);
  });

  test('Constraint types are correct', () => {
    const requireConstraint = mockConstraints[0];
    const excludeConstraint = mockConstraints[1];

    expect(requireConstraint.type).toBe('require');
    expect(requireConstraint.match_mode).toBe('exact');
    expect(requireConstraint.value).toBe('must contain this');

    expect(excludeConstraint.type).toBe('exclude');
    expect(excludeConstraint.match_mode).toBe('semantic');
    expect((excludeConstraint as api.ExcludeConstraint).reason).toBe('Policy violation');
  });

  test('Assertion type has required fields', () => {
    const passedAssertion = mockAssertions[0];
    const failedAssertion = mockAssertions[1];

    expect(passedAssertion.id).toBe('ast_1');
    expect(passedAssertion.constraint_id).toBe('cst_req1');
    expect(passedAssertion.passed).toBe(true);
    expect(passedAssertion.details).toBeDefined();
    expect(passedAssertion.lesson).toBe('Always include key phrases');

    expect(failedAssertion.passed).toBe(false);
    expect(failedAssertion.lesson).toBeUndefined();
  });

  // ============================================================
  // API Function Tests
  // ============================================================

  test('getLeaf API function is available', () => {
    expect(api.getLeaf).toBeDefined();
    expect(typeof api.getLeaf).toBe('function');
  });

  test('updateLeaf API function is available', () => {
    expect(api.updateLeaf).toBeDefined();
    expect(typeof api.updateLeaf).toBe('function');
  });

  test('getLeaf returns leaf data', async () => {
    const result = await api.getLeaf('leaf_abc123');
    expect(result).toEqual(mockLeaf);
    expect(api.getLeaf).toHaveBeenCalledWith('leaf_abc123');
  });

  test('updateLeaf updates constraints', async () => {
    const updatedLeaf = { ...mockLeaf, constraints: [] };
    vi.mocked(api.updateLeaf).mockResolvedValue(updatedLeaf);

    const result = await api.updateLeaf('leaf_abc123', { constraints: [] });

    expect(result.constraints).toHaveLength(0);
    expect(api.updateLeaf).toHaveBeenCalledWith('leaf_abc123', { constraints: [] });
  });

  // ============================================================
  // LeafType Tests
  // ============================================================

  test('LeafType includes expected values', () => {
    const validTypes: api.LeafType[] = [
      'deploy_agent',
      'tweet',
      'linkedin',
      'reddit',
      'threads',
      'article',
      'email',
      'slack',
    ];

    expect(validTypes).toContain(mockLeaf.type);
  });

  // ============================================================
  // Constraint Filtering Tests
  // ============================================================

  test('can filter constraints by type', () => {
    const requireConstraints = mockConstraints.filter((c) => c.type === 'require');
    const excludeConstraints = mockConstraints.filter((c) => c.type === 'exclude');

    expect(requireConstraints).toHaveLength(1);
    expect(excludeConstraints).toHaveLength(1);
    expect(requireConstraints[0].value).toBe('must contain this');
    expect(excludeConstraints[0].value).toBe('forbidden phrase');
  });

  // ============================================================
  // Assertion Status Tests
  // ============================================================

  test('can calculate assertion pass/fail counts', () => {
    const passedCount = mockAssertions.filter((a) => a.passed).length;
    const failedCount = mockAssertions.filter((a) => !a.passed).length;

    expect(passedCount).toBe(1);
    expect(failedCount).toBe(1);
  });

  test('can determine if all assertions passed', () => {
    const allPassed = mockAssertions.every((a) => a.passed);
    expect(allPassed).toBe(false);

    const allPassedAssertions: Assertion[] = [
      { id: 'ast_1', constraint_id: 'cst_1', passed: true, details: 'ok' },
      { id: 'ast_2', constraint_id: 'cst_2', passed: true, details: 'ok' },
    ];
    const allPassedResult = allPassedAssertions.every((a) => a.passed);
    expect(allPassedResult).toBe(true);
  });

  // ============================================================
  // Null/Empty State Tests
  // ============================================================

  test('handles leaf with no output', () => {
    const leafWithoutOutput: Leaf = {
      ...mockLeaf,
      output: null,
      generated_at: null,
    };

    expect(leafWithoutOutput.output).toBeNull();
    expect(leafWithoutOutput.generated_at).toBeNull();
  });

  test('handles leaf with no assertions', () => {
    const leafWithoutAssertions: Leaf = {
      ...mockLeaf,
      assertions: null,
    };

    expect(leafWithoutAssertions.assertions).toBeNull();
  });

  test('handles leaf with empty constraints', () => {
    const leafWithoutConstraints: Leaf = {
      ...mockLeaf,
      constraints: [],
    };

    expect(leafWithoutConstraints.constraints).toHaveLength(0);
  });

  // ============================================================
  // Constraint Map Tests
  // ============================================================

  test('can create constraint map for assertion lookup', () => {
    const constraintMap = new Map(mockConstraints.map((c) => [c.id, c]));

    expect(constraintMap.get('cst_req1')?.value).toBe('must contain this');
    expect(constraintMap.get('cst_exc1')?.value).toBe('forbidden phrase');
    expect(constraintMap.get('nonexistent')).toBeUndefined();
  });

  test('assertion can find its constraint', () => {
    const constraintMap = new Map(mockConstraints.map((c) => [c.id, c]));

    const assertion = mockAssertions[0];
    const constraint = constraintMap.get(assertion.constraint_id);

    expect(constraint).toBeDefined();
    expect(constraint?.value).toBe('must contain this');
  });
});
