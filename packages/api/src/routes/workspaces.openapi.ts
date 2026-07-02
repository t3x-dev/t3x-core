/**
 * Workspace flow routes.
 *
 * These endpoints bridge the WebUI workspace review flow with backend-owned
 * candidate/YOps draft state. The first implementation is deterministic and
 * source-text based so local workspace review works without an LLM key.
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Material } from '@t3x-dev/core';
import { findMaterialsByProject } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { zodErrorHook } from '../lib/errors';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

const workspaceCache = new Map<string, WorkspaceEnvelope>();

const SourceBundleItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  description: z.string().optional(),
  conversationId: z.string().optional(),
  materialId: z.string().optional(),
  contentHash: z.string().optional(),
  tokenEstimate: z.number().optional(),
  fileName: z.string().optional(),
  previewText: z.string().optional(),
  previewTurns: z
    .array(
      z.object({
        id: z.string(),
        role: z.string(),
        author: z.string(),
        content: z.string(),
      })
    )
    .optional(),
});

const ExtractCandidateRequestSchema = z.object({
  workspace: z.record(z.string(), z.unknown()),
  sources: z.array(SourceBundleItemSchema).default([]),
});

const SendYOpsRequestSchema = z.object({
  workspace: z.record(z.string(), z.unknown()),
});

const WorkspaceResponseSchema = z.object({
  candidate_id: z.string(),
  yops_draft_id: z.string().optional(),
  workspace: z.record(z.string(), z.unknown()),
});

const workspaceParams = z.object({
  projectId: z.string(),
  workspaceId: z.string(),
});

const extractCandidateRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/extract-candidate',
  tags: ['Workspaces'],
  summary: 'Extract a workspace candidate from backend source materials',
  request: {
    params: workspaceParams,
    body: {
      content: {
        'application/json': {
          schema: ExtractCandidateRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Extracted workspace candidate',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(WorkspaceResponseSchema),
        },
      },
    },
    404: {
      description: 'Workspace not found',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
  },
});

const sendYOpsDraftRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/yops-draft',
  tags: ['Workspaces'],
  summary: 'Create a YOps draft from the extracted workspace candidate',
  request: {
    params: workspaceParams,
    body: {
      content: {
        'application/json': {
          schema: SendYOpsRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Workspace YOps draft',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(WorkspaceResponseSchema),
        },
      },
    },
    404: {
      description: 'Workspace not found',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
  },
});

export const workspaceRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

workspaceRoutes.openapi(extractCandidateRoute, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const { sources, workspace } = c.req.valid('json');
  const db = await getDB();
  const materials = await safeFindMaterialsByProject(db, projectId);
  const sourceTexts = mergeSourceTexts(sources, materials);
  const nextWorkspace = buildExtractedWorkspace(workspace, projectId, sourceTexts);
  const candidateId = candidateIdFor(workspaceId, sourceTexts);
  const envelope = { candidate_id: candidateId, workspace: nextWorkspace };
  workspaceCache.set(cacheKey(projectId, workspaceId), envelope);

  return c.json({
    success: true as const,
    data: envelope,
  });
});

workspaceRoutes.openapi(sendYOpsDraftRoute, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const { workspace } = c.req.valid('json');
  const cached = workspaceCache.get(cacheKey(projectId, workspaceId));
  const sourceWorkspace = workspace;
  const candidateId = cached?.candidate_id ?? `candidate:${workspaceId}`;
  const nextWorkspace = {
    ...sourceWorkspace,
    yopsDraft: buildYOpsDraft(sourceWorkspace, candidateId),
  };
  const envelope = {
    candidate_id: candidateId,
    yops_draft_id: nextWorkspace.yopsDraft.id,
    workspace: nextWorkspace,
  };
  workspaceCache.set(cacheKey(projectId, workspaceId), envelope);

  return c.json({
    success: true as const,
    data: envelope,
  });
});

interface WorkspaceEnvelope {
  candidate_id: string;
  yops_draft_id?: string;
  workspace: Record<string, unknown>;
}

interface WorkspaceSourceText {
  id: string;
  title: string;
  text: string;
}

async function safeFindMaterialsByProject(
  db: Awaited<ReturnType<typeof getDB>>,
  projectId: string
): Promise<Material[]> {
  try {
    return await findMaterialsByProject(db, projectId, { limit: 500 });
  } catch {
    return [];
  }
}

function mergeSourceTexts(
  sources: z.infer<typeof SourceBundleItemSchema>[],
  materials: Material[]
): WorkspaceSourceText[] {
  const materialById = new Map(materials.map((material) => [material.id, material]));
  const fromSources = sources.flatMap((source): WorkspaceSourceText[] => {
    const material = source.materialId ? materialById.get(source.materialId) : undefined;
    const chatText = source.previewTurns
      ?.map((turn) => `${turn.author}: ${turn.content}`)
      .join('\n');
    const text =
      material?.content_text ?? chatText ?? source.previewText ?? source.description ?? '';
    if (!text.trim()) return [];
    return [{ id: source.id, title: source.title, text }];
  });

  const sourceMaterialIds = new Set(
    sources.flatMap((source) => (source.materialId ? [source.materialId] : []))
  );
  const extraMaterials = materials
    .filter((material) => !sourceMaterialIds.has(material.id))
    .map((material) => ({
      id: `material:${material.id}`,
      title: material.title ?? material.filename ?? material.id,
      text: material.content_text,
    }));

  return [...fromSources, ...extraMaterials];
}

function buildExtractedWorkspace(
  workspace: Record<string, unknown>,
  projectId: string,
  sourceTexts: WorkspaceSourceText[]
): Record<string, unknown> {
  const sourceText = sourceTexts.map((source) => source.text).join('\n\n');
  const fields = [
    {
      id: 'field_prd_summary',
      path: 'summary',
      label: 'Summary',
      type: 'object',
      required: true,
      status: sourceTexts.length > 0 ? 'covered' : 'missing',
      sourceRefs: sourceTexts.length,
      children: [
        extractedField(
          'field_prd_summary_audience',
          'summary.audience',
          'Audience',
          extractAudience(sourceText),
          sourceTexts
        ),
        extractedField(
          'field_prd_summary_goal',
          'summary.goal',
          'Goal',
          extractGoal(sourceText),
          sourceTexts
        ),
      ],
    },
    {
      id: 'field_prd_scope',
      path: 'scope',
      label: 'Scope',
      type: 'object',
      required: true,
      status: sourceTexts.length > 0 ? 'covered' : 'missing',
      sourceRefs: sourceTexts.length,
      children: [
        extractedField(
          'field_prd_scope_non_goals',
          'scope.non_goals',
          'Non-goals',
          extractNonGoal(sourceText),
          sourceTexts,
          false,
          'string[]'
        ),
      ],
    },
  ];

  return {
    ...workspace,
    projectId,
    schemaCandidate: {
      summary:
        sourceTexts.length > 0
          ? `Backend extracted ${fields.flatMap((field) => field.children ?? []).filter((field) => field.status === 'covered').length} candidate fields from ${sourceTexts.length} source${sourceTexts.length === 1 ? '' : 's'}.`
          : 'No backend source text available for candidate extraction.',
      fields,
    },
    schemaReview: {
      verdict: sourceTexts.length > 0 ? 'ready' : 'needs_review',
      summary:
        sourceTexts.length > 0
          ? 'Candidate extracted from backend source material.'
          : 'Add source material before YOps handoff.',
      gaps: sourceTexts.length > 0 ? [] : ['No backend source material.'],
    },
  };
}

function extractedField(
  id: string,
  path: string,
  label: string,
  value: string,
  sources: WorkspaceSourceText[],
  required = true,
  type = 'string'
) {
  const covered = value.trim().length > 0;
  return {
    id,
    path,
    label,
    type,
    required,
    status: covered ? 'covered' : required ? 'missing' : 'needs_confirmation',
    value: covered ? value : undefined,
    evidence: covered ? evidenceFor(value, sources) : undefined,
    sourceRefs: covered ? sources.length : 0,
  };
}

function buildYOpsDraft(workspace: Record<string, unknown>, candidateId: string) {
  const fields = flattenCandidateFields(workspace);
  const operations = fields
    .filter((field) => field.status === 'covered' && field.value)
    .map((field, index) => {
      const path = schemaPathToYOpsPath(workspace, field.path);
      return {
        id: `op_backend_${index + 1}`,
        op: field.type === 'string[]' ? 'add' : 'set',
        path: field.type === 'string[]' ? `${path}/-` : path,
        summary: `Set ${field.path} from backend candidate extraction.`,
        beforeValue: field.type === 'string[]' ? 'No value recorded' : '',
        afterValue: field.value,
        reason:
          field.evidence ??
          `Backend candidate ${candidateId} covered ${field.path} from included source material.`,
        sourceRefs: extractWorkspaceSourceRefs(workspace),
      };
    });

  return {
    id: `draft:${candidateId}`,
    operations,
  };
}

function flattenCandidateFields(workspace: Record<string, unknown>): Array<Record<string, string>> {
  const candidate = workspace.schemaCandidate as { fields?: unknown[] } | undefined;
  const fields = Array.isArray(candidate?.fields) ? candidate.fields : [];
  return fields.flatMap(flattenField);
}

function flattenField(field: unknown): Array<Record<string, string>> {
  if (!field || typeof field !== 'object') return [];
  const record = field as Record<string, unknown>;
  const children = Array.isArray(record.children) ? record.children : [];
  return [record as Record<string, string>, ...children.flatMap((child) => flattenField(child))];
}

function schemaPathToYOpsPath(workspace: Record<string, unknown>, path: string) {
  const rootKey = String(
    (workspace.schemaBindings as Array<{ schemaName?: string }> | undefined)?.[0]?.schemaName ??
      'Candidate'
  )
    .replace(/\s+Schema$/i, '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

  return [rootKey, ...path.split('.').filter(Boolean)].join('/');
}

function extractWorkspaceSourceRefs(workspace: Record<string, unknown>): string[] {
  const sources = workspace.sourceBundle;
  if (!Array.isArray(sources)) return [];
  return sources
    .map((source) =>
      source && typeof source === 'object' ? String((source as { id?: unknown }).id ?? '') : ''
    )
    .filter(Boolean);
}

function extractAudience(text: string): string {
  const explicit = matchLabeledValue(text, ['audience', 'reviewers', '受众', '评审']);
  if (explicit) return trimSentence(explicit);
  if (/product/i.test(text) && /engineering/i.test(text))
    return 'Product and engineering reviewers';
  if (/用户|客户|受众/.test(text)) return trimSentence(text);
  return '';
}

function extractGoal(text: string): string {
  const explicit = matchLabeledValue(text, ['goal', 'objective', 'purpose', '目标']);
  if (explicit) return trimSentence(explicit);
  return firstMeaningfulSentence(text);
}

function extractNonGoal(text: string): string {
  const explicit = matchLabeledValue(text, [
    'non-goal',
    'non goal',
    'out of scope',
    '非目标',
    '不做',
  ]);
  if (explicit) return trimSentence(explicit);
  const sentence = text
    .split(/[。.!?\n]/)
    .map((part) => part.trim())
    .find((part) => /not|avoid|exclude|不|不要|避免/i.test(part));
  return sentence ? trimSentence(sentence) : '';
}

function matchLabeledValue(text: string, labels: string[]): string {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = text.match(new RegExp(`${escaped}\\s*[:：-]\\s*([^\\n。.!?]+)`, 'i'));
    if (match?.[1]) return match[1];
  }
  return '';
}

function firstMeaningfulSentence(text: string): string {
  return (
    text
      .split(/[。.!?\n]/)
      .map((part) => part.trim())
      .find((part) => part.length >= 12) ?? ''
  );
}

function trimSentence(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 220);
}

function evidenceFor(value: string, sources: WorkspaceSourceText[]): string {
  const sourceTitle = sources[0]?.title ?? 'backend source material';
  return `${sourceTitle}: ${value}`;
}

function cacheKey(projectId: string, workspaceId: string): string {
  return `${projectId}:${workspaceId}`;
}

function candidateIdFor(workspaceId: string, sources: WorkspaceSourceText[]): string {
  const signature = sources
    .map((source) => `${source.id}:${source.text.length}`)
    .join('|')
    .slice(0, 48);
  return `candidate:${workspaceId}:${signature || 'empty'}`;
}
