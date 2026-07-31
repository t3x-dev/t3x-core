import type { SemanticContent, TreeNode } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import { resolveStateReaderKind, selectPromptRenderModel } from '@/domain/project/stateViewModel';

function node(
  key: string,
  slots: Record<string, never | unknown>,
  children: TreeNode[] = []
): TreeNode {
  return { children, key, slots: slots as TreeNode['slots'] };
}

const content: SemanticContent = {
  relations: [
    { from: 'messages/system_policy', to: 'messages/user_task', type: 'precedes' },
    { from: 'messages/user_task', to: 'variables/user_request', type: 'uses_variable' },
    { from: 'messages/user_task', to: 'resources/reference', type: 'uses_resource' },
    { from: 'contexts/project_sources', to: 'messages/user_task', type: 'provides_context' },
    { from: 'checks/compile', to: 'messages/user_task', type: 'verifies_message' },
    { from: 'evals/quality', to: 'messages/user_task', type: 'evaluates' },
    { from: 'output', to: 'resources/response_schema', type: 'uses_output_schema' },
  ],
  trees: [
    node('manifest', { name: 'extract-requirements', summary: 'Extract requirements.' }),
    node('contract', {
      goal: 'Return grounded requirements.',
      inputs: ['Request'],
      non_goals: ['Invent facts'],
      outputs: ['JSON'],
      truth_policy: 'evidence_only',
    }),
    node('variables', {}, [
      node('user_request', {
        description: 'Request to extract.',
        on_missing: 'ask_user',
        required: true,
        source: 'user',
        value_type: 'string',
      }),
      node('response_style', {
        default_value: 'concise',
        description: 'Response style.',
        on_missing: 'use_default',
        required: false,
        source: 'default',
        value_type: 'string',
      }),
    ]),
    node('messages', {}, [
      node('user_task', {
        on_missing_variable: 'report_and_stop',
        optional: false,
        purpose: 'Provide the request.',
        role: 'user',
        sequence: 2,
        template: '{{user_request}} in {{response_style}} form',
      }),
      node('system_policy', {
        on_missing_variable: 'report_and_stop',
        optional: false,
        purpose: 'Set policy.',
        role: 'system',
        sequence: 1,
        template: 'Use evidence only.',
      }),
    ]),
    node('contexts', {}, [
      node('project_sources', {
        kind: 'retrieval',
        load_policy: 'on_demand',
        on_empty: 'report_and_stop',
        placement: 'before_user',
        required: true,
      }),
    ]),
    node('runtime', {
      mode: 'chat',
      response_format: 'json_schema',
      streaming: false,
      tool_policy: 'none',
    }),
    node('output', {
      format: 'json_schema',
      on_parse_failure: 'report_and_stop',
      strict: true,
    }),
    node('resources', {}, [
      node('reference', {
        description: 'Grounding policy.',
        kind: 'reference',
        load_policy: 'on_demand',
        path: 'references/policy.md',
      }),
      node('validator', {
        description: 'Runtime validator.',
        kind: 'data',
        load_policy: 'execute_only',
        path: 'scripts/validate.js',
      }),
      node('response_schema', {
        description: 'Output schema.',
        kind: 'schema',
        load_policy: 'output_only',
        path: 'schemas/response.json',
      }),
    ]),
    node('checks', {}, [
      node('compile', {
        blocking: true,
        kind: 'template_compile',
        run_when: 'pre_compile',
      }),
    ]),
    node('evals', {}, [
      node('quality', {
        assertions: ['Grounded output'],
        fixture_resource: 'fixture',
        kind: 'quality',
        minimum_score: 0.9,
      }),
    ]),
  ],
};

describe('Prompt state render model', () => {
  it('routes canonical schema names without treating unknown state as PRD', () => {
    expect(resolveStateReaderKind('t3x/prd')).toBe('prd');
    expect(resolveStateReaderKind('t3x/skill')).toBe('skill');
    expect(resolveStateReaderKind('t3x/prompt')).toBe('prompt');
    expect(resolveStateReaderKind('vendor/device')).toBe('generic');
  });

  it('sorts messages, indexes relations, and retains exact validation and trace paths', () => {
    const model = selectPromptRenderModel(content, {
      issues: [
        {
          code: 'INVALID_TYPE',
          label: 'Invalid type',
          message: 'template must be a string',
          path: 'messages.user_task.template',
        },
      ],
      operations: [
        {
          created_at: '2026-07-30T08:00:00.000Z',
          id: 'op_prompt_1',
          source: 'source_chat',
          turn_hash: 'turn_prompt_1',
          yops: [
            { set: { path: 'messages/user_task/purpose', value: 'Old purpose' } },
            { set: { path: 'messages/user_task/template', value: '{{user_request}}' } },
          ],
        },
      ],
      sources: [{ id: 'conversation_1', title: 'Prompt brief', type: 'conversation' }],
    });

    expect(model.messages.map((message) => message.key)).toEqual(['system_policy', 'user_task']);
    expect(model.messages[1]).toMatchObject({
      contextKeys: ['project_sources'],
      latestYOp: {
        id: 'op_prompt_1',
        label: '02 SET',
        path: 'messages/user_task/template',
      },
      resourceKeys: ['reference'],
      variableKeys: ['response_style', 'user_request'],
    });
    expect(model.messages[1]?.issues).toEqual([
      expect.objectContaining({ path: 'messages/user_task/template' }),
    ]);
    expect(
      model.variables.find((variable) => variable.key === 'response_style')?.usedByMessageKeys
    ).toEqual(['user_task']);
  });

  it('never classifies execute-only or output-only resources as model context', () => {
    const model = selectPromptRenderModel(content);
    expect(
      Object.fromEntries(
        model.resources.map((resource) => [resource.key, resource.modelContextEligible])
      )
    ).toEqual({ reference: true, response_schema: false, validator: false });
    expect(model.output.schemaResource).toBe('response_schema');
    expect(model.checks[0]).toMatchObject({ blocking: true, verifiedMessageKeys: ['user_task'] });
    expect(model.evals[0]).toMatchObject({ evaluatedMessageKeys: ['user_task'] });
  });
});
