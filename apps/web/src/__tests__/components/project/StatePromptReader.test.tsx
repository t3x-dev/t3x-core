// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatePromptReader } from '@/components/project/StatePromptReader';
import type { PromptRenderModel } from '@/domain/project/stateViewModel';

const model: PromptRenderModel = {
  checks: [
    {
      assertions: [],
      blocking: true,
      fixtureResource: 'fixture',
      key: 'compile_templates',
      kind: 'template_compile',
      runWhen: 'pre_compile',
      successCriteria: ['No placeholders remain.'],
      verifiedMessageKeys: ['system_policy', 'user_task'],
      verifiesOutput: false,
    },
  ],
  contexts: [
    {
      key: 'project_sources',
      kind: 'retrieval',
      loadPolicy: 'on_demand',
      maxTokens: 6000,
      onEmpty: 'report_and_stop',
      placement: 'before_user',
      required: true,
      resourceKey: 'reference',
      targetMessageKeys: ['user_task'],
    },
  ],
  contract: {
    goal: 'Extract grounded requirements.',
    inputs: ['Request'],
    nonGoals: ['Invent facts'],
    outputs: ['JSON'],
    truthPolicy: 'evidence_only',
  },
  evals: [
    {
      assertions: ['Every requirement is grounded.'],
      evaluatedMessageKeys: ['user_task'],
      expectedOutput: 'Structured requirements.',
      fixtureResource: 'fixture',
      key: 'quality',
      kind: 'quality',
      minimumScore: 0.9,
    },
  ],
  issues: [
    {
      code: 'INVALID_TYPE',
      label: 'Invalid type',
      message: 'Template must be text.',
      path: 'messages/system_policy/template',
    },
  ],
  messages: [
    {
      contextKeys: [],
      issues: [
        {
          code: 'INVALID_TYPE',
          label: 'Invalid type',
          message: 'Template must be text.',
          path: 'messages/system_policy/template',
        },
      ],
      key: 'system_policy',
      latestYOp: {
        id: 'op_2',
        kind: 'set',
        label: '02 SET',
        path: 'messages/system_policy/template',
        source: 'source_chat',
      },
      onMissingVariable: 'report_and_stop',
      optional: false,
      purpose: 'Set grounding policy.',
      resourceKeys: ['reference'],
      role: 'system',
      sequence: 1,
      sources: [{ id: 'turn_1', label: 'Source Chat', type: 'turn' }],
      template: 'Use {{response_style}} and source evidence.',
      variableKeys: ['response_style'],
    },
    {
      contextKeys: ['project_sources'],
      issues: [],
      key: 'user_task',
      latestYOp: null,
      onMissingVariable: 'report_and_stop',
      optional: false,
      purpose: 'Provide the request.',
      resourceKeys: [],
      role: 'user',
      sequence: 2,
      sources: [{ id: 'conversation_1', label: 'Prompt brief', type: 'conversation' }],
      template: '{{user_request}}',
      variableKeys: ['user_request'],
    },
  ],
  name: 'extract-requirements',
  output: {
    format: 'json_schema',
    maxRetries: 0,
    onParseFailure: 'report_and_stop',
    schemaResource: 'response_schema',
    strict: true,
  },
  resources: [
    {
      contentHash: '',
      description: 'Grounding policy.',
      key: 'reference',
      kind: 'reference',
      loadPolicy: 'on_demand',
      mediaType: 'text/markdown',
      modelContextEligible: true,
      path: 'references/policy.md',
      usedByMessageKeys: ['system_policy'],
    },
    {
      contentHash: '',
      description: 'Response schema.',
      key: 'response_schema',
      kind: 'schema',
      loadPolicy: 'output_only',
      mediaType: 'application/schema+json',
      modelContextEligible: false,
      path: 'schemas/response.json',
      usedByMessageKeys: [],
    },
  ],
  runtime: {
    maxOutputTokens: 2000,
    mode: 'chat',
    responseFormat: 'json_schema',
    streaming: false,
    toolPolicy: 'none',
  },
  sources: [{ id: 'conversation_1', label: 'Prompt brief', type: 'conversation' }],
  summary: 'Extract source-backed product requirements.',
  variables: [
    {
      defaultValue: 'concise',
      description: 'Response style.',
      enumValues: ['concise', 'detailed'],
      issues: [],
      key: 'response_style',
      onMissing: 'use_default',
      required: false,
      sensitive: false,
      source: 'default',
      usedByMessageKeys: ['system_policy'],
      valuePattern: '^(concise|detailed)$',
      valueType: 'string',
    },
    {
      defaultValue: undefined,
      description: 'User request.',
      enumValues: [],
      issues: [],
      key: 'user_request',
      onMissing: 'ask_user',
      required: true,
      sensitive: false,
      source: 'user',
      usedByMessageKeys: ['user_task'],
      valuePattern: '',
      valueType: 'string',
    },
  ],
};

function renderReader() {
  return render(
    <StatePromptReader
      model={model}
      schemaName="t3x/prompt"
      validationGapCount={1}
      validationReady={false}
      yamlText="manifest:\n  name: extract-requirements"
    />
  );
}

describe('StatePromptReader', () => {
  it('defaults to ordered messages with exact validation, provenance, and latest YOp details', () => {
    renderReader();

    const messagesTab = screen.getByRole('tab', { name: 'Messages' });
    expect(messagesTab).toHaveAttribute('aria-selected', 'true');
    messagesTab.focus();
    fireEvent.keyDown(messagesTab, { key: 'ArrowRight' });
    const variablesTab = screen.getByRole('tab', { name: 'Variables' });
    expect(variablesTab).toHaveFocus();
    fireEvent.keyDown(variablesTab, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Messages' })).toHaveFocus();
    const messageButtons = screen
      .getAllByRole('button')
      .filter((button) =>
        ['system_policy', 'user_task'].some((key) => button.textContent?.includes(key))
      );
    expect(messageButtons[0]).toHaveTextContent('system_policy');
    expect(messageButtons[1]).toHaveTextContent('user_task');
    expect(screen.getAllByText('messages/system_policy/template')).not.toHaveLength(0);
    expect(screen.getByText('Source Chat')).toBeInTheDocument();
    expect(screen.getByText('02 SET')).toBeInTheDocument();
  });

  it('navigates variable and resource relations across reader views', () => {
    renderReader();

    fireEvent.click(screen.getByRole('button', { name: 'response_style' }));
    expect(screen.getByRole('tab', { name: 'Variables' })).toHaveAttribute('aria-selected', 'true');
    expect(document.querySelector('#prompt-variable-response_style')).toHaveClass(
      'bg-[var(--accent-commit)]/10'
    );

    fireEvent.click(screen.getByRole('button', { name: 'system_policy' }));
    fireEvent.click(screen.getByRole('button', { name: 'reference' }));
    expect(screen.getByRole('tab', { name: 'Context & Resources' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(document.querySelector('#prompt-resource-reference')).toHaveClass(
      'border-[var(--accent-commit)]'
    );
  });

  it('keeps output-only resources out of the model context section and splits checks from evals', () => {
    renderReader();

    fireEvent.click(screen.getByRole('tab', { name: 'Context & Resources' }));
    const modelContextSection = screen
      .getByRole('heading', { name: 'Context resources' })
      .closest('section');
    const excludedSection = screen
      .getByRole('heading', { name: 'Excluded from model context' })
      .closest('section');
    expect(modelContextSection).not.toBeNull();
    expect(excludedSection).not.toBeNull();
    expect(within(modelContextSection as HTMLElement).getAllByText('reference')).not.toHaveLength(
      0
    );
    expect(
      within(modelContextSection as HTMLElement).queryByText('response_schema')
    ).not.toBeInTheDocument();
    expect(within(excludedSection as HTMLElement).getByText('response_schema')).toBeInTheDocument();
    expect(within(excludedSection as HTMLElement).getByText('output_only')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Checks & Evals' }));
    expect(screen.getByRole('heading', { name: 'Blocking checks' })).toBeInTheDocument();
    expect(screen.getByText('compile_templates')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Non-blocking quality evals' })).toBeInTheDocument();
    expect(screen.getAllByText('quality')).not.toHaveLength(0);
    expect(screen.getByText('non-blocking')).toBeInTheDocument();
  });
});
