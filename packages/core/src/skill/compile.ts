import { createHash } from 'node:crypto';
import yaml from 'js-yaml';
import { generateSkillDescription } from './description';
import type {
  CompileSkillBundleInput,
  SkillBundle,
  SkillBundleFile,
  SkillCheckPlan,
  SkillPolicyRelation,
} from './types';

export const SKILL_RENDERER_VERSION = 't3x-skill-renderer@0.2.0';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredRecord(tree: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = tree[key];
  if (!isRecord(value)) throw new Error(`Skill tree is missing ${key}.`);
  return value;
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Skill tree is missing ${path}.`);
  }
  return value.trim();
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function repeatedRecords(
  tree: Record<string, unknown>,
  key: string
): Array<[string, Record<string, unknown>]> {
  const value = tree[key];
  if (!isRecord(value)) return [];
  return Object.entries(value).filter((entry): entry is [string, Record<string, unknown>] =>
    isRecord(entry[1])
  );
}

function normalizeEndpoint(value: string): string {
  return value.replace(/^skill\//, '').replace(/^\//, '');
}

function relationTargets(
  relations: readonly SkillPolicyRelation[],
  type: string,
  from: string
): string[] {
  const normalizedFrom = normalizeEndpoint(from);
  return [
    ...new Set(
      relations
        .filter(
          (relation) =>
            relation.type === type && normalizeEndpoint(relation.from) === normalizedFrom
        )
        .map((relation) => normalizeEndpoint(relation.to))
    ),
  ];
}

function endpointKey(endpoint: string, collection: string): string | null {
  const prefix = `${collection}/`;
  return endpoint.startsWith(prefix) ? endpoint.slice(prefix.length) : null;
}

function sha256(content: string): string {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
}

function inferredMediaType(path: string): string {
  if (path.endsWith('.md')) return 'text/markdown';
  if (path.endsWith('.csv')) return 'text/csv';
  if (path.endsWith('.yaml') || path.endsWith('.yml')) return 'application/yaml';
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.ts') || path.endsWith('.js')) return 'text/javascript';
  if (path.endsWith('.py')) return 'text/x-python';
  return 'text/plain';
}

function markdownList(lines: string[], title: string, values: string[]): void {
  if (values.length === 0) return;
  lines.push(`## ${title}`, '');
  for (const value of values) lines.push(`- ${value}`);
  lines.push('');
}

function renderInstruction(
  lines: string[],
  key: string,
  instruction: Record<string, unknown>,
  relations: readonly SkillPolicyRelation[],
  heading = '####'
): void {
  const title = requiredString(instruction.title, `instructions/${key}/title`);
  const body = requiredString(instruction.body, `instructions/${key}/body`);
  const sequence = typeof instruction.sequence === 'number' ? `${instruction.sequence}. ` : '';
  lines.push(`${heading} ${sequence}${title}`, '', body, '');

  const resourcePaths = relationTargets(
    relations,
    'instruction_uses_resource',
    `instructions/${key}`
  );
  if (resourcePaths.length > 0) {
    lines.push(`Resources: ${resourcePaths.map((path) => `\`${path}\``).join(', ')}`, '');
  }
  const criteria = stringArray(instruction.success_criteria);
  if (criteria.length > 0) {
    lines.push('Success criteria:', '');
    for (const criterion of criteria) lines.push(`- ${criterion}`);
    lines.push('');
  }
  if (typeof instruction.on_failure === 'string' && instruction.on_failure.trim()) {
    lines.push(`If this step fails: ${instruction.on_failure.trim()}`, '');
  }
}

function buildCheckPlan(
  tree: Record<string, unknown>,
  relations: readonly SkillPolicyRelation[]
): SkillCheckPlan[] {
  return repeatedRecords(tree, 'checks')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, check]) => ({
      key,
      kind: typeof check.kind === 'string' ? check.kind : '',
      runWhen: typeof check.run_when === 'string' ? check.run_when : '',
      blocking: check.blocking === true,
      ...(typeof check.command_resource === 'string'
        ? { commandResource: check.command_resource }
        : {}),
      assertions: stringArray(check.assertions),
      successCriteria: stringArray(check.success_criteria),
      workflowKeys: relationTargets(relations, 'verifies', `checks/${key}`)
        .map((endpoint) => endpointKey(endpoint, 'workflows'))
        .filter((workflowKey): workflowKey is string => workflowKey !== null)
        .sort(),
    }));
}

function renderSkillMarkdown(
  tree: Record<string, unknown>,
  relations: readonly SkillPolicyRelation[],
  generatedDescription: string,
  checkPlan: SkillCheckPlan[]
): string {
  const manifest = requiredRecord(tree, 'manifest');
  const activation = requiredRecord(tree, 'activation');
  const contract = requiredRecord(tree, 'contract');
  const name = requiredString(manifest.name, 'manifest/name');
  const summary = requiredString(manifest.summary, 'manifest/summary');
  const frontmatter = yaml.dump(
    { name, description: generatedDescription },
    { lineWidth: -1, noRefs: true, sortKeys: false }
  );
  const lines = ['---', frontmatter.trimEnd(), '---', '', `# ${name}`, '', summary, ''];

  const goal = requiredString(contract.goal, 'contract/goal');
  lines.push('## Goal', '', goal, '');
  markdownList(lines, 'Inputs', stringArray(contract.inputs));
  markdownList(lines, 'Outputs', stringArray(contract.outputs));
  markdownList(lines, 'Non-goals', stringArray(contract.non_goals));

  const shouldTrigger = stringArray(activation.should_trigger);
  const shouldNotTrigger = stringArray(activation.should_not_trigger);
  if (shouldTrigger.length > 0 || shouldNotTrigger.length > 0) {
    lines.push('## Activation boundaries', '');
    if (shouldTrigger.length > 0) {
      lines.push('Use this skill when:', '');
      for (const trigger of shouldTrigger) lines.push(`- ${trigger}`);
      lines.push('');
    }
    if (shouldNotTrigger.length > 0) {
      lines.push('Do not use this skill when:', '');
      for (const trigger of shouldNotTrigger) lines.push(`- ${trigger}`);
      lines.push('');
    }
  }

  const instructionByKey = new Map(repeatedRecords(tree, 'instructions'));
  const workflowKindOrder = new Map([
    ['primary', 0],
    ['supporting', 1],
    ['persistence', 2],
    ['review', 3],
  ]);
  const routedInstructions = new Set<string>();
  const workflows = repeatedRecords(tree, 'workflows').sort((left, right) => {
    const leftRank = workflowKindOrder.get(String(left[1].kind)) ?? 99;
    const rightRank = workflowKindOrder.get(String(right[1].kind)) ?? 99;
    return leftRank - rightRank || left[0].localeCompare(right[0]);
  });
  if (workflows.length > 0) {
    lines.push('## Workflows', '');
    for (const [workflowKey, workflow] of workflows) {
      const title = requiredString(workflow.title, `workflows/${workflowKey}/title`);
      const when = requiredString(workflow.when, `workflows/${workflowKey}/when`);
      lines.push(`### ${title}`, '', `Route here when: ${when}`, '');
      const outputFormats = stringArray(workflow.output_formats);
      if (outputFormats.length > 0) lines.push(`Output formats: ${outputFormats.join(', ')}`, '');
      lines.push(
        `Persistence: ${String(workflow.persistence)}`,
        `If no result: ${String(workflow.on_empty)}`,
        `If the workflow fails: ${String(workflow.on_failure)}`,
        ''
      );
      if (workflow.on_failure === 'fallback' && typeof workflow.fallback_workflow === 'string') {
        lines.push(`Fallback workflow: ${workflow.fallback_workflow}`, '');
      }

      const workflowResources = relationTargets(
        relations,
        'workflow_uses_resource',
        `workflows/${workflowKey}`
      );
      if (workflowResources.length > 0) {
        lines.push(
          `Workflow resources: ${workflowResources.map((path) => `\`${path}\``).join(', ')}`,
          ''
        );
      }
      const dependencies = relationTargets(relations, 'requires', `workflows/${workflowKey}`);
      if (dependencies.length > 0) {
        lines.push(
          `Required capabilities: ${dependencies.map((path) => `\`${path}\``).join(', ')}`,
          ''
        );
      }
      const workflowChecks = checkPlan.filter((check) => check.workflowKeys.includes(workflowKey));
      if (workflowChecks.length > 0) {
        lines.push(
          `Checks: ${workflowChecks
            .map((check) => `\`${check.key}\`${check.blocking ? ' (blocking)' : ''}`)
            .join(', ')}`,
          ''
        );
      }

      const steps = relationTargets(relations, 'has_step', `workflows/${workflowKey}`)
        .map((endpoint) => endpointKey(endpoint, 'instructions'))
        .filter((key): key is string => key !== null && instructionByKey.has(key))
        .map((key) => [key, instructionByKey.get(key) as Record<string, unknown>] as const)
        .sort((left, right) => {
          const leftSequence =
            typeof left[1].sequence === 'number' ? left[1].sequence : Number.MAX_VALUE;
          const rightSequence =
            typeof right[1].sequence === 'number' ? right[1].sequence : Number.MAX_VALUE;
          return leftSequence - rightSequence || left[0].localeCompare(right[0]);
        });
      if (steps.length > 0) lines.push('#### Steps', '');
      for (const [key, instruction] of steps) {
        routedInstructions.add(key);
        renderInstruction(lines, key, instruction, relations, '#####');
      }
    }
  }

  const orphanInstructions = repeatedRecords(tree, 'instructions')
    .filter(([key]) => !routedInstructions.has(key))
    .sort((left, right) => {
      const leftSequence =
        typeof left[1].sequence === 'number' ? left[1].sequence : Number.MAX_VALUE;
      const rightSequence =
        typeof right[1].sequence === 'number' ? right[1].sequence : Number.MAX_VALUE;
      return leftSequence - rightSequence || left[0].localeCompare(right[0]);
    });
  if (orphanInstructions.length > 0) {
    lines.push('## Unrouted instructions', '');
    for (const [key, instruction] of orphanInstructions) {
      renderInstruction(lines, key, instruction, relations, '###');
    }
  }

  const resources = repeatedRecords(tree, 'resources').sort((left, right) => {
    return String(left[1].path).localeCompare(String(right[1].path));
  });
  if (resources.length > 0) {
    lines.push('## Resource loading', '');
    for (const [, resource] of resources) {
      const path = requiredString(resource.path, 'resources/*/path');
      const description = requiredString(resource.description, 'resources/*/description');
      const loadPolicy = requiredString(resource.load_policy, 'resources/*/load_policy');
      const useWhen = requiredString(resource.use_when, 'resources/*/use_when');
      lines.push(
        `### \`${path}\``,
        '',
        description,
        '',
        `Load policy: ${loadPolicy}. ${useWhen}`,
        ''
      );
    }
  }

  if (checkPlan.length > 0) {
    lines.push('## Deterministic checks', '');
    for (const check of checkPlan) {
      lines.push(
        `### ${check.key}`,
        '',
        `Type: ${check.kind}. Run: ${check.runWhen}. Blocking: ${check.blocking ? 'yes' : 'no'}.`,
        ''
      );
      if (check.commandResource) lines.push(`Command resource: \`${check.commandResource}\``, '');
      if (check.assertions.length > 0) {
        lines.push('Assertions:', '');
        for (const assertion of check.assertions) lines.push(`- ${assertion}`);
        lines.push('');
      }
      if (check.successCriteria.length > 0) {
        lines.push('Success criteria:', '');
        for (const criterion of check.successCriteria) lines.push(`- ${criterion}`);
        lines.push('');
      }
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

/** Compile portable Skill artifacts without invoking an LLM or executing resources. */
export function compileSkillBundle(input: CompileSkillBundleInput): SkillBundle {
  const relations = input.relations ?? [];
  const generatedDescription = generateSkillDescription(input.tree);
  const checks = buildCheckPlan(input.tree, relations);
  const skillMarkdown = renderSkillMarkdown(input.tree, relations, generatedDescription, checks);
  const declaredResources = repeatedRecords(input.tree, 'resources')
    .flatMap(([key, resource]) =>
      typeof resource.path === 'string'
        ? [{ key, path: resource.path, mediaType: resource.media_type }]
        : []
    )
    .sort((left, right) => left.path.localeCompare(right.path));
  const resourceContents = input.resourceContents ?? {};
  const missingResources = declaredResources
    .filter((resource) => resourceContents[resource.path] === undefined)
    .map((resource) => resource.path);
  const files: SkillBundleFile[] = [
    {
      path: 'SKILL.md',
      mediaType: 'text/markdown',
      content: skillMarkdown,
      sha256: sha256(skillMarkdown),
    },
    ...declaredResources.flatMap((resource): SkillBundleFile[] => {
      const content = resourceContents[resource.path];
      return content === undefined
        ? []
        : [
            {
              path: resource.path,
              mediaType:
                typeof resource.mediaType === 'string'
                  ? resource.mediaType
                  : inferredMediaType(resource.path),
              content,
              sha256: sha256(content),
            },
          ];
    }),
  ].sort((left, right) => {
    if (left.path === 'SKILL.md') return -1;
    if (right.path === 'SKILL.md') return 1;
    return left.path.localeCompare(right.path);
  });

  const bundleHash = sha256(files.map((file) => `${file.path}\0${file.sha256}`).join('\n'));

  return {
    rendererVersion: SKILL_RENDERER_VERSION,
    generatedDescription,
    files,
    missingResources,
    bundleHash,
    checks,
  };
}
