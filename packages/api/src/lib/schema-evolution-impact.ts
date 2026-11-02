import type { AssistantSchemaSettingsInput, SchemaEvolutionImpact } from '@t3x-dev/api-client';
import { currentComposition } from '@t3x-dev/application';
import {
  createRepositorySemanticState,
  decodeRepositorySemanticState,
  repositorySemanticYSchemaTree,
} from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import {
  diffYSchemas,
  type NodeSchema,
  normalizeYSchemaObject,
  sha256CompositionValue,
  validateTree,
  type YSchema,
  type YSchemaRelation,
} from '@t3x-dev/yschema';
import { schemaChangeTarget } from './schema-change-contract';
import { workspaceAuthoringState } from './workspace-authoring';
import { workspaceProvenance } from './workspace-provenance';
import { hasNoWorkspaceBusinessContent } from './workspace-schema-content';
import { resolveWorkspaceYSchema } from './workspace-yschema';
import { schemaRootKeyFromBinding } from './yschema-registry';

type ImpactItem = SchemaEvolutionImpact['items'][number];
type Content = {
  source: SchemaEvolutionImpact['content']['source'];
  tree: Record<string, unknown>;
  relations: YSchemaRelation[];
};
const EMPTY_SCHEMA = normalizeYSchemaObject({ yschema: '0.1', name: 'Unbound', nodes: {} });
const INPUT_ERRORS = new Set(['REQUIRED_RELATION_MISSING']);

/** Read the complete current document. Never use a selected action or a client-provided sample. */
export function workspaceContent(workspace: Record<string, unknown>): Content {
  if (workspace.authoringLedger !== undefined) {
    const { ledger } = workspaceAuthoringState(workspace);
    const document = currentComposition(ledger);
    if (!record(document)) throw new TypeError('The current Draft document is not a mapping.');
    const bindings = Array.isArray(workspace.schemaBindings) ? workspace.schemaBindings : [];
    const rootKey = schemaRootKeyFromBinding(bindings[0]);
    return schemaContentFromDocument(document, rootKey);
  }
  const candidate = record(workspace.schemaCandidate) ? workspace.schemaCandidate : {};
  const fields = Array.isArray(candidate.fields) ? candidate.fields : [];
  const tree: Record<string, unknown> = Object.create(null);
  const collect = (field: unknown) => {
    if (!record(field)) return;
    if (Object.hasOwn(field, 'value') && typeof field.path === 'string') {
      const segments = field.path.split(/[/.]/).filter(Boolean);
      if (segments.some((segment) => ['__proto__', 'prototype', 'constructor'].includes(segment)))
        throw new TypeError('Unsupported candidate content path.');
      if (segments.length) {
        let parent = tree;
        for (const segment of segments.slice(0, -1)) {
          if (!record(parent[segment])) parent[segment] = Object.create(null);
          parent = parent[segment] as Record<string, unknown>;
        }
        parent[segments.at(-1)!] = field.value;
      }
    }
    if (Array.isArray(field.children)) field.children.forEach(collect);
  };
  fields.forEach(collect);
  const inputs = record(candidate.promptCompileInputs) ? candidate.promptCompileInputs : {};
  return {
    source: fields.length ? 'candidate_fields' : 'empty',
    tree,
    relations: Array.isArray(inputs.relations) ? inputs.relations : [],
  };
}

export function schemaContentFromDocument(
  document: Record<string, unknown>,
  rootKey: string
): Content {
  if (hasNoWorkspaceBusinessContent(document, rootKey))
    return { source: 'authoring_ledger', tree: {}, relations: [] };
  if (document.domain === 't3x.dev/semantic-content') {
    const state = createRepositorySemanticState(document.content as never);
    return {
      source: 'authoring_ledger',
      tree: repositorySemanticYSchemaTree(state, rootKey) as Record<string, unknown>,
      relations: decodeRepositorySemanticState(state).relations.map((relation) => ({
        ...relation,
        from: relation.from.startsWith(`${rootKey}/`)
          ? relation.from.slice(rootKey.length + 1)
          : relation.from,
        to: relation.to.startsWith(`${rootKey}/`)
          ? relation.to.slice(rootKey.length + 1)
          : relation.to,
      })),
    };
  }
  const root = document[rootKey];
  if (root !== undefined && !record(root))
    throw new TypeError('The bound Draft root is not a mapping.');
  if (root === undefined && Object.keys(document).length)
    throw new TypeError('The bound Draft root is missing.');
  return { source: 'authoring_ledger', tree: root ?? {}, relations: [] };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function definitionPaths(nodes: Record<string, NodeSchema>, prefix = 'nodes') {
  const paths = new Map<string, string>();
  const visit = (children: Record<string, NodeSchema>, definition: string, content: string) => {
    for (const [key, node] of Object.entries(children)) {
      const path = `${definition}.${key}`;
      const location = content ? `${content}/${key}` : key;
      paths.set(path, location);
      for (const slot of Object.keys(node.slots ?? {}))
        paths.set(`${path}.slots.${slot}`, `${location}${node.repeated ? '/*' : ''}/${slot}`);
      if (node.children && node.children !== 'any')
        visit(node.children, `${path}.children`, `${location}${node.repeated ? '/*' : ''}`);
    }
  };
  visit(nodes, prefix, '');
  return paths;
}

function contentPaths(tree: Record<string, unknown>): string[] {
  const paths: string[] = [];
  const visit = (value: unknown, path: string) => {
    if (path) paths.push(path);
    if (record(value))
      for (const key of Object.keys(value).sort()) visit(value[key], path ? `${path}/${key}` : key);
  };
  visit(tree, '');
  return paths;
}

function affectedPaths(pattern: string | undefined, paths: string[]) {
  if (!pattern) return [];
  const segments = pattern.split('/');
  return paths.filter((path) => {
    const actual = path.split('/');
    return (
      actual.length >= segments.length &&
      segments.every((segment, index) => segment === '*' || actual[index] === segment)
    );
  });
}

function finish(
  changes: SchemaEvolutionImpact['changes'],
  items: ImpactItem[],
  content: SchemaEvolutionImpact['content']
): SchemaEvolutionImpact {
  const status = items.some((item) => item.kind === 'blocked')
    ? 'blocked'
    : items.some((item) => item.kind === 'needs_mapping')
      ? 'needs_mapping'
      : items.some((item) => item.kind === 'needs_input')
        ? 'needs_input'
        : 'safe';
  return {
    status,
    // Input gaps may be adopted as pending work, then prepared and reviewed in the same Workspace.
    canAdopt: status === 'safe' || status === 'needs_input',
    canPublish: status === 'safe',
    changes,
    items,
    content,
  };
}

/** Shared server-side assessment for Studio Preview, Composition Apply and Publish. */
export async function assessWorkspaceSchemaImpact(
  db: AnyDB,
  projectId: string,
  workspace: Record<string, unknown>,
  target: YSchema,
  definitionValid = true,
  confirmedChange?: AssistantSchemaSettingsInput
): Promise<SchemaEvolutionImpact> {
  const items: ImpactItem[] = [];
  let changes: SchemaEvolutionImpact['changes'] = [];
  const unavailable: SchemaEvolutionImpact['content'] = {
    source: 'unavailable',
    hash: null,
    valid: null,
    ready: null,
    issues: [],
  };
  try {
    const resolution = await resolveWorkspaceYSchema(workspace, db, projectId);
    if (
      Array.isArray(workspace.schemaBindings) &&
      workspace.schemaBindings.length &&
      !resolution.schema
    )
      throw new TypeError('The currently bound Schema cannot be resolved.');
    const base = resolution.schema ?? EMPTY_SCHEMA;
    changes = diffYSchemas(base, target);
    const content = workspaceContent(workspace);
    const hash = await sha256CompositionValue({ tree: content.tree, relations: content.relations });
    if (!definitionValid) {
      items.push({
        kind: 'blocked',
        code: 'INVALID_DEFINITION',
        path: '$',
        message: 'Resolve the definition checks before assessing content impact.',
        affectedPaths: [],
      });
      return finish(changes, items, { ...unavailable, source: content.source, hash });
    }
    const paths = contentPaths(content.tree);
    const basePaths = definitionPaths(base.nodes);
    for (const change of changes) {
      const structuralRemoval =
        change.kind === 'REMOVE' &&
        (basePaths.has(change.path) ||
          change.path === 'nodes' ||
          change.path.endsWith('.slots') ||
          change.path.endsWith('.children') ||
          change.path.startsWith('relationTypes') ||
          change.path === 'rules');
      const owner = change.path.replace(/\.(type|repeated|children)$/, '');
      const shapeChange =
        basePaths.has(owner) &&
        (/\.(type|repeated)$/.test(change.path) ||
          (change.kind === 'CHANGE' && change.path.endsWith('.children')));
      if (structuralRemoval || shapeChange) {
        const pattern = basePaths.get(owner);
        items.push({
          kind: 'needs_mapping',
          code: structuralRemoval ? 'REMOVAL_REQUIRES_MAPPING' : 'SHAPE_CHANGE_REQUIRES_MAPPING',
          path: change.path,
          message: structuralRemoval
            ? 'This removal may also represent a rename. Provide an explicit content mapping before adoption or publication.'
            : 'This type or repetition change requires an explicit content conversion before adoption or publication.',
          affectedPaths: affectedPaths(pattern, paths),
        });
      } else {
        items.push({
          kind: change.kind === 'ADD' ? 'safe_addition' : 'safe_change',
          code: 'DEFINITION_CHANGE',
          path: change.path,
          message: change.summary,
          affectedPaths: [],
        });
      }
    }
    const provenanceByPath = await workspaceProvenance(
      db,
      projectId,
      workspace,
      content.tree as never
    );
    const previous = validateTree({
      schema: base,
      provenanceByPath,
      tree: content.tree as never,
      relations: content.relations,
    });
    const current = validateTree({
      schema: target,
      provenanceByPath,
      tree: content.tree as never,
      relations: content.relations,
    });
    if (current.valid) {
      for (const item of items) {
        const owner = item.path.replace(/\.(type|repeated|children)$/, '');
        const unaffectedDefinition = basePaths.has(owner) && item.affectedPaths.length === 0;
        if (
          ['REMOVAL_REQUIRES_MAPPING', 'SHAPE_CHANGE_REQUIRES_MAPPING'].includes(item.code) &&
          ((paths.length === 0 && content.relations.length === 0) || unaffectedDefinition)
        ) {
          item.kind = 'safe_change';
          item.code = 'NO_CONTENT_TO_MIGRATE';
          item.message = 'No existing content or relations require migration.';
        }
      }
    }
    // Only the exact explicit deletion can dismiss the ambiguous rename warning.
    // Validate all retained content and references first; this never authorizes
    // unrelated edits, conversion, YAML deletion, or an invalid strict contract.
    if (
      current.valid &&
      confirmedChange?.action.startsWith('remove_') &&
      (await sha256CompositionValue(
        normalizeYSchemaObject(schemaChangeTarget(base, confirmedChange).schema)
      )) === (await sha256CompositionValue(target))
    ) {
      for (const item of items) {
        if (item.code === 'REMOVAL_REQUIRES_MAPPING') {
          item.kind = 'safe_change';
          item.code = 'CONFIRMED_DEFINITION_REMOVAL';
          item.message =
            'Explicit definition removal; existing YAML content remains valid and is retained.';
        }
      }
    }
    const previousIssues = new Set(
      [...previous.errors, ...previous.gaps].map((issue) => `${issue.code}:${issue.path}`)
    );
    const targetPaths = definitionPaths(target.nodes);
    for (const issue of [...current.errors, ...current.gaps]) {
      if (previousIssues.has(`${issue.code}:${issue.path}`)) continue;
      const gap = current.gaps.includes(issue as never) || INPUT_ERRORS.has(issue.code);
      for (const item of items) {
        const location = targetPaths.get(item.path);
        if (
          item.kind === 'safe_addition' &&
          location &&
          (issue.path === location || issue.path.startsWith(`${location}/`))
        ) {
          item.kind = gap ? 'needs_input' : 'needs_mapping';
          item.message = gap
            ? 'This addition needs content to satisfy the new definition.'
            : issue.message;
        }
      }
      items.push({
        kind: gap ? 'needs_input' : 'needs_mapping',
        code: issue.code,
        path: issue.path,
        message: issue.message,
        affectedPaths: affectedPaths(issue.path, paths),
      });
    }
    return finish(changes, items, {
      source: content.source,
      hash,
      valid: current.valid,
      ready: current.ready,
      issues: [...current.errors, ...current.gaps].map(({ code, path, message }) => ({
        code,
        path,
        message,
      })),
    });
  } catch (error) {
    items.push({
      kind: 'blocked',
      code: 'WORKSPACE_IMPACT_UNAVAILABLE',
      path: '$',
      message:
        error instanceof Error ? error.message : 'Current Workspace content could not be checked.',
      affectedPaths: [],
    });
    return finish(changes, items, unavailable);
  }
}
