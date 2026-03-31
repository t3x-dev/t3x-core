/**
 * YOps JSON Schema export.
 *
 * Converts YOpSchema (Zod with .describe()) to JSON Schema.
 * Descriptions flow through automatically — no post-processing needed.
 */

import { z } from 'zod';
import { YOpSchema } from './schema';

const JSON_SCHEMA_TARGET = 'draft-2020-12' as const;

export function getYOpsJsonSchema() {
  return z.toJSONSchema(YOpSchema, { target: JSON_SCHEMA_TARGET });
}
