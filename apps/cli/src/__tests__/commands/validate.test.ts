/**
 * CLI Validate Command Tests
 */

import { describe, expect, it } from 'vitest';
import { parseAndValidate } from '../../commands/validate.js';

describe('parseAndValidate', () => {
  it('validates valid JSON', () => {
    const content = JSON.stringify({
      trees: [
        {
          key: 'test_topic',
          slots: { name: 'hello' },
          children: [],
        },
      ],
      relations: [],
    });

    const result = parseAndValidate(content, 'json', false);

    expect(result.valid).toBe(true);
    expect(result.tree_count).toBe(1);
    expect(result.node_count).toBe(1);
    expect(result.relation_count).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it('validates valid YAML', () => {
    const content = `trees:
  - key: test_topic
    slots:
      name: hello
    children: []
relations: []`;

    const result = parseAndValidate(content, 'yaml', false);

    expect(result.valid).toBe(true);
    expect(result.tree_count).toBe(1);
    expect(result.node_count).toBe(1);
    expect(result.relation_count).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it('rejects structural error', () => {
    const content = JSON.stringify({
      trees: [
        {
          key: 'BadKey', // Violates snake_case pattern
          slots: { name: 'hello' },
          children: [],
        },
      ],
      relations: [],
    });

    const result = parseAndValidate(content, 'json', false);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((err) => err.includes('key'))).toBe(true);
  });

  it('detects broken relation', () => {
    const content = JSON.stringify({
      trees: [
        {
          key: 'topic_a',
          slots: { name: 'Topic A' },
          children: [],
        },
      ],
      relations: [
        {
          from: 'topic_a',
          to: 'nonexistent_topic', // Reference to non-existent node
          type: 'causes',
        },
      ],
    });

    const result = parseAndValidate(content, 'json', false);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((err) => err.includes('broken_relation'))).toBe(true);
  });

  it('schema-only skips semantic checks', () => {
    const content = JSON.stringify({
      trees: [
        {
          key: 'topic_a',
          slots: { name: 'Topic A' },
          children: [],
        },
      ],
      relations: [
        {
          from: 'topic_a',
          to: 'nonexistent_topic', // Broken relation
          type: 'causes',
        },
      ],
    });

    const result = parseAndValidate(content, 'json', true);

    // Schema validation passes (Zod only checks structure, not integrity)
    expect(result.valid).toBe(true);
    expect(result.tree_count).toBe(1);
    expect(result.node_count).toBe(1);
    expect(result.relation_count).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it('parse failure', () => {
    const content = '{ invalid json';

    const result = parseAndValidate(content, 'json', false);

    expect(result.valid).toBe(false);
    expect(result.tree_count).toBe(0);
    expect(result.node_count).toBe(0);
    expect(result.relation_count).toBe(0);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toMatch(/Parse error/i);
  });

  it('counts nodes recursively', () => {
    const content = JSON.stringify({
      trees: [
        {
          key: 'parent_topic',
          slots: { name: 'Parent' },
          children: [
            {
              key: 'child_topic_1',
              slots: { name: 'Child 1' },
              children: [],
            },
            {
              key: 'child_topic_2',
              slots: { name: 'Child 2' },
              children: [],
            },
          ],
        },
      ],
      relations: [],
    });

    const result = parseAndValidate(content, 'json', false);

    expect(result.valid).toBe(true);
    expect(result.tree_count).toBe(1);
    expect(result.node_count).toBe(3); // Parent + 2 children
    expect(result.relation_count).toBe(0);
  });

  it('handles YAML parse failure', () => {
    const content = `trees:
  - key: test
    invalid_yaml: [unclosed`;

    const result = parseAndValidate(content, 'yaml', false);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toMatch(/Parse error/i);
  });

  it('validates complex tree with multiple relations', () => {
    const content = JSON.stringify({
      trees: [
        {
          key: 'cause',
          slots: { name: 'Cause' },
          children: [],
        },
        {
          key: 'effect',
          slots: { name: 'Effect' },
          children: [],
        },
      ],
      relations: [
        {
          from: 'cause',
          to: 'effect',
          type: 'causes',
        },
      ],
    });

    const result = parseAndValidate(content, 'json', false);

    expect(result.valid).toBe(true);
    expect(result.tree_count).toBe(2);
    expect(result.node_count).toBe(2);
    expect(result.relation_count).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it('rejects invalid relation type', () => {
    const content = JSON.stringify({
      trees: [
        {
          key: 'topic_a',
          slots: { name: 'Topic A' },
          children: [],
        },
        {
          key: 'topic_b',
          slots: { name: 'Topic B' },
          children: [],
        },
      ],
      relations: [
        {
          from: 'topic_a',
          to: 'topic_b',
          type: 'invalid_type', // Not in enum: causes|conditions|contrasts|follows|depends
        },
      ],
    });

    const result = parseAndValidate(content, 'json', false);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects trees array exceeding max limit', () => {
    const trees = Array.from({ length: 1001 }, (_, i) => ({
      key: `topic_${i}`,
      slots: { name: `Topic ${i}` },
      children: [],
    }));

    const content = JSON.stringify({
      trees,
      relations: [],
    });

    const result = parseAndValidate(content, 'json', false);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('validates deeply nested tree structure', () => {
    const content = JSON.stringify({
      trees: [
        {
          key: 'root',
          slots: { name: 'Root' },
          children: [
            {
              key: 'level_1',
              slots: { name: 'Level 1' },
              children: [
                {
                  key: 'level_2',
                  slots: { name: 'Level 2' },
                  children: [
                    {
                      key: 'level_3',
                      slots: { name: 'Level 3' },
                      children: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      relations: [],
    });

    const result = parseAndValidate(content, 'json', false);

    expect(result.valid).toBe(true);
    expect(result.tree_count).toBe(1);
    expect(result.node_count).toBe(4); // root + level_1 + level_2 + level_3
    expect(result.relation_count).toBe(0);
  });
});
