import { describe, expect, it } from 'vitest';
import {
  DEMO_WORKSPACE_FIXTURE,
  MEETING_NOTES_EXTRACTION_DEMO,
  MERGE_SEMANTIC_CHANGES_DEMO,
  PROMPT_DIFF_DEMO,
} from '../index';

describe('demo workspace fixture', () => {
  it('exports a professional no-key replay workspace from core', () => {
    expect(DEMO_WORKSPACE_FIXTURE.id).toBe('prompt_review');
    expect(DEMO_WORKSPACE_FIXTURE.project.name).toBe('Prompt Review');
    expect(DEMO_WORKSPACE_FIXTURE.project.metadata.is_demo).toBe(true);
    expect(DEMO_WORKSPACE_FIXTURE.project.metadata.demo_fixture_id).toBe('prompt_review');

    expect(DEMO_WORKSPACE_FIXTURE.source.title).toBe('Prompt review intake');
    expect(DEMO_WORKSPACE_FIXTURE.source.text).toContain('Support escalation review');

    expect(DEMO_WORKSPACE_FIXTURE.replay.label).toBe('Fixture replay · no LLM call');
    expect(DEMO_WORKSPACE_FIXTURE.replay.yops.length).toBeGreaterThan(3);
    expect(DEMO_WORKSPACE_FIXTURE.replay.trees[0]?.key).toBe('support_escalation_review');

    expect(DEMO_WORKSPACE_FIXTURE.commit.message).toBe('Seed prompt review demo workspace');
    expect(DEMO_WORKSPACE_FIXTURE.commit.provenance.method).toBe('fixture_replay');

    expect(DEMO_WORKSPACE_FIXTURE.leaf.type).toBe('article');
    expect(DEMO_WORKSPACE_FIXTURE.leaf.constraints.length).toBeGreaterThanOrEqual(2);
    expect(DEMO_WORKSPACE_FIXTURE.leaf.output).toContain('Refunds above $100');
    expect(DEMO_WORKSPACE_FIXTURE.leaf.assertions.every((assertion) => assertion.passed)).toBe(
      true
    );
  });

  it('keeps existing open-source e2e demo datasets available from core', () => {
    expect(PROMPT_DIFF_DEMO.name).toBe('Prompt version comparison');
    expect(MEETING_NOTES_EXTRACTION_DEMO.expectedTrees[0]?.key).toBe('release_readiness');
    expect(MERGE_SEMANTIC_CHANGES_DEMO.expected.conflicts).toContain('trip_plan');
  });
});
