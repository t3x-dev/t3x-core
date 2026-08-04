// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StateSkillReader } from '@/components/project/StateSkillReader';
import type { SkillRenderModel } from '@/domain/project/stateViewModel';
import type { SkillArtifact } from '@/types/api';

const model: SkillRenderModel = {
  checks: [
    {
      assertions: ['Every finding names a path.'],
      blocking: true,
      commandResource: '',
      key: 'delivery_checklist',
      kind: 'checklist',
      runWhen: 'before_delivery',
      successCriteria: [],
      workflowKeys: ['review_changes'],
    },
  ],
  defaultFreedom: 'medium',
  dependencies: [
    {
      description: 'Read repository changes.',
      identifier: 'rg',
      key: 'search',
      kind: 'tool',
      permissions: ['read'],
      required: true,
      useWhen: 'Inspecting source files.',
      versionConstraint: '',
    },
  ],
  evals: [
    {
      assertions: ['Reports actionable findings'],
      expectedOutput: 'A severity-ordered review',
      files: [],
      key: 'behavior',
      kind: 'behavior',
      prompt: 'Review this pull request.',
    },
  ],
  goal: 'Produce an evidence-backed review.',
  implicit: true,
  inputs: ['Repository changes'],
  instructions: [
    {
      approval: 'none',
      body: 'Read the diff and surrounding code.',
      effect: 'read',
      freedom: 'medium',
      key: 'inspect',
      kind: 'procedure',
      onFailure: '',
      resourceKeys: ['checklist'],
      sequence: 1,
      successCriteria: ['Every finding names a path.'],
      title: 'Inspect changes',
    },
  ],
  name: 'review-code',
  nonGoals: ['Implement fixes'],
  outputs: ['Actionable findings'],
  resources: [
    {
      contentHash: '',
      description: 'Severity and evidence policy.',
      key: 'checklist',
      kind: 'reference',
      loadPolicy: 'on_demand',
      mediaType: 'text/markdown',
      path: 'references/checklist.md',
      revision: '',
      sourceUrl: '',
      useWhen: 'checking severity',
    },
  ],
  shouldNotTrigger: ['Implement this feature.'],
  shouldTrigger: ['Review this pull request.'],
  summary: 'Review code changes for defects.',
  truthPolicy: 'evidence_only',
  workflows: [
    {
      checkKeys: ['delivery_checklist'],
      dependencyKeys: ['search'],
      fallbackWorkflow: '',
      key: 'review_changes',
      kind: 'primary',
      onEmpty: 'continue',
      onFailure: 'report_and_stop',
      outputFormats: ['markdown'],
      persistence: 'none',
      resourceKeys: ['checklist'],
      stepKeys: ['inspect'],
      title: 'Review changes',
      when: 'Reviewing a patch or pull request.',
    },
  ],
};

const artifact: SkillArtifact = {
  bundle_hash: 'sha256:bundle',
  checks: [
    {
      assertions: ['Every finding names a path.'],
      blocking: true,
      key: 'delivery_checklist',
      kind: 'checklist',
      run_when: 'before_delivery',
      success_criteria: [],
      workflow_keys: ['review_changes'],
    },
  ],
  commit_hash: 'commit_skill',
  files: [
    {
      content: '---\nname: review-code\n---\n',
      media_type: 'text/markdown',
      path: 'SKILL.md',
      sha256: 'sha256:file',
    },
  ],
  gate: {
    blocking_check_count: 1,
    declaratively_ready: false,
    errors: [],
    gaps: [],
    requires_execution: true,
  },
  generated_description:
    'Review code changes for defects. Use when: Review this pull request. Do not use when: Implement this feature.',
  missing_resources: ['references/checklist.md'],
  publishable: false,
  renderer_version: 't3x-skill-renderer@0.2.0',
  schema_name: 't3x/skill',
};

describe('StateSkillReader', () => {
  it('renders workflow routing, deterministic checks, and model evaluations separately', () => {
    render(
      <StateSkillReader
        artifact={artifact}
        artifactError={null}
        artifactLoading={false}
        model={model}
        schemaName="t3x/skill"
        validationGapCount={0}
        validationReady
        yamlText="manifest:\n  name: review-code"
      />
    );

    expect(screen.getByRole('heading', { name: 'review-code' })).toBeInTheDocument();
    expect(screen.getByText('Should trigger')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Review changes/ })).toBeInTheDocument();
    expect(screen.getByText('Inspect changes')).toBeInTheDocument();
    expect(screen.getByText('Checks before delivery')).toBeInTheDocument();
    expect(screen.getAllByText('Review this pull request.').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Schema ready')).toBeInTheDocument();
  });

  it('shows the server-compiled bundle and missing resource status', () => {
    render(
      <StateSkillReader
        artifact={artifact}
        artifactError={null}
        artifactLoading={false}
        model={model}
        schemaName="t3x/skill"
        validationGapCount={1}
        validationReady={false}
        yamlText="manifest:\n  name: review-code"
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: 'bundle' }));

    expect(screen.getByText('gate blocked')).toBeInTheDocument();
    expect(screen.getByText('1 blocking check declared')).toBeInTheDocument();
    expect(screen.getByText(/Execution is still required/)).toBeInTheDocument();
    expect(screen.getByText('t3x-skill-renderer@0.2.0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /SKILL\.md/ })).toBeInTheDocument();
    expect(screen.getByText('references/checklist.md')).toBeInTheDocument();
    expect(screen.getByText(/name: review-code/)).toBeInTheDocument();
  });
});
