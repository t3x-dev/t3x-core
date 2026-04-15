import { YOpSchema as GenericYOpSchema, validateOps as genericValidateOps } from '@t3x-dev/yops';
import { z } from 'zod';
import { RELATION_TYPES } from '../semantic/types';

const RelationTypeSchema = z.enum(RELATION_TYPES as unknown as [string, ...string[]]);

const RelateOpSchema = z
  .object({
    relate: z
      .object({
        from: z.string().min(1),
        to: z.string().min(1),
        type: RelationTypeSchema,
      })
      .strict(),
  })
  .strict();

const UnrelateOpSchema = z
  .object({
    unrelate: z
      .object({
        from: z.string().min(1),
        to: z.string().min(1),
        type: RelationTypeSchema,
      })
      .strict(),
  })
  .strict();

export const YOpSchema = z.union([GenericYOpSchema, RelateOpSchema, UnrelateOpSchema]);
export const YOpsDocumentSchema = z.object({ yops: z.array(YOpSchema).min(1) }).strict();
export { genericValidateOps as validateGenericOps };
