import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type CompiledPromptMessage,
  type CompiledPromptOutput,
  compilePrompt,
  type PromptCompileIssue,
  type PromptCompileResult,
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
    messages: z.array(CompiledPromptMessageSchema),
    variables: z.array(PromptVariableResolutionSchema),
    resources: z.array(PromptResourceResolutionSchema),
    output: CompiledPromptOutputSchema,
    issues: z.array(PromptCompileIssueSchema),
  })
  .openapi('PromptCompilePreviewResponse');

export interface PromptCompilePreviewResponse {
  compiled: boolean;
  schemaName: 't3x/prompt';
  schemaVersion: 'v1';
  messages: CompiledPromptMessage[];
  variables: PromptVariableResolution[];
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

  return c.json({ success: true as const, data: toCompilePreviewResponse(result) }, 200);
});

function toCompilePreviewResponse(result: PromptCompileResult): PromptCompilePreviewResponse {
  return {
    compiled: result.compiled,
    schemaName: result.schemaName,
    schemaVersion: result.schemaVersion,
    messages: result.messages,
    variables: result.variables,
    resources: result.resources,
    output: result.output,
    issues: result.issues,
  };
}
