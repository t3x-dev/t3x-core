/**
 * validateTree E2E — 5 scenarios from catastrophic to clean
 *
 * Each test starts with a tree of different quality, runs validateTree,
 * applies fixes, re-validates, and documents exactly what each layer caught.
 */

import { applyYOps } from '@t3x-dev/yops';
import type { Schema } from '@t3x-dev/yschema';
import { parseSchemaObject } from '@t3x-dev/yschema';
import { describe, expect, it } from 'vitest';
import type { SemanticContent, TreeNode } from '../../semantic/types';
import { treesToYValue, yvalueToTrees } from '../../t3x-yops/convert';
import { validateTree } from '../validateTree';

// ── Helpers ──

function node(
  key: string,
  slots: Record<string, unknown> = {},
  children: TreeNode[] = []
): TreeNode {
  return { key, slots: slots as TreeNode['slots'], children };
}

function sc(trees: TreeNode[]): SemanticContent {
  return { trees, relations: [] };
}

/**
 * Iterative fix: validate → apply fixable ops one at a time → repeat until stable.
 * This mirrors the real workflow where each fix may change the tree shape,
 * invalidating subsequent fixes from the same pass.
 */
function iterativeFix(
  content: SemanticContent,
  schema?: Schema,
  maxIterations = 5
): { content: SemanticContent; iterations: number } {
  let current = content;
  let iterations = 0;

  for (let i = 0; i < maxIterations; i++) {
    const result = validateTree(current, { schema });
    if (result.fixes.length === 0) break;

    // Apply fixes one at a time to avoid path conflicts
    let doc = treesToYValue(current.trees);
    let applied = 0;
    for (const fix of result.fixes) {
      const r = applyYOps(doc, [fix]);
      if (r.ok) {
        doc = r.doc;
        applied++;
      }
      // Skip failed fixes (path may have changed from prior fix)
    }

    if (applied === 0) break; // nothing could be applied, stop
    current = sc(yvalueToTrees(doc));
    iterations++;
  }

  return { content: current, iterations };
}

// ── Shared schema for all 5 scenarios ──

const schema: Schema = parseSchemaObject({
  name: 'project-knowledge',
  version: 1,
  strict: true,
  nodes: {
    goals: {
      required: true,
      slots: {
        primary: 'scalar',
        timeline: 'scalar',
        priority: ['high', 'medium', 'low'],
      },
    },
    tech_stack: {
      required: true,
      children: 'any',
      each_child: {
        slots: {
          name: 'scalar',
          version: 'scalar',
          status: ['active', 'deprecated', 'evaluating'],
        },
      },
    },
    team: {
      required: false,
      children: 'any',
      each_child: {
        slots: {
          role: 'scalar',
        },
      },
    },
    decisions: {
      required: false,
      children: 'any',
      each_child: {
        slots: {
          choice: 'scalar',
          reason: 'scalar',
          date: 'scalar',
        },
      },
    },
  },
  rules: [
    {
      id: 'decisions-need-reason',
      if: 'decisions/*',
      must_have: ['choice', 'reason'],
      severity: 'error',
      message: "Decision '{{path}}' must have choice and reason",
    },
    {
      id: 'tech-needs-status',
      if: 'tech_stack/*',
      must_have: ['name', 'status'],
      severity: 'error',
      message: "Tech entry '{{path}}' must have name and status",
    },
  ],
});

// ═══════════════════════════════════════════════════════════════════════════════
// E2E 1: Catastrophic — everything is wrong
// ═══════════════════════════════════════════════════════════════════════════════

describe('E2E 1: Catastrophic — everything wrong', () => {
  const trees: TreeNode[] = [
    // Wrong: deeply nested single-child chain (ylint form 4)
    // Wrong: generic key "data" (ylint form 4)
    // Wrong: verb in key "get_info" (ylint form 1)
    node('get_info', {}, [
      node('data', {}, [
        node('wrapper', {}, [
          node('details', {
            // Wrong: compound scalar (ylint form 2)
            summary: 'we need react and vue and angular for the frontend and backend',
            // Wrong: multi-fact scalar (ylint form 2)
            tools: 'typescript, webpack, vite, eslint, prettier',
            // Wrong: single-item list (ylint form 3)
            tags: ['web'],
          }),
        ]),
      ]),
    ]),
    // Wrong: undeclared node (yschema strict)
    node('random_notes', {
      scratch: 'delete this later',
    }),
    // Wrong: undeclared node (yschema strict)
    node('todo', {
      items: ['fix bugs', 'deploy'],
    }),
    // Missing: goals (yschema required)
    // Missing: tech_stack (yschema required)
  ];

  it('detects all issues across both layers', () => {
    const content = sc(trees);
    const result = validateTree(content, { schema });

    expect(result.valid).toBe(false);

    // ── ylint general layer ──
    const generalWarnings = result.warnings.filter((w) => typeof w.form === 'number');

    // Form 1: verb in key
    const verbKey = generalWarnings.find((w) => w.rule === 'key-contains-verb');
    expect(verbKey).toBeDefined();
    expect(verbKey!.path).toBe('get_info');

    // Form 2: compound scalar
    const compound = generalWarnings.find((w) => w.rule === 'scalar-compound');
    expect(compound).toBeDefined();

    // Form 2: multi-fact scalar
    const multiFact = generalWarnings.find((w) => w.rule === 'scalar-multi-fact');
    expect(multiFact).toBeDefined();

    // Form 3: single-item list
    const singleList = generalWarnings.find((w) => w.rule === 'list-single-item');
    expect(singleList).toBeDefined();
    expect(singleList!.fix).toBeDefined();

    // Form 4: generic key
    const generic = generalWarnings.find((w) => w.rule === 'generic-container-key');
    expect(generic).toBeDefined();

    // Form 4: single-child chain
    const chain = generalWarnings.find((w) => w.rule === 'single-child-chain');
    expect(chain).toBeDefined();
    expect(chain!.fix).toBeDefined();

    // ── yschema layer ──
    const schemaWarnings = result.warnings.filter((w) => w.form === 'schema');

    // Missing required nodes
    const missingGoals = schemaWarnings.find(
      (w) => w.rule === 'REQUIRED_NODE' && w.path === 'goals'
    );
    expect(missingGoals).toBeDefined();

    const missingTech = schemaWarnings.find(
      (w) => w.rule === 'REQUIRED_NODE' && w.path === 'tech_stack'
    );
    expect(missingTech).toBeDefined();

    // Undeclared nodes (strict)
    const unexpected = schemaWarnings.filter((w) => w.rule === 'UNEXPECTED_NODE');
    expect(unexpected.length).toBeGreaterThanOrEqual(2);

    // Total: many issues, some fixable
    expect(result.warnings.length).toBeGreaterThan(8);
    expect(result.fixes.length).toBeGreaterThan(0);
    expect(result.manual_count).toBeGreaterThan(0);
  });

  it('auto-fix resolves what it can, leaves rest for human', () => {
    const content = sc(trees);
    const _r1 = validateTree(content, { schema });

    // Apply fixes
    const fixed = iterativeFix(content, schema).content;
    const r2 = validateTree(fixed, { schema });

    // random_notes and todo should be gone (dropped by schema fix)
    const unexpectedPaths = r2.warnings
      .filter((w) => w.form === 'schema' && w.rule === 'UNEXPECTED_NODE')
      .map((w) => w.path);
    expect(unexpectedPaths).not.toContain('random_notes');
    expect(unexpectedPaths).not.toContain('todo');

    // Single-item list should be gone (unwrapped)
    const singleList = r2.warnings.filter((w) => w.rule === 'list-single-item');
    expect(singleList).toHaveLength(0);

    // Required nodes now exist (created by define)
    // But they're empty — slots still missing → those remain
    const missingSlots = r2.warnings.filter((w) => w.rule === 'REQUIRED_SLOT');
    expect(missingSlots.length).toBeGreaterThan(0);

    // Compound scalar and generic key may be gone too — if the parent node
    // (get_info) was dropped as undeclared in strict mode, its children are gone.
    // This is correct: strict mode drops the entire undeclared subtree.

    // What remains: required nodes created but empty (missing slots)
    expect(r2.manual_count).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E2E 2: Structurally messy — right content, wrong shape
// ═══════════════════════════════════════════════════════════════════════════════

describe('E2E 2: Structurally messy — right content, wrong shape', () => {
  const trees: TreeNode[] = [
    node('goals', {
      primary: 'Launch MVP',
      timeline: 'Q3 2026',
      priority: 'high',
    }),
    // Single-child chain: tech_stack → wrapper → react
    node('tech_stack', {}, [
      node('wrapper', {}, [
        node('react', {
          name: 'React',
          version: '19',
          status: 'active',
        }),
      ]),
    ]),
    // Content is right but shape has issues
    node('team', {}, [
      node('alice', {
        role: 'lead',
        // Compound value
        skills: 'frontend and backend and devops',
      }),
      node('bob', {
        role: 'engineer',
        // Single-item list
        languages: ['typescript'],
      }),
    ]),
    node('decisions', {}, [
      node('pick_framework', {
        choice: 'Next.js',
        reason: 'SSR support and good DX',
        date: '2026-03-15',
      }),
    ]),
  ];

  it('ylint catches shape issues, yschema passes on content', () => {
    const content = sc(trees);
    const result = validateTree(content, { schema });

    // Shape issues from ylint
    const chain = result.warnings.find((w) => w.rule === 'single-child-chain');
    expect(chain).toBeDefined();

    const compound = result.warnings.find((w) => w.rule === 'scalar-compound');
    expect(compound).toBeDefined();

    const singleList = result.warnings.find((w) => w.rule === 'list-single-item');
    expect(singleList).toBeDefined();

    // Schema should be mostly happy (content is valid)
    // But tech_stack has wrapper node that doesn't match each_child template
    const schemaErrors = result.warnings.filter(
      (w) => w.form === 'schema' && w.severity === 'error'
    );
    // wrapper doesn't have name/status slots → each_child violation
    expect(schemaErrors.length).toBeGreaterThan(0);

    // Goals node passes schema completely
    const goalIssues = result.warnings.filter(
      (w) => w.form === 'schema' && w.path.startsWith('goals')
    );
    expect(goalIssues).toHaveLength(0);
  });

  it('fix → re-validate shows improvement', () => {
    const content = sc(trees);
    const r1 = validateTree(content, { schema });
    const totalBefore = r1.warnings.length;

    const fixed = iterativeFix(content, schema).content;
    const r2 = validateTree(fixed, { schema });
    const totalAfter = r2.warnings.length;

    // Should have fewer warnings after fix
    expect(totalAfter).toBeLessThan(totalBefore);

    // Single-item list should be resolved
    const singleList = r2.warnings.find((w) => w.rule === 'list-single-item');
    expect(singleList).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E2E 3: Schema violations — right shape, wrong values
// ═══════════════════════════════════════════════════════════════════════════════

describe('E2E 3: Schema violations — right shape, wrong values', () => {
  const trees: TreeNode[] = [
    node('goals', {
      primary: 'Build analytics dashboard',
      timeline: 'Q4 2026',
      priority: 'urgent', // not in enum [high, medium, low]
    }),
    node('tech_stack', {}, [
      node('postgres', {
        name: 'PostgreSQL',
        version: '16',
        status: 'active',
      }),
      node('redis', {
        name: 'Redis',
        version: '7',
        status: 'maybe', // not in enum [active, deprecated, evaluating]
      }),
      node('kafka', {
        name: 'Kafka',
        // missing: status (required by each_child)
        // missing: version (required by each_child)
      }),
    ]),
    node('decisions', {}, [
      node('database_choice', {
        choice: 'PostgreSQL',
        reason: 'ACID compliance and JSON support',
        date: '2026-01-10',
      }),
      node('cache_strategy', {
        choice: 'Redis',
        // missing: reason (required by rule)
        date: '2026-02-01',
      }),
    ]),
  ];

  it('yschema catches all value violations, ylint is quiet', () => {
    const content = sc(trees);
    const result = validateTree(content, { schema });

    // ylint should have very few issues (structure is clean)
    const generalWarnings = result.warnings.filter((w) => typeof w.form === 'number');
    // No single-child chains, no single-item lists, no generic keys
    const structuralFixes = generalWarnings.filter((w) => w.fix !== undefined);
    expect(structuralFixes).toHaveLength(0);

    // yschema catches everything
    const schemaWarnings = result.warnings.filter((w) => w.form === 'schema');

    // Wrong enum: priority = 'urgent'
    const priorityEnum = schemaWarnings.find(
      (w) => w.rule === 'INVALID_ENUM' && w.path === 'goals/priority'
    );
    expect(priorityEnum).toBeDefined();
    expect(priorityEnum!.fix).toBeDefined();

    // Wrong enum: redis status = 'maybe'
    const redisEnum = schemaWarnings.find(
      (w) => w.rule === 'INVALID_ENUM' && w.path === 'tech_stack/redis/status'
    );
    expect(redisEnum).toBeDefined();

    // Missing slots on kafka
    const kafkaSlots = schemaWarnings.filter(
      (w) => w.rule === 'REQUIRED_SLOT' && w.path.startsWith('tech_stack/kafka')
    );
    expect(kafkaSlots.length).toBeGreaterThanOrEqual(1);

    // Rule: cache_strategy missing reason
    const missingReason = schemaWarnings.find(
      (w) => w.rule === 'RULE_VIOLATION' && w.path.includes('cache_strategy')
    );
    expect(missingReason).toBeDefined();
  });

  it('auto-fix resolves enums, leaves missing slots for human', () => {
    const content = sc(trees);
    const _r1 = validateTree(content, { schema });

    const fixed = iterativeFix(content, schema).content;
    const r2 = validateTree(fixed, { schema });

    // Enum violations resolved
    const enumIssues = r2.warnings.filter((w) => w.rule === 'INVALID_ENUM');
    expect(enumIssues).toHaveLength(0);

    // Check actual values
    const doc = treesToYValue(fixed.trees) as Record<string, Record<string, unknown>>;
    expect(doc.goals.priority).toBe('high'); // first enum value

    const techStack = doc.tech_stack as Record<string, Record<string, unknown>>;
    expect(techStack.redis.status).toBe('active'); // first enum value

    // Missing reason on cache_strategy still there (rule violation, no auto-fix)
    const ruleIssues = r2.warnings.filter((w) => w.rule === 'RULE_VIOLATION');
    expect(ruleIssues.length).toBeGreaterThan(0);

    // Report what remains for human
    expect(r2.manual_count).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E2E 4: Almost correct — just a few edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('E2E 4: Almost correct — minor issues', () => {
  const trees: TreeNode[] = [
    node('goals', {
      primary: 'Migrate to microservices',
      timeline: 'H2 2026',
      priority: 'high',
    }),
    node('tech_stack', {}, [
      node('kubernetes', {
        name: 'Kubernetes',
        version: '1.30',
        status: 'active',
      }),
      node('istio', {
        name: 'Istio',
        version: '1.22',
        status: 'evaluating',
      }),
    ]),
    node('team', {}, [node('charlie', { role: 'architect' }), node('diana', { role: 'sre' })]),
    node('decisions', {}, [
      node('container_runtime', {
        choice: 'containerd',
        reason: 'Industry standard, lower overhead than Docker',
        date: '2026-04-01',
      }),
    ]),
    // One small issue: an extra undeclared node
    node('changelog', {
      latest: 'Added Istio evaluation',
    }),
  ];

  it('only one issue: undeclared node in strict mode', () => {
    const content = sc(trees);
    const result = validateTree(content, { schema });

    // Only schema issue: changelog is undeclared (strict mode)
    const schemaIssues = result.warnings.filter((w) => w.form === 'schema');
    expect(schemaIssues).toHaveLength(1);
    expect(schemaIssues[0].rule).toBe('UNEXPECTED_NODE');
    expect(schemaIssues[0].path).toBe('changelog');
    expect(schemaIssues[0].fix).toBeDefined();

    // ylint might have minor info-level warnings but no real issues
    const seriousGeneral = result.warnings.filter(
      (w) => typeof w.form === 'number' && w.severity !== 'info'
    );
    // Should be very few or none
    expect(seriousGeneral.length).toBeLessThanOrEqual(1);
  });

  it('single fix resolves everything', () => {
    const content = sc(trees);
    const _r1 = validateTree(content, { schema });

    const fixed = iterativeFix(content, schema).content;
    const r2 = validateTree(fixed, { schema });

    // changelog gone
    const doc = treesToYValue(fixed.trees) as Record<string, unknown>;
    expect(doc.changelog).toBeUndefined();

    // Schema clean
    const schemaIssues = r2.warnings.filter((w) => w.form === 'schema' && w.severity === 'error');
    expect(schemaIssues).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E2E 5: Perfect — zero issues
// ═══════════════════════════════════════════════════════════════════════════════

describe('E2E 5: Perfect — zero issues', () => {
  const trees: TreeNode[] = [
    node('goals', {
      primary: 'Ship v2 with real-time features',
      timeline: 'Q1 2027',
      priority: 'high',
    }),
    node('tech_stack', {}, [
      node('nextjs', {
        name: 'Next.js',
        version: '16',
        status: 'active',
      }),
      node('drizzle', {
        name: 'Drizzle ORM',
        version: '0.35',
        status: 'active',
      }),
      node('hono', {
        name: 'Hono',
        version: '4',
        status: 'active',
      }),
    ]),
    node('team', {}, [
      node('eve', { role: 'product' }),
      node('frank', { role: 'backend' }),
      node('grace', { role: 'frontend' }),
    ]),
    node('decisions', {}, [
      node('api_framework', {
        choice: 'Hono',
        reason: 'Lightweight with OpenAPI support',
        date: '2026-03-01',
      }),
      node('orm_choice', {
        choice: 'Drizzle',
        reason: 'Type-safe queries without runtime overhead',
        date: '2026-03-05',
      }),
    ]),
  ];

  it('validates clean with zero warnings', () => {
    const content = sc(trees);
    const result = validateTree(content, { schema });

    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(result.fixes).toHaveLength(0);
    expect(result.manual_count).toBe(0);
  });

  it('also clean without schema (ylint general only)', () => {
    const content = sc(trees);
    const result = validateTree(content);

    expect(result.valid).toBe(true);
    // Might have info-level warnings but no warn/error
    const serious = result.warnings.filter((w) => w.severity !== 'info');
    expect(serious).toHaveLength(0);
  });

  it('stays clean after no-op fix round-trip', () => {
    const content = sc(trees);
    const r1 = validateTree(content, { schema });
    expect(r1.fixes).toHaveLength(0);

    // Even if we rebuild trees through YValue round-trip, still clean
    const doc = treesToYValue(content.trees);
    const rebuilt = sc(yvalueToTrees(doc));
    const r2 = validateTree(rebuilt, { schema });

    expect(r2.valid).toBe(true);
    expect(r2.warnings).toHaveLength(0);
  });
});
