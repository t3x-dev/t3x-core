/**
 * Bridge Queries Tests
 */

import { describe, expect, it } from 'vitest';
import type { BridgeTemplate } from '../../lib/bridgeQueries';
import { bridgeQueryDefs, buildBridgeQueries } from '../../lib/bridgeQueries';

describe('bridgeQueryDefs', () => {
  it('has all 7 templates', () => {
    const expected: BridgeTemplate[] = [
      'prose',
      'plan',
      'story',
      'summary',
      'refine',
      'explain',
      'clarify',
    ];
    for (const t of expected) {
      expect(bridgeQueryDefs[t]).toBeDefined();
      expect(bridgeQueryDefs[t].task).toBeTruthy();
      expect(bridgeQueryDefs[t].schema).toBeTruthy();
    }
  });

  it('each template has task and schema strings', () => {
    for (const [, def] of Object.entries(bridgeQueryDefs)) {
      expect(typeof def.task).toBe('string');
      expect(typeof def.schema).toBe('string');
      expect(def.task.length).toBeGreaterThan(10);
      expect(def.schema.length).toBeGreaterThan(10);
    }
  });
});

describe('buildBridgeQueries', () => {
  it('builds queries with template', () => {
    const result = buildBridgeQueries({
      template: 'summary',
      unitTitle: 'My Unit',
      userMessage: 'Summarize this',
    });

    expect(result.qUser).toContain('My Unit');
    expect(result.qUser).toContain('Summarize this');
    expect(result.qTask).toContain('TEMPLATE_TASK:');
    expect(result.qTask).toContain(bridgeQueryDefs.summary.task);
    expect(result.qSchema).toContain('TEMPLATE_SCHEMA:');
    expect(result.qSchema).toContain(bridgeQueryDefs.summary.schema);
  });

  it('handles missing unitTitle', () => {
    const result = buildBridgeQueries({
      template: 'plan',
      userMessage: 'Plan this',
    });

    expect(result.qUser).toContain('UNIT:');
    expect(result.qUser).toContain('Plan this');
  });

  it('uses summary as fallback for unknown template', () => {
    const result = buildBridgeQueries({
      template: 'nonexistent' as BridgeTemplate,
      userMessage: 'Test',
    });

    expect(result.qTask).toContain(bridgeQueryDefs.summary.task);
  });

  it('builds different queries for different templates', () => {
    const plan = buildBridgeQueries({ template: 'plan', userMessage: 'test' });
    const story = buildBridgeQueries({ template: 'story', userMessage: 'test' });

    expect(plan.qTask).not.toBe(story.qTask);
    expect(plan.qSchema).not.toBe(story.qSchema);
  });

  it('includes UNIT and USER labels', () => {
    const result = buildBridgeQueries({
      template: 'refine',
      unitTitle: 'Title',
      userMessage: 'Message',
    });

    expect(result.qUser).toMatch(/^UNIT:.*\nUSER:/);
  });

  it('works with all template types', () => {
    const templates: BridgeTemplate[] = [
      'prose',
      'plan',
      'story',
      'summary',
      'refine',
      'explain',
      'clarify',
    ];
    for (const t of templates) {
      const result = buildBridgeQueries({ template: t, userMessage: 'test' });
      expect(result.qTask).toBeTruthy();
      expect(result.qSchema).toBeTruthy();
      expect(result.qUser).toBeTruthy();
    }
  });
});
