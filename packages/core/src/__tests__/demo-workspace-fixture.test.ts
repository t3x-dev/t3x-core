import { describe, expect, it } from 'vitest';
import {
  DEMO_WORKSPACE_FIXTURE,
  LANDING_DEMO_CASES,
  MEETING_NOTES_EXTRACTION_DEMO,
  MERGE_SEMANTIC_CHANGES_DEMO,
  PROMPT_DIFF_DEMO,
  replayDemoWorkspaceFixture,
  verifyDemoWorkspaceFixture,
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

  it('replays the fixture YOps into the recorded semantic content', () => {
    const replayed = replayDemoWorkspaceFixture(DEMO_WORKSPACE_FIXTURE);

    expect(replayed).toEqual({
      trees: DEMO_WORKSPACE_FIXTURE.replay.trees,
      relations: DEMO_WORKSPACE_FIXTURE.replay.relations,
    });
  });

  it('fails verification when recorded fixture content drifts from replayed YOps', () => {
    const drifted = structuredClone(DEMO_WORKSPACE_FIXTURE);
    drifted.replay.trees[0]!.key = 'drifted_demo_key';

    expect(() => verifyDemoWorkspaceFixture(drifted)).toThrow(
      'Demo fixture "prompt_review" replay output does not match recorded content'
    );
  });

  it('keeps existing open-source e2e demo datasets available from core', () => {
    expect(PROMPT_DIFF_DEMO.name).toBe('Prompt version comparison');
    expect(MEETING_NOTES_EXTRACTION_DEMO.expectedTrees[0]?.key).toBe('release_readiness');
    expect(MERGE_SEMANTIC_CHANGES_DEMO.expected.conflicts).toContain('trip_plan');
  });

  it('exports landing demo cases for the first-commit preview', () => {
    expect(LANDING_DEMO_CASES.map((demo) => demo.id)).toEqual([
      'prompt_review',
      'meeting_notes',
      'prompt_diff',
    ]);
    expect(LANDING_DEMO_CASES[0]?.source.text).toBe(DEMO_WORKSPACE_FIXTURE.source.text);
    expect(LANDING_DEMO_CASES[0]?.yops.length).toBeGreaterThan(2);
    expect(LANDING_DEMO_CASES[0]?.commit.message).toBe(DEMO_WORKSPACE_FIXTURE.commit.message);
    expect(LANDING_DEMO_CASES[1]?.source.text).toBe(MEETING_NOTES_EXTRACTION_DEMO.sourceText);
    expect(JSON.stringify(LANDING_DEMO_CASES[1]?.yops)).toContain('release_readiness');
  });
});
