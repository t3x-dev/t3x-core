/**
 * Live evaluation: can the real generation model author deep schemas from schemaLayout alone?
 *
 * Opt-in because it calls a paid provider:
 *   set -a; source .env; set +a
 *   T3X_LIVE_LLM=1 [T3X_LIVE_MODEL=gpt-5.4] pnpm --filter @t3x-dev/api exec vitest run \
 *     src/__tests__/proposal-generation-layout-live.test.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  applyNativeYOps,
  createOpenAIProvider,
  type ProposalContextBundleV1,
  proposalGenerationProfileResource,
} from '@t3x-dev/core';
import { type NodeSchema, validateTree, type YSchema } from '@t3x-dev/yschema';
import { describe, expect, it } from 'vitest';
import { GENERATION_PROMPT, type ProposalGenerationModelInput } from '../lib/proposal-generation';
import { createProposalGenerationModel } from '../lib/proposal-generation-model';
import { type SemanticSchemaLayout, semanticSchemaLayout } from '../lib/semantic-schema-layout';

const LIVE = process.env.T3X_LIVE_LLM === '1' && Boolean(process.env.OPENAI_API_KEY);
const MODEL = process.env.T3X_LIVE_MODEL ?? 'gpt-5.4';
const REPORT_DIR = resolve(__dirname, '../../../../.v2-runs/proposal-layout-live');
const KEY_RE = /^[a-z][a-z0-9_]*$/;

interface Domain {
  id: string;
  title: string;
  rootKey: string;
  /** Nested non-repeated sections, outermost first; each level also owns one repeated collection. */
  sections: string[];
  collections: string[];
  statuses: string[];
}

const DOMAINS: Domain[] = [
  {
    id: 'incident_runbook',
    title: '线上故障处置手册',
    rootKey: 'runbook',
    sections: ['service', 'component'],
    collections: ['alerts', 'steps', 'contacts'],
    statuses: ['active', 'retired'],
  },
  {
    id: 'clinical_trial',
    title: '临床试验方案',
    rootKey: 'protocol',
    sections: ['study', 'arm', 'visit'],
    collections: ['sites', 'cohorts', 'procedures', 'measures'],
    statuses: ['planned', 'enrolling', 'closed'],
  },
  {
    id: 'game_design',
    title: '游戏设计文档',
    rootKey: 'gdd',
    sections: ['world', 'region', 'zone', 'encounter'],
    collections: ['factions', 'quests', 'npcs', 'loot', 'triggers'],
    statuses: ['draft', 'locked'],
  },
  {
    id: 'course_syllabus',
    title: '大学课程大纲',
    rootKey: 'syllabus',
    sections: ['program', 'course'],
    collections: ['outcomes', 'modules', 'assessments'],
    statuses: ['required', 'elective'],
  },
  {
    id: 'datacenter',
    title: '数据中心容量规划',
    rootKey: 'capacity_plan',
    sections: ['campus', 'hall', 'row', 'rack', 'chassis'],
    collections: ['utilities', 'cooling_units', 'pdus', 'servers', 'blades', 'ports'],
    statuses: ['online', 'maintenance', 'offline'],
  },
  {
    id: 'recipe_book',
    title: '餐厅菜谱手册',
    rootKey: 'cookbook',
    sections: ['menu', 'course'],
    collections: ['seasons', 'dishes', 'ingredients'],
    statuses: ['available', 'seasonal'],
  },
  {
    id: 'legal_contract',
    title: '软件授权合同',
    rootKey: 'contract',
    sections: ['agreement', 'article', 'clause'],
    collections: ['parties', 'articles_index', 'obligations', 'exceptions'],
    statuses: ['binding', 'optional'],
  },
  {
    id: 'manufacturing_bom',
    title: '电动车物料清单',
    rootKey: 'bom',
    sections: ['vehicle', 'assembly', 'subassembly', 'part_family'],
    collections: ['variants', 'assemblies_index', 'parts', 'suppliers', 'tolerances'],
    statuses: ['released', 'prototype', 'obsolete'],
  },
  {
    id: 'event_plan',
    title: '技术大会活动策划',
    rootKey: 'event',
    sections: ['conference', 'track'],
    collections: ['venues', 'sessions', 'speakers'],
    statuses: ['confirmed', 'tentative'],
  },
  {
    id: 'api_spec',
    title: '支付 API 规格说明',
    rootKey: 'api',
    sections: ['service', 'resource', 'endpoint'],
    collections: ['environments', 'resources_index', 'parameters', 'errors'],
    statuses: ['stable', 'beta', 'deprecated'],
  },
  {
    id: 'research_grant',
    title: '科研基金申请书',
    rootKey: 'proposal',
    sections: ['project', 'aim', 'experiment', 'protocol_step'],
    collections: ['investigators', 'aims_index', 'experiments_index', 'reagents', 'risks'],
    statuses: ['funded', 'pending'],
  },
  {
    id: 'city_zoning',
    title: '城市分区规划',
    rootKey: 'zoning',
    sections: ['city', 'district', 'block', 'parcel', 'structure'],
    collections: [
      'departments',
      'districts_index',
      'streets',
      'parcels_index',
      'permits',
      'inspections',
    ],
    statuses: ['approved', 'review', 'rejected'],
  },
  {
    id: 'ml_pipeline',
    title: '机器学习训练流水线',
    rootKey: 'pipeline',
    sections: ['platform', 'stage'],
    collections: ['datasets', 'stages_index', 'metrics'],
    statuses: ['enabled', 'disabled'],
  },
  {
    id: 'hotel_ops',
    title: '酒店运营手册',
    rootKey: 'operations',
    sections: ['property', 'department', 'shift'],
    collections: ['amenities', 'departments_index', 'tasks', 'checklists'],
    statuses: ['daily', 'weekly', 'monthly'],
  },
  {
    id: 'satellite_mission',
    title: '卫星任务设计',
    rootKey: 'mission',
    sections: ['mission_profile', 'spacecraft', 'subsystem', 'component'],
    collections: [
      'ground_stations',
      'payloads',
      'subsystems_index',
      'components_index',
      'failure_modes',
    ],
    statuses: ['nominal', 'degraded', 'safe_mode'],
  },
  {
    id: 'retail_catalog',
    title: '电商商品目录',
    rootKey: 'catalog',
    sections: ['store', 'department', 'category', 'subcategory', 'product_line'],
    collections: ['channels', 'departments_index', 'categories_index', 'brands', 'skus', 'bundles'],
    statuses: ['listed', 'draft', 'archived'],
  },
  {
    id: 'security_policy',
    title: '企业信息安全策略',
    rootKey: 'policy',
    sections: ['program', 'domain'],
    collections: ['owners', 'controls', 'exceptions'],
    statuses: ['enforced', 'monitoring'],
  },
  {
    id: 'film_production',
    title: '电影制作计划',
    rootKey: 'production',
    sections: ['film', 'act', 'scene'],
    collections: ['crew', 'acts_index', 'shots', 'props'],
    statuses: ['scheduled', 'shot', 'cut'],
  },
  {
    id: 'farm_management',
    title: '农场经营计划',
    rootKey: 'farm_plan',
    sections: ['farm', 'field', 'plot', 'crop_cycle'],
    collections: ['equipment', 'fields_index', 'plots_index', 'treatments', 'harvests'],
    statuses: ['growing', 'fallow', 'harvested'],
  },
  {
    id: 'org_handbook',
    title: '公司组织手册',
    rootKey: 'handbook',
    sections: ['company', 'division', 'department', 'team', 'role'],
    collections: [
      'offices',
      'divisions_index',
      'departments_index',
      'teams_index',
      'responsibilities',
      'skills',
    ],
    statuses: ['open', 'filled', 'frozen'],
  },
];

function collectionNode(statuses: string[]): NodeSchema {
  return {
    required: true,
    repeated: true,
    slots: {
      name: { type: 'string', minLength: 1 },
      status: { type: 'string', enum: statuses },
      priority: { type: 'integer', minimum: 1, maximum: 5 },
      tags: { type: 'array' },
    },
    requiredSlots: ['name', 'status'],
  };
}

/** Each section holds its own collection and the next, deeper section. */
function sectionNode(domain: Domain, depth: number): NodeSchema {
  const children: Record<string, NodeSchema> = {
    [domain.collections[depth + 1]!]: collectionNode(domain.statuses),
  };
  const next = domain.sections[depth + 1];
  if (next) children[next] = sectionNode(domain, depth + 1);
  return {
    required: true,
    slots: { name: { type: 'string', minLength: 1 }, description: { type: 'string' } },
    requiredSlots: ['name'],
    children,
  };
}

function domainSchema(domain: Domain): YSchema {
  return {
    yschema: '0.1',
    name: `eval/${domain.id}`,
    strict: true,
    nodes: {
      overview: {
        required: true,
        slots: {
          title: { type: 'string', minLength: 1 },
          summary: { type: 'string', minLength: 1 },
          owner: { type: 'string' },
        },
        requiredSlots: ['title', 'summary'],
      },
      [domain.collections[0]!]: collectionNode(domain.statuses),
      [domain.sections[0]!]: sectionNode(domain, 0),
    },
  };
}

type Tree = { key: unknown; slots: unknown; children: unknown };
type WellFormedTree = { key: string; slots: Record<string, unknown>; children: WellFormedTree[] };

function isTree(value: unknown): value is Tree {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as Tree).key === 'string' &&
    (value as Tree).slots !== null &&
    typeof (value as Tree).slots === 'object' &&
    !Array.isArray((value as Tree).slots) &&
    Array.isArray((value as Tree).children)
  );
}

function malformedPaths(trees: unknown[], path: string): string[] {
  return trees.flatMap((tree, index) =>
    isTree(tree)
      ? malformedPaths(tree.children as unknown[], `${path}/[key=${tree.key}]/children`)
      : [`${path}/[${index}] is ${JSON.stringify(tree)?.slice(0, 60)}`]
  );
}

/** Walk the materialized tree against schemaLayout: no unknown nodes, slots, or misplaced items. */
function layoutViolations(
  tree: WellFormedTree,
  nodes: Record<string, NodeSchema>,
  path: string
): string[] {
  return tree.children.flatMap((child) => {
    const node = nodes[child.key];
    const childPath = `${path}/children/[key=${child.key}]`;
    if (!node) return [`unknown node ${childPath}`];
    if (!node.repeated) {
      return [
        ...unknownSlots(child, node, childPath),
        ...layoutViolations(child, node.children === 'any' ? {} : (node.children ?? {}), childPath),
      ];
    }
    const issues = Object.keys(child.slots).length
      ? [`collection ${childPath} has slots ${Object.keys(child.slots).join(',')}`]
      : [];
    for (const item of child.children) {
      const itemPath = `${childPath}/children/[key=${item.key}]`;
      if (!KEY_RE.test(item.key)) issues.push(`item key not machine-safe: ${itemPath}`);
      if (item.children.length) issues.push(`item has children: ${itemPath}`);
      issues.push(...unknownSlots(item, node, itemPath));
    }
    return issues;
  });
}

function unknownSlots(tree: WellFormedTree, node: NodeSchema, path: string): string[] {
  const declared = new Set(Object.keys(node.slots ?? {}));
  return Object.keys(tree.slots)
    .filter((slot) => !declared.has(slot))
    .map((slot) => `unknown slot ${path}/slots/${slot}`);
}

function repeatedItemCounts(
  tree: WellFormedTree,
  nodes: Record<string, NodeSchema>,
  path: string
): Array<{ path: string; items: number }> {
  return tree.children.flatMap((child) => {
    const node = nodes[child.key];
    if (!node) return [];
    const childPath = `${path}/${child.key}`;
    if (node.repeated) return [{ path: childPath, items: child.children.length }];
    return repeatedItemCounts(
      child,
      node.children === 'any' ? {} : (node.children ?? {}),
      childPath
    );
  });
}

const plain = (tree: WellFormedTree): Record<string, unknown> => ({
  ...tree.slots,
  ...Object.fromEntries(tree.children.map((child) => [child.key, plain(child)])),
});

function schemaDepth(nodes: Record<string, NodeSchema>): number {
  return Math.max(
    0,
    ...Object.values(nodes).map(
      (node) =>
        1 + (node.repeated ? 1 : schemaDepth(node.children === 'any' ? {} : (node.children ?? {})))
    )
  );
}

function generationInput(
  schema: YSchema,
  layout: SemanticSchemaLayout,
  domain: Domain
): ProposalGenerationModelInput {
  const instruction = `从零创建一份完整的「${domain.title}」：按 schema 填写所有必填节点和必填字段，每个可重复集合至少写 2 个条目，内容使用中文并合理编造。`;
  return {
    profile: proposalGenerationProfileResource('guided').profile,
    context: { schema: 't3x.dev/proposal-context-bundle/v1' } as unknown as ProposalContextBundleV1,
    base: {} as ProposalGenerationModelInput['base'],
    authoring: {
      current: {},
      instruction:
        'Propose incremental operations against current. Do not repeat prior operations.',
    } as unknown as ProposalGenerationModelInput['authoring'],
    yschema: {
      resource: {
        uri: `t3x://schemas/${schema.name}`,
        digest: 'sha256:eval',
        mediaType: 'application/json',
      },
      value: schema,
    } as ProposalGenerationModelInput['yschema'],
    schemaLayout: layout,
    sources: [],
    instruction,
    prompt: GENERATION_PROMPT,
  };
}

interface CaseReport {
  id: string;
  depth: number;
  nodes: number;
  ok: boolean;
  ms: number;
  operations?: number;
  issues: string[];
  generated?: unknown[];
  repeated?: Array<{ path: string; items: number }>;
  error?: string;
}

async function evaluate(domain: Domain): Promise<CaseReport> {
  const schema = domainSchema(domain);
  const layout = semanticSchemaLayout(schema, domain.rootKey);
  const base = { id: domain.id, depth: schemaDepth(schema.nodes), nodes: layout.nodes.length };
  const started = Date.now();
  const model = createProposalGenerationModel({
    provider: createOpenAIProvider({
      apiKey: process.env.OPENAI_API_KEY!,
      ...(process.env.OPENAI_BASE_URL ? { baseUrl: process.env.OPENAI_BASE_URL } : {}),
    }),
    providerId: 'openai',
    model: MODEL,
  });
  let result: Awaited<ReturnType<typeof model.generate>>;
  try {
    result = await model.generate(generationInput(schema, layout, domain));
  } catch (error) {
    return {
      ...base,
      ok: false,
      ms: Date.now() - started,
      issues: ['generation failed'],
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const draft = result.draft as { changes: Array<{ operations: unknown[] }> };
  const operations = draft.changes.flatMap((change) => change.operations);
  const applied = applyNativeYOps({}, operations as Parameters<typeof applyNativeYOps>[1]);
  const issues: string[] = [];
  const report = {
    ...base,
    ms: Date.now() - started,
    operations: operations.length,
    generated: operations,
  };
  if (!applied.ok)
    return { ...report, ok: false, issues: [`apply failed: ${applied.error?.message}`] };

  const trees = ((applied.doc as { content?: { trees?: unknown[] } }).content?.trees ??
    []) as unknown[];
  issues.push(...malformedPaths(trees, 'content/trees'));
  const roots = trees.filter(isTree) as WellFormedTree[];
  if (roots.length !== 1 || roots[0]?.key !== domain.rootKey)
    issues.push(
      `expected one root ${domain.rootKey}, got [${roots.map((tree) => tree.key).join(', ')}]`
    );
  const root = roots.find((tree) => tree.key === domain.rootKey);
  if (!root || issues.some((issue) => issue.includes(' is '))) {
    return { ...report, ok: false, issues };
  }
  issues.push(...layoutViolations(root, schema.nodes, layout.rootPath));
  const validation = validateTree({ schema, tree: plain(root) as never });
  issues.push(
    ...validation.errors.map((error) => `yschema ${error.code} ${error.path}`),
    ...validation.gaps.map((gap) => `gap ${gap.code} ${gap.path}`)
  );
  const repeated = repeatedItemCounts(root, schema.nodes, domain.rootKey);
  issues.push(
    ...repeated
      .filter((collection) => collection.items < 2)
      .map((collection) => `fewer than 2 items in ${collection.path} (${collection.items})`)
  );
  return { ...report, ok: issues.length === 0, issues, repeated };
}

describe.skipIf(!LIVE)(`live proposal generation over 20 deep schemas (${MODEL})`, () => {
  const reports: CaseReport[] = [];

  it.concurrent.each(DOMAINS)('$id', async (domain) => {
    const report = await evaluate(domain);
    reports.push(report);
    mkdirSync(REPORT_DIR, { recursive: true });
    writeFileSync(resolve(REPORT_DIR, `${domain.id}.json`), JSON.stringify(report, null, 2));
    console.info(
      `[layout-live] ${report.ok ? 'PASS' : 'FAIL'} ${domain.id} depth=${report.depth} nodes=${report.nodes} ops=${report.operations ?? '-'} ${report.ms}ms${report.issues.length ? `\n  - ${report.issues.join('\n  - ')}` : ''}${report.error ? `\n  ! ${report.error}` : ''}`
    );
    expect(report.issues).toEqual([]);
  }, 600_000);
});

describe('deep evaluation schemas', () => {
  it('are valid YSchemas whose layouts reach the declared depth', () => {
    for (const domain of DOMAINS) {
      const schema = domainSchema(domain);
      const layout = semanticSchemaLayout(schema, domain.rootKey);
      expect(layout.nodes).toHaveLength(2 + domain.sections.length * 2);
      expect(schemaDepth(schema.nodes)).toBe(domain.sections.length + 2);
    }
    expect(DOMAINS).toHaveLength(20);
  });
});
