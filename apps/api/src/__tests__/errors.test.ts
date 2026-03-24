import { describe, expect, it, vi } from 'vitest';
import {
  createError,
  type ErrorCode,
  ErrorCodes,
  ErrorStatusCodes,
  formatZodErrors,
  zodErrorHook,
} from '../lib/errors';

describe('ErrorCodes', () => {
  it('has 62 error codes', () => {
    expect(Object.keys(ErrorCodes)).toHaveLength(62);
  });

  it('key equals value for every code', () => {
    for (const [key, value] of Object.entries(ErrorCodes)) {
      expect(value).toBe(key);
    }
  });

  it('matches snapshot to prevent accidental changes', () => {
    expect(ErrorCodes).toMatchInlineSnapshot(`
      {
        "ALREADY_COMMITTED": "ALREADY_COMMITTED",
        "API_KEY_NOT_FOUND": "API_KEY_NOT_FOUND",
        "API_KEY_REVOKED": "API_KEY_REVOKED",
        "AUTH_ERROR": "AUTH_ERROR",
        "AUTOPILOT_CONFIG_INVALID": "AUTOPILOT_CONFIG_INVALID",
        "COMMIT_NOT_FOUND": "COMMIT_NOT_FOUND",
        "COMMIT_VERSION_UNSUPPORTED": "COMMIT_VERSION_UNSUPPORTED",
        "COMPARE_FAILED": "COMPARE_FAILED",
        "CONFLICT": "CONFLICT",
        "CONVERSATION_NOT_FOUND": "CONVERSATION_NOT_FOUND",
        "CREATE_FAILED": "CREATE_FAILED",
        "DATABASE_ERROR": "DATABASE_ERROR",
        "DELETE_FAILED": "DELETE_FAILED",
        "DRAFT_NOT_FOUND": "DRAFT_NOT_FOUND",
        "DUPLICATE_PIN": "DUPLICATE_PIN",
        "EMBEDDER_NOT_CONFIGURED": "EMBEDDER_NOT_CONFIGURED",
        "EMBEDDINGS_REQUIRED": "EMBEDDINGS_REQUIRED",
        "EXTRACTION_FAILED": "EXTRACTION_FAILED",
        "FORBIDDEN": "FORBIDDEN",
        "GENERATION_FAILED": "GENERATION_FAILED",
        "GENERATION_NOT_CONFIGURED": "GENERATION_NOT_CONFIGURED",
        "GET_FAILED": "GET_FAILED",
        "GRAPH_BUILD_FAILED": "GRAPH_BUILD_FAILED",
        "GRAPH_NODE_NOT_FOUND": "GRAPH_NODE_NOT_FOUND",
        "GRAPH_NOT_BUILT": "GRAPH_NOT_BUILT",
        "HASH_CONFLICT": "HASH_CONFLICT",
        "HISTORY_FAILED": "HISTORY_FAILED",
        "HISTORY_MISMATCH": "HISTORY_MISMATCH",
        "HISTORY_NOT_FOUND": "HISTORY_NOT_FOUND",
        "INTERNAL_ERROR": "INTERNAL_ERROR",
        "INVALID_REQUEST": "INVALID_REQUEST",
        "INVALID_STATUS": "INVALID_STATUS",
        "LEAF_NOT_FOUND": "LEAF_NOT_FOUND",
        "LEARN_FAILED": "LEARN_FAILED",
        "LIST_FAILED": "LIST_FAILED",
        "LLM_NOT_CONFIGURED": "LLM_NOT_CONFIGURED",
        "MAIN_NOT_HEAD": "MAIN_NOT_HEAD",
        "MAIN_ROOT_EXISTS": "MAIN_ROOT_EXISTS",
        "MERGE_FAILED": "MERGE_FAILED",
        "NOT_FOUND": "NOT_FOUND",
        "NO_OUTPUT": "NO_OUTPUT",
        "PARENT_NOT_FOUND": "PARENT_NOT_FOUND",
        "PIN_NOT_FOUND": "PIN_NOT_FOUND",
        "PROJECT_NOT_FOUND": "PROJECT_NOT_FOUND",
        "PROMOTE_FAILED": "PROMOTE_FAILED",
        "RATE_LIMITED": "RATE_LIMITED",
        "REFERENCE_NOT_FOUND": "REFERENCE_NOT_FOUND",
        "RESTORE_FAILED": "RESTORE_FAILED",
        "REVIEW_ACTION_FAILED": "REVIEW_ACTION_FAILED",
        "SEARCH_FAILED": "SEARCH_FAILED",
        "SEMANTIC_NOT_CONFIGURED": "SEMANTIC_NOT_CONFIGURED",
        "SEMANTIC_NOT_SUPPORTED": "SEMANTIC_NOT_SUPPORTED",
        "SHARE_ENTITY_NOT_FOUND": "SHARE_ENTITY_NOT_FOUND",
        "SHARE_TOKEN_NOT_FOUND": "SHARE_TOKEN_NOT_FOUND",
        "SUGGEST_FAILED": "SUGGEST_FAILED",
        "TOO_MANY_REQUESTS": "TOO_MANY_REQUESTS",
        "UNAUTHORIZED": "UNAUTHORIZED",
        "UNRESOLVED_PAIRS": "UNRESOLVED_PAIRS",
        "UPDATE_FAILED": "UPDATE_FAILED",
        "VALIDATION_FAILED": "VALIDATION_FAILED",
        "VERIFY_FAILED": "VERIFY_FAILED",
        "WEBHOOK_NOT_FOUND": "WEBHOOK_NOT_FOUND",
      }
    `);
  });
});

describe('ErrorStatusCodes', () => {
  it('has a status code for every error code', () => {
    const codeKeys = Object.keys(ErrorCodes);
    const statusKeys = Object.keys(ErrorStatusCodes);
    expect(statusKeys.sort()).toEqual(codeKeys.sort());
  });

  it('maps NOT_FOUND variants to 404', () => {
    const notFoundCodes: ErrorCode[] = [
      'NOT_FOUND',
      'PROJECT_NOT_FOUND',
      'COMMIT_NOT_FOUND',
      'LEAF_NOT_FOUND',
      'PIN_NOT_FOUND',
      'CONVERSATION_NOT_FOUND',
      'HISTORY_NOT_FOUND',
      'GRAPH_NODE_NOT_FOUND',
    ];
    for (const code of notFoundCodes) {
      expect(ErrorStatusCodes[code]).toBe(404);
    }
  });

  it('maps conflict codes to 409', () => {
    expect(ErrorStatusCodes.DUPLICATE_PIN).toBe(409);
    expect(ErrorStatusCodes.HASH_CONFLICT).toBe(409);
    expect(ErrorStatusCodes.MAIN_NOT_HEAD).toBe(409);
    expect(ErrorStatusCodes.MAIN_ROOT_EXISTS).toBe(409);
  });

  it('maps operation failures to 500', () => {
    const serverCodes: ErrorCode[] = [
      'CREATE_FAILED',
      'UPDATE_FAILED',
      'DELETE_FAILED',
      'GET_FAILED',
      'LIST_FAILED',
      'INTERNAL_ERROR',
      'DATABASE_ERROR',
      'GENERATION_FAILED',
      'HISTORY_FAILED',
      'SUGGEST_FAILED',
      'PROMOTE_FAILED',
      'REVIEW_ACTION_FAILED',
      'RESTORE_FAILED',
      'COMPARE_FAILED',
      'MERGE_FAILED',
      'GRAPH_BUILD_FAILED',
    ];
    for (const code of serverCodes) {
      expect(ErrorStatusCodes[code]).toBe(500);
    }
  });

  it('maps RATE_LIMITED to 429', () => {
    expect(ErrorStatusCodes.RATE_LIMITED).toBe(429);
  });

  it('maps AUTH_ERROR to 401', () => {
    expect(ErrorStatusCodes.AUTH_ERROR).toBe(401);
  });
});

describe('createError', () => {
  it('returns correct structure without details', () => {
    const result = createError('INVALID_REQUEST', 'Missing field');
    expect(result).toEqual({
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'Missing field',
      },
    });
  });

  it('includes details when provided', () => {
    const result = createError('VALIDATION_FAILED', 'Bad input', {
      field: 'name',
      reason: 'too short',
    });
    expect(result).toEqual({
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Bad input',
        details: { field: 'name', reason: 'too short' },
      },
    });
  });

  it('omits details key when undefined', () => {
    const result = createError('NOT_FOUND', 'Resource not found');
    expect(result.error).not.toHaveProperty('details');
  });

  it('resolves code value from ErrorCodes map', () => {
    const result = createError('PROJECT_NOT_FOUND', 'No project');
    expect(result.error.code).toBe('PROJECT_NOT_FOUND');
  });
});

describe('formatZodErrors', () => {
  it('formats a single issue', () => {
    const result = formatZodErrors([{ path: ['name'], message: 'Required' }]);
    expect(result).toBe('name: Required');
  });

  it('formats multiple issues joined by semicolons', () => {
    const result = formatZodErrors([
      { path: ['name'], message: 'Required' },
      { path: ['content', 'sentences'], message: 'Must be array' },
    ]);
    expect(result).toBe('name: Required; content.sentences: Must be array');
  });

  it('handles nested numeric paths', () => {
    const result = formatZodErrors([{ path: ['items', 0, 'id'], message: 'Invalid' }]);
    expect(result).toBe('items.0.id: Invalid');
  });

  it('returns empty string for empty issues', () => {
    expect(formatZodErrors([])).toBe('');
  });
});

describe('zodErrorHook', () => {
  it('returns error response for failed validation', () => {
    const mockJson = vi.fn();
    const mockContext = { json: mockJson } as unknown as Parameters<typeof zodErrorHook>[1];

    zodErrorHook(
      {
        success: false,
        error: { issues: [{ path: ['name'], message: 'Required' }] },
      },
      mockContext
    );

    expect(mockJson).toHaveBeenCalledWith(
      {
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'name: Required' },
      },
      400
    );
  });

  it('returns undefined for successful validation', () => {
    const mockContext = { json: vi.fn() } as unknown as Parameters<typeof zodErrorHook>[1];

    const result = zodErrorHook({ success: true }, mockContext);

    expect(result).toBeUndefined();
    // biome-ignore lint/suspicious/noExplicitAny: test mock access
    expect((mockContext as any).json).not.toHaveBeenCalled();
  });
});
