import { YOpSchema as GenericYOpSchema, validateOps as genericValidateOps } from '@t3x-dev/yops';
import { z } from 'zod';

const RelationKeySchema = z.string().regex(/^[a-z][a-z0-9_]*$/);

const RelateOpSchema = z
  .object({
    relate: z
      .object({
        from: z.string().min(1),
        to: z.string().min(1),
        type: RelationKeySchema,
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
        type: RelationKeySchema,
      })
      .strict(),
  })
  .strict();

export const YOpSchema = z.union([GenericYOpSchema, RelateOpSchema, UnrelateOpSchema]);
export const YOpsDocumentSchema = z.object({ yops: z.array(YOpSchema).min(1) }).strict();
export { genericValidateOps as validateGenericOps };
