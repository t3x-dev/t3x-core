import {
  type ProvenanceIndex,
  type ValidationResult,
  validateTree,
  type YSchema,
  type YSchemaFixOp,
  type YSchemaRelation,
} from '@t3x-dev/yschema';
import type { SemanticContent } from '../semantic/types';
import { treesToYValue } from './convert';
import { applyYOps } from './engine';
import type { YOp, YOpsError } from './types';

export interface ApplyYSchemaFixOpsInput {
  content: SemanticContent;
  schema: YSchema;
  ops: YSchemaFixOp[];
  provenanceByPath?: ProvenanceIndex;
  requireReady?: boolean;
}

export type ApplyYSchemaFixOpsResult =
  | {
      ok: true;
      content: SemanticContent;
      applied: number;
      validation: ValidationResult;
    }
  | {
      ok: false;
      content: SemanticContent;
      applied: number;
      error: YOpsError;
      validation?: ValidationResult;
    };

/**
 * Apply YSchema P0 fix ops through the core YOps engine, then validate the
 * resulting commit candidate against the provided schema. Relation fix ops are
 * checked against schema relationTypes before application so invalid relation
 * type/endpoints fail without mutating the input content.
 */
export function applyYSchemaFixOps(input: ApplyYSchemaFixOpsInput): ApplyYSchemaFixOpsResult {
  const relationValidation = validateRelationFixOps(input);
  if (!relationValidation.ok) {
    return {
      ok: false,
      content: input.content,
      applied: 0,
      error: relationValidation.error,
      validation: relationValidation.validation,
    };
  }

  const applied = applyYOps(input.content, input.ops as YOp[]);
  if (!applied.ok) {
    return {
      ok: false,
      content: input.content,
      applied: applied.applied,
      error: applied.error ?? {
        code: 'YOPS_APPLY_FAILED',
        message: 'YOps application failed.',
        op_index: applied.applied,
      },
    };
  }

  const nextContent: SemanticContent = {
    trees: applied.trees,
    relations: applied.relations,
  };
  const validation = validateTree({
    schema: input.schema,
    tree: treesToYValue(nextContent.trees),
    relations: nextContent.relations.map((relation) => ({
      from: relation.from,
      to: relation.to,
      type: relation.type,
    })),
    provenanceByPath: input.provenanceByPath,
  });
  const blockingError = firstBlockingValidationError(validation, input.requireReady === true);
  if (blockingError !== undefined) {
    const lastRelationOpIndex = input.ops.reduce<number | undefined>((last, op, index) => {
      return relationFromFixOp(op) === undefined ? last : index;
    }, undefined);

    return {
      ok: false,
      content: input.content,
      applied: applied.applied,
      validation,
      error: {
        ...blockingError,
        op_index: lastRelationOpIndex ?? Math.max(0, input.ops.length - 1),
      },
    };
  }

  return {
    ok: true,
    content: nextContent,
    applied: applied.applied,
    validation,
  };
}

function relationFromFixOp(op: YSchemaFixOp): YSchemaRelation | undefined {
  if ('relate' in op) return op.relate;
  if ('unrelate' in op) return op.unrelate;
  return undefined;
}

function validateRelationFixOps(input: ApplyYSchemaFixOpsInput):
  | { ok: true }
  | {
      ok: false;
      error: YOpsError;
      validation: ValidationResult;
    } {
  for (let index = 0; index < input.ops.length; index++) {
    const relation = relationFromFixOp(input.ops[index] as YSchemaFixOp);
    if (relation === undefined) continue;

    const validation = validateTree({
      schema: input.schema,
      tree: treesToYValue(input.content.trees),
      relations: [relation],
      provenanceByPath: input.provenanceByPath,
    });
    const relationError = validation.errors.find((error) => error.path === '$relations');
    if (relationError !== undefined) {
      return {
        ok: false,
        validation,
        error: {
          code: relationError.code,
          message: relationError.message,
          op_index: index,
        },
      };
    }
  }

  return { ok: true };
}

function firstBlockingValidationError(
  validation: ValidationResult,
  requireReady: boolean
): { code: string; message: string } | undefined {
  const error = validation.errors[0];
  if (error !== undefined) {
    return { code: error.code, message: error.message };
  }
  if (requireReady && !validation.ready) {
    const gap = validation.gaps[0];
    return {
      code: gap?.code ?? 'YSCHEMA_NOT_READY',
      message: gap?.message ?? 'YSchema validation is not ready for commit.',
    };
  }
  return undefined;
}
