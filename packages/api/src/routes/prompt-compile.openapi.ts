import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type CompiledPromptMessage,
  type CompiledPromptOutput,
  compilePrompt,
  type PromptCompileIssue,
  type PromptCompileResult,
  type PromptContextResolution,
  type PromptResourceResolution,
  type PromptVariableResolution,
} from '@t3x-dev/core';
import { createError, zodErrorHook } from '../lib/errors';
import { resolveBuiltInYSchema } from '../lib/yschema-registry';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

const PromptRelationSchema = z
  .object({
    type: z.string().min(1),
    from: z.string().min(1),
    to: z.string().min(1),
  })
  .openapi('PromptCompileRelation');

const PromptCompileInputSourceSchema = z
  .object({
    kind: z.enum(['fixture', 'workspace', 'request']),
    label: z.string().min(1),
    sourceCount: z.number().int().nonnegative().default(0),
  })
  .openapi('PromptCompileInputSource');

export const PromptCompilePreviewRequestSchema = z
  .object({
    schema_name: z.string().min(1).default('t3x/prompt'),
    schema_version: z.string().min(1).default('v1'),
    candidate: z.record(z.string(), z.any()),
    relations: z.array(PromptRelationSchema).default([]),
    provenance_by_path: z.record(z.string(), z.array(z.any())).optional(),
    variable_values: z.record(z.string(), z.any()).optional(),
    context_contents: z.record(z.string(), z.string()).optional(),
    resource_contents: z.record(z.string(), z.string()).optional(),
    input_source: PromptCompileInputSourceSchema.optional(),
  })
  .openapi('PromptCompilePreviewRequest');

const PromptCompileIssueSchema = z
  .object({
    code: z.string(),
    path: z.string(),
    message: z.string(),
    source: z.enum(['yschema', 'policy', 'compile']),
    blocking: z.boolean(),
    details: z.record(z.string(), z.any()).optional(),
  })
  .openapi('PromptCompileIssue');

const CompiledPromptMessageSchema = z
  .object({
    key: z.string(),
    path: z.string(),
    sequence: z.number(),
    role: z.string(),
    content: z.string(),
    variableKeys: z.array(z.string()),
    contextKeys: z.array(z.string()),
    resourceKeys: z.array(z.string()),
  })
  .openapi('CompiledPromptMessage');

const PromptVariableResolutionSchema = z
  .object({
    key: z.string(),
    path: z.string(),
    source: z.string(),
    required: z.boolean(),
    sensitive: z.boolean(),
    status: z.enum(['resolved', 'defaulted', 'empty', 'missing', 'invalid']),
    value: z.any().optional(),
  })
  .openapi('PromptVariableResolution');

const PromptResourceResolutionSchema = z
  .object({
    key: z.string(),
    path: z.string(),
    kind: z.string(),
    bundlePath: z.string(),
    referenced: z.boolean(),
    available: z.boolean(),
    contentHash: z.string().optional(),
  })
  .openapi('PromptResourceResolution');

const PromptContextResolutionSchema = z
  .object({
    key: z.string(),
    path: z.string(),
    kind: z.string(),
    loadPolicy: z.string(),
    placement: z.string(),
    required: z.boolean(),
    status: z.enum(['resolved', 'missing']),
    targetMessageKeys: z.array(z.string()),
    resourceKey: z.string().optional(),
    contentHash: z.string().optional(),
  })
  .openapi('PromptContextResolution');

const PromptCompileAdapterSchema = z
  .object({
    id: z.literal('portable-preview'),
    mode: z.string(),
    responseFormat: z.string(),
    streaming: z.boolean(),
    toolPolicy: z.string(),
    maxOutputTokens: z.number().nonnegative(),
  })
  .openapi('PromptCompileAdapter');

const PromptContextBudgetSchema = z
  .object({
    maxTokens: z.number().nonnegative(),
    resolved: z.number().int().nonnegative(),
    missing: z.number().int().nonnegative(),
  })
  .openapi('PromptContextBudget');

const CompiledPromptOutputSchema = z
  .object({
    format: z.string(),
    strict: z.boolean(),
    onParseFailure: z.string(),
    maxRetries: z.number(),
    schemaResource: z.string().optional(),
    schema: z.any().optional(),
    schemaHash: z.string().optional(),
  })
  .openapi('CompiledPromptOutput');

export const PromptCompilePreviewResponseSchema = z
  .object({
    compiled: z.boolean(),
    schemaName: z.literal('t3x/prompt'),
    schemaVersion: z.literal('v1'),
    compilerVersion: z.string(),
    compileHash: z.string().optional(),
    inputSource: PromptCompileInputSourceSchema,
    adapter: PromptCompileAdapterSchema,
    messages: z.array(CompiledPromptMessageSchema),
    variables: z.array(PromptVariableResolutionSchema),
    contexts: z.array(PromptContextResolutionSchema),
    contextBudget: PromptContextBudgetSchema,
    resources: z.array(PromptResourceResolutionSchema),
    output: CompiledPromptOutputSchema,
    issues: z.array(PromptCompileIssueSchema),
  })
  .openapi('PromptCompilePreviewResponse');

export interface PromptCompilePreviewResponse {
  compiled: boolean;
  schemaName: 't3x/prompt';
  schemaVersion: 'v1';
  compilerVersion: string;
  compileHash?: string;
  inputSource: z.infer<typeof PromptCompileInputSourceSchema>;
  adapter: z.infer<typeof PromptCompileAdapterSchema>;
  messages: CompiledPromptMessage[];
  variables: PromptVariableResolution[];
  contexts: Array<Omit<PromptContextResolution, 'content'>>;
  contextBudget: z.infer<typeof PromptContextBudgetSchema>;
  resources: PromptResourceResolution[];
  output: CompiledPromptOutput;
  issues: PromptCompileIssue[];
}

const compilePreviewRoute = createRoute({
  method: 'post',
  path: '/v1/prompts/compile-preview',
  tags: ['Prompts'],
  summary: 'Validate and deterministically compile a Prompt candidate',
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: PromptCompilePreviewRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Prompt compilation preview, including blocking validation issues',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(PromptCompilePreviewResponseSchema),
        },
      },
    },
    400: {
      description: 'Invalid request or unavailable Prompt runtime',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

export const promptCompileRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });

promptCompileRoutes.openapi(compilePreviewRoute, async (c) => {
  const body = c.req.valid('json');
  const schema = resolveBuiltInYSchema(body.schema_name, body.schema_version);

  if (!schema || schema.name !== 't3x/prompt') {
    return c.json(
      createError(
        'INVALID_REQUEST',
        `Prompt compiler runtime is unavailable for ${body.schema_name}@${body.schema_version}`,
        { schema_name: body.schema_name, schema_version: body.schema_version }
      ),
      400
    );
  }

  const result = compilePrompt({
    tree: body.candidate,
    relations: body.relations,
    provenanceByPath: body.provenance_by_path,
    variableValues: body.variable_values,
    contextContents: body.context_contents,
    resourceContents: body.resource_contents,
  });

  return c.json(
    {
      success: true as const,
      data: toCompilePreviewResponse(result, body.candidate, body.input_source),
    },
    200
  );
});

function toCompilePreviewResponse(
  result: PromptCompileResult,
  candidate: Record<string, unknown>,
  inputSource?: z.infer<typeof PromptCompileInputSourceSchema>
): PromptCompilePreviewResponse {
  const runtime = isRecord(candidate.runtime) ? candidate.runtime : {};
  const contexts = isRecord(candidate.contexts) ? candidate.contexts : {};
  const maxTokens = Object.values(contexts).reduce(
    (total, context) =>
      total +
      (isRecord(context) && typeof context.max_tokens === 'number' ? context.max_tokens : 0),
    0
  );
  return {
    compiled: result.compiled,
    schemaName: result.schemaName,
    schemaVersion: result.schemaVersion,
    compilerVersion: result.compilerVersion,
    ...(result.compileHash ? { compileHash: result.compileHash } : {}),
    inputSource: inputSource ?? {
      kind: 'request',
      label: 'Compile preview request',
      sourceCount: 0,
    },
    adapter: {
      id: 'portable-preview',
      mode: stringValue(runtime.mode),
      responseFormat: stringValue(runtime.response_format),
      streaming: runtime.streaming === true,
      toolPolicy: stringValue(runtime.tool_policy),
      maxOutputTokens:
        typeof runtime.max_output_tokens === 'number' ? runtime.max_output_tokens : 0,
    },
    messages: result.messages,
    variables: result.variables,
    contexts: result.contexts.map(({ content: _content, ...context }) => context),
    contextBudget: {
      maxTokens,
      resolved: result.contexts.filter((context) => context.status === 'resolved').length,
      missing: result.contexts.filter((context) => context.status === 'missing').length,
    },
    resources: result.resources,
    output: result.output,
    issues: result.issues,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
