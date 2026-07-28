import { generateSkillDescription } from './description';
import type { SkillPolicyIssue, SkillPolicyRelation, SkillPolicyResult } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function recordsAt(
  tree: Record<string, unknown>,
  key: string
): Array<[string, Record<string, unknown>]> {
  const value = tree[key];
  if (!isRecord(value)) return [];
  return Object.entries(value).filter((entry): entry is [string, Record<string, unknown>] =>
    isRecord(entry[1])
  );
}

function push(
  target: SkillPolicyIssue[],
  code: string,
  path: string,
  message: string,
  details?: Record<string, unknown>
): void {
  target.push({ code, path, message, ...(details ? { details } : {}) });
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
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
  return relations
    .filter(
      (relation) => relation.type === type && normalizeEndpoint(relation.from) === normalizedFrom
    )
    .map((relation) => normalizeEndpoint(relation.to));
}

/**
 * Applies deterministic cross-field rules that YSchema P0 cannot express yet.
 * Structural type, relation, and provenance checks remain in @t3x-dev/yschema.
 */
export function validateSkillPolicy(
  tree: Record<string, unknown>,
  relations: readonly SkillPolicyRelation[] = []
): SkillPolicyResult {
  const errors: SkillPolicyIssue[] = [];
  const gaps: SkillPolicyIssue[] = [];
  const activation = isRecord(tree.activation) ? tree.activation : {};
  const workflows = recordsAt(tree, 'workflows');
  const instructions = recordsAt(tree, 'instructions');
  const resources = recordsAt(tree, 'resources');
  const checks = recordsAt(tree, 'checks');
  const evals = recordsAt(tree, 'evals');
  const instructionByKey = new Map(instructions);
  const workflowKeys = new Set(workflows.map(([key]) => key));
  const resourceByPath = new Map(
    resources.flatMap(([key, resource]) =>
      typeof resource.path === 'string' ? [[resource.path, [key, resource] as const]] : []
    )
  );

  if (workflows.length === 0) {
    push(gaps, 'SKILL_WORKFLOW_REQUIRED', 'workflows', 'A ready skill needs a routable workflow.');
  }
  if (instructions.length === 0) {
    push(
      gaps,
      'SKILL_INSTRUCTION_REQUIRED',
      'instructions',
      'A ready skill needs at least one instruction.'
    );
  }
  if (checks.length === 0) {
    push(
      gaps,
      'SKILL_CHECK_REQUIRED',
      'checks',
      'A ready skill needs at least one deterministic check.'
    );
  }

  if (activation.implicit === true) {
    if (stringArray(activation.should_trigger).length === 0) {
      push(
        gaps,
        'SKILL_POSITIVE_TRIGGER_REQUIRED',
        'activation/should_trigger',
        'Implicit activation needs at least one positive trigger example.'
      );
    }
    if (stringArray(activation.should_not_trigger).length === 0) {
      push(
        gaps,
        'SKILL_NEGATIVE_TRIGGER_REQUIRED',
        'activation/should_not_trigger',
        'Implicit activation needs at least one negative trigger example.'
      );
    }
  }

  try {
    generateSkillDescription(tree);
  } catch (error) {
    push(
      errors,
      'SKILL_DESCRIPTION_GENERATION_FAILED',
      'manifest/summary',
      error instanceof Error ? error.message : 'Host description could not be generated.'
    );
  }

  const routedInstructionKeys = new Set<string>();
  for (const [workflowKey, workflow] of workflows) {
    const path = `workflows/${workflowKey}`;
    const stepPaths = relationTargets(relations, 'has_step', path);
    if (stepPaths.length === 0) {
      push(
        gaps,
        'SKILL_WORKFLOW_STEP_REQUIRED',
        path,
        'Every workflow must route to at least one instruction with has_step.'
      );
    }

    const sequenceOwners = new Map<number, string>();
    for (const stepPath of stepPaths) {
      const stepKey = stepPath.startsWith('instructions/') ? stepPath.slice(13) : '';
      const instruction = instructionByKey.get(stepKey);
      if (!instruction) continue;
      routedInstructionKeys.add(stepKey);
      const sequence = instruction.sequence;
      if (typeof sequence !== 'number') continue;
      const previous = sequenceOwners.get(sequence);
      if (previous) {
        push(
          errors,
          'SKILL_DUPLICATE_WORKFLOW_SEQUENCE',
          `${path}/steps`,
          `Instruction sequence ${sequence} is used by both ${previous} and ${stepKey}.`,
          { sequence, previous, current: stepKey }
        );
      } else {
        sequenceOwners.set(sequence, stepKey);
      }
    }

    if (workflow.on_failure === 'fallback') {
      if (typeof workflow.fallback_workflow !== 'string' || !workflow.fallback_workflow.trim()) {
        push(
          errors,
          'SKILL_FALLBACK_WORKFLOW_REQUIRED',
          `${path}/fallback_workflow`,
          'Fallback failure handling must name a fallback workflow.'
        );
      } else if (!workflowKeys.has(workflow.fallback_workflow)) {
        push(
          errors,
          'SKILL_FALLBACK_WORKFLOW_UNKNOWN',
          `${path}/fallback_workflow`,
          `Fallback workflow ${workflow.fallback_workflow} is not declared.`
        );
      } else if (workflow.fallback_workflow === workflowKey) {
        push(
          errors,
          'SKILL_FALLBACK_WORKFLOW_SELF_REFERENCE',
          `${path}/fallback_workflow`,
          'A workflow cannot fall back to itself.'
        );
      }
    }

    const verifiedByBlockingCheck = checks.some(([checkKey, check]) => {
      if (check.blocking !== true) return false;
      return relationTargets(relations, 'verifies', `checks/${checkKey}`).includes(path);
    });
    if (!verifiedByBlockingCheck) {
      push(
        gaps,
        'SKILL_WORKFLOW_BLOCKING_CHECK_REQUIRED',
        path,
        'Every workflow needs a blocking check linked with verifies.'
      );
    }
  }

  for (const [key, instruction] of instructions) {
    const path = `instructions/${key}`;
    if (!routedInstructionKeys.has(key)) {
      push(
        gaps,
        'SKILL_INSTRUCTION_WORKFLOW_REQUIRED',
        path,
        'Every instruction must belong to at least one workflow.'
      );
    }
    if (instruction.freedom === 'low' && stringArray(instruction.success_criteria).length === 0) {
      push(
        gaps,
        'SKILL_LOW_FREEDOM_VERIFICATION_REQUIRED',
        `${path}/success_criteria`,
        'Low-freedom instructions need deterministic success criteria.'
      );
    }
    if (instruction.effect === 'write' && instruction.approval !== 'before_write') {
      push(
        gaps,
        'SKILL_WRITE_APPROVAL_REQUIRED',
        `${path}/approval`,
        'Write instructions must request approval before writing.'
      );
    }
    if (instruction.effect === 'external' && instruction.approval !== 'before_external') {
      push(
        gaps,
        'SKILL_EXTERNAL_APPROVAL_REQUIRED',
        `${path}/approval`,
        'External side effects must request approval before execution.'
      );
    }
  }

  for (const [key, resource] of resources) {
    const path = `resources/${key}`;
    if (resource.kind === 'data' && typeof resource.media_type !== 'string') {
      push(
        gaps,
        'SKILL_DATA_MEDIA_TYPE_REQUIRED',
        `${path}/media_type`,
        'Data resources should declare their media type.'
      );
    }
    if (typeof resource.source_url !== 'string') continue;
    if (typeof resource.revision !== 'string' || !resource.revision.trim()) {
      push(
        gaps,
        'SKILL_REMOTE_REVISION_REQUIRED',
        `${path}/revision`,
        'Remote resources must pin an immutable revision.'
      );
    }
    if (typeof resource.content_hash !== 'string' || !resource.content_hash.trim()) {
      push(
        gaps,
        'SKILL_REMOTE_HASH_REQUIRED',
        `${path}/content_hash`,
        'Remote resources must include a SHA-256 content hash.'
      );
    }
  }

  for (const [key, check] of checks) {
    const path = `checks/${key}`;
    const verifiedWorkflows = relationTargets(relations, 'verifies', path).filter((endpoint) =>
      endpoint.startsWith('workflows/')
    );
    if (check.blocking === true && verifiedWorkflows.length === 0) {
      push(
        gaps,
        'SKILL_BLOCKING_CHECK_TARGET_REQUIRED',
        path,
        'Blocking checks must verify at least one workflow.'
      );
    }

    if (check.kind === 'command' || check.kind === 'smoke_test') {
      if (typeof check.command_resource !== 'string' || !check.command_resource.trim()) {
        push(
          errors,
          'SKILL_CHECK_COMMAND_REQUIRED',
          `${path}/command_resource`,
          'Command and smoke-test checks must name an executable resource path.'
        );
      } else {
        const resourceEntry = resourceByPath.get(check.command_resource);
        if (!resourceEntry) {
          push(
            errors,
            'SKILL_CHECK_COMMAND_UNKNOWN',
            `${path}/command_resource`,
            `Check resource ${check.command_resource} is not declared.`
          );
        } else {
          const [resourceKey, resource] = resourceEntry;
          if (resource.kind !== 'script' || resource.load_policy !== 'execute_only') {
            push(
              errors,
              'SKILL_CHECK_COMMAND_NOT_EXECUTABLE',
              `${path}/command_resource`,
              `Resource ${resourceKey} must be a script with execute_only load policy.`
            );
          }
        }
      }
      if (stringArray(check.success_criteria).length === 0) {
        push(
          gaps,
          'SKILL_CHECK_SUCCESS_CRITERIA_REQUIRED',
          `${path}/success_criteria`,
          'Command and smoke-test checks need deterministic success criteria.'
        );
      }
    }
    if (check.kind === 'checklist' && stringArray(check.assertions).length === 0) {
      push(
        gaps,
        'SKILL_CHECKLIST_ASSERTIONS_REQUIRED',
        `${path}/assertions`,
        'Checklist checks need at least one assertion.'
      );
    }
  }

  const evalKinds = new Set(
    evals.flatMap(([, evaluation]) =>
      typeof evaluation.kind === 'string' ? [evaluation.kind] : []
    )
  );
  if (!evalKinds.has('behavior')) {
    push(
      gaps,
      'SKILL_BEHAVIOR_EVAL_REQUIRED',
      'evals',
      'A ready skill needs at least one behavior evaluation.'
    );
  }
  if (activation.implicit === true) {
    if (!evalKinds.has('trigger_positive')) {
      push(
        gaps,
        'SKILL_POSITIVE_TRIGGER_EVAL_REQUIRED',
        'evals',
        'Implicit activation needs a positive trigger evaluation.'
      );
    }
    if (!evalKinds.has('trigger_negative')) {
      push(
        gaps,
        'SKILL_NEGATIVE_TRIGGER_EVAL_REQUIRED',
        'evals',
        'Implicit activation needs a negative trigger evaluation.'
      );
    }
  }

  errors.sort(
    (left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code)
  );
  gaps.sort(
    (left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code)
  );

  return {
    valid: errors.length === 0,
    ready: errors.length === 0 && gaps.length === 0,
    errors,
    gaps,
  };
}
