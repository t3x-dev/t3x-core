import { describe, expect, it } from 'vitest';
import { toYSchemaValidationSummary } from '@/domain/project/yschemaValidation';

describe('YSchema validation summary', () => {
  it('retains exact paths for both hard errors and readiness gaps', () => {
    const summary = toYSchemaValidationSummary({
      commit_hash: 'sha256:prompt',
      created_at: '2026-07-30T08:00:00.000Z',
      error_count: 1,
      finished_at: '2026-07-30T08:00:01.000Z',
      fix_count: 0,
      gap_count: 1,
      id: 'ysvr_prompt',
      ready: false,
      result: {
        validation: {
          errors: [
            {
              code: 'INVALID_TYPE',
              message: 'Template must be a string.',
              path: 'messages/system_policy/template',
            },
          ],
          gaps: [
            {
              code: 'REQUIRED_SLOT_MISSING',
              message: 'Variable source is required.',
              path: 'variables/user_request/source',
            },
          ],
        },
      },
      schema_name: 't3x/prompt',
      status: 'failed',
      valid: false,
    });

    expect(summary?.gaps).toEqual([
      expect.objectContaining({ path: 'variables/user_request/source' }),
    ]);
    expect(summary?.issues).toEqual([
      expect.objectContaining({ code: 'INVALID_TYPE', path: 'messages/system_policy/template' }),
      expect.objectContaining({
        code: 'REQUIRED_SLOT_MISSING',
        path: 'variables/user_request/source',
      }),
    ]);
  });
});
