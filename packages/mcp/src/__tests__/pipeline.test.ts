import type { SemanticContent, TreeNode } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import { validateYOps } from '../validate/pipeline';

// ── Helpers ──

const node = (key: string, slots: TreeNode['slots'] = {}, children: TreeNode[] = []): TreeNode => ({
  key,
  slots,
  children,
});

const content = (
  trees: TreeNode[] = [],
  relations: SemanticContent['relations'] = []
): SemanticContent => ({ trees, relations });

// ── Tests ──

describe('validateYOps pipeline', () => {
  // ── Layer 1: Parse ──

  it('returns ok=true for valid YOps on a simple tree', async () => {
    const yaml = `yops:
  - define:
      path: trip
  - populate:
      path: trip
      values:
        budget: 5000
        destination: Tokyo`;

    const result = await validateYOps(yaml, content());

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.parsed_yops).toBeDefined();
    expect(result.parsed_yops).toHaveLength(2);
    expect(result.result_doc).toBeDefined();
  });

  it('returns layer 1 error for invalid YAML syntax', async () => {
    const yaml = `yops:
  - define:
      path: trip
  - this is not: [valid: yaml: syntax`;

    const result = await validateYOps(yaml, content());

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors[0].layer).toBe(1);
    expect(result.errors[0].stage).toBe('parse');
  });

  it('returns layer 1 error for empty input', async () => {
    const result = await validateYOps('', content());

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].layer).toBe(1);
    expect(result.errors[0].stage).toBe('parse');
    expect(result.errors[0].message).toContain('Empty input');
  });

  it('does not run layers 3/4 when parse fails', async () => {
    const result = await validateYOps('{{{{invalid yaml', content());

    expect(result.ok).toBe(false);
    expect(result.errors.every((e) => e.layer === 1)).toBe(true);
    expect(result.parsed_yops).toBeUndefined();
    expect(result.result_doc).toBeUndefined();
  });

  // ── Layer 3: Engine dry-run ──

  it('returns layer 3 error for bad path (populate nonexistent)', async () => {
    const yaml = `yops:
  - populate:
      path: nonexistent
      values:
        x: 1`;

    const existing = content([node('trip', { budget: 5000 })]);
    const result = await validateYOps(yaml, existing);

    expect(result.ok).toBe(false);
    const engineErrors = result.errors.filter((e) => e.layer === 3);
    expect(engineErrors.length).toBeGreaterThanOrEqual(1);
    expect(engineErrors[0].stage).toBe('engine');
    expect(result.result_doc).toBeUndefined();
  });

  it('returns layer 3 error for drop on nonexistent path', async () => {
    const yaml = `yops:
  - drop:
      path: does_not_exist`;

    const existing = content([node('trip', { budget: 5000 })]);
    const result = await validateYOps(yaml, existing);

    expect(result.ok).toBe(false);
    const engineErrors = result.errors.filter((e) => e.layer === 3);
    expect(engineErrors.length).toBeGreaterThanOrEqual(1);
    expect(engineErrors[0].stage).toBe('engine');
  });

  // ── Layer 4: Gates (advisory warnings) ──

  it('runs layer 4 gates on successful result (clean content has no warnings)', async () => {
    const yaml = `yops:
  - define:
      path: trip
  - populate:
      path: trip
      values:
        budget: 5000`;

    const result = await validateYOps(yaml, content());

    expect(result.ok).toBe(true);
    expect(result.result_doc).toBeDefined();
    // Clean content should not produce gate warnings
    const gateWarnings = result.warnings.filter((w) => w.layer === 4);
    expect(gateWarnings).toHaveLength(0);
  });

  // ── Multiple errors ──

  it('collects errors from parse failure without running further layers', async () => {
    // Two problems: completely invalid YAML
    const yaml = 'not valid yaml at all: [[[';

    const result = await validateYOps(yaml, content());

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    // All errors should be from layer 1 since parse failed
    for (const err of result.errors) {
      expect(err.layer).toBe(1);
    }
  });

  // ── Success cases ──

  it('succeeds for set operation on existing tree', async () => {
    const yaml = `yops:
  - set:
      path: trip/budget
      value: 8000`;

    const existing = content([node('trip', { budget: 5000, destination: 'Tokyo' })]);
    const result = await validateYOps(yaml, existing);

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.result_doc).toBeDefined();

    const doc = result.result_doc as SemanticContent;
    expect(doc.trees[0].slots.budget).toBe(8000);
  });

  it('succeeds for tree-format YAML (first extraction)', async () => {
    const yaml = `trip:
  budget: 5000
  destination: Tokyo`;

    const result = await validateYOps(yaml, content());

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.parsed_yops).toBeDefined();
    // Tree format produces define + populate ops
    expect((result.parsed_yops as unknown[]).length).toBeGreaterThanOrEqual(1);
    expect(result.result_doc).toBeDefined();
  });

  it('preserves original content immutability', async () => {
    const original = content([node('trip', { budget: 5000 })]);
    const originalBudget = original.trees[0].slots.budget;

    const yaml = `yops:
  - set:
      path: trip/budget
      value: 9999`;

    await validateYOps(yaml, original);

    // Original content should not be mutated (applyYOps deep-clones)
    expect(original.trees[0].slots.budget).toBe(originalBudget);
  });

  it('warnings do not affect ok status', async () => {
    // Even if warnings are present, ok is based on errors only
    const yaml = `yops:
  - define:
      path: trip
  - populate:
      path: trip
      values:
        budget: 5000`;

    const result = await validateYOps(yaml, content());

    // ok is determined by errors.length === 0, not warnings
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    // Warnings may or may not be present — either way ok is true
  });
});
