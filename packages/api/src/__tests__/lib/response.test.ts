/**
 * Response Helpers Tests
 */

import { describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonError, jsonSuccess, successResponse } from '../../lib/response';

describe('successResponse', () => {
  it('creates success wrapper', () => {
    const result = successResponse({ id: '123' });
    expect(result).toEqual({ success: true, data: { id: '123' } });
  });

  it('handles null data', () => {
    const result = successResponse(null);
    expect(result).toEqual({ success: true, data: null });
  });

  it('handles array data', () => {
    const result = successResponse([1, 2, 3]);
    expect(result).toEqual({ success: true, data: [1, 2, 3] });
  });
});

describe('errorResponse', () => {
  it('creates error wrapper', () => {
    const result = errorResponse('NOT_FOUND', 'Resource not found');
    expect(result).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Resource not found' },
    });
  });
});

describe('jsonSuccess', () => {
  it('calls c.json with success response and 200', () => {
    const mockJson = vi.fn();
    const c = { json: mockJson } as unknown as Parameters<typeof jsonSuccess>[0];
    jsonSuccess(c, { id: '123' });
    expect(mockJson).toHaveBeenCalledWith({ success: true, data: { id: '123' } }, 200);
  });

  it('accepts custom 201 status', () => {
    const mockJson = vi.fn();
    const c = { json: mockJson } as unknown as Parameters<typeof jsonSuccess>[0];
    jsonSuccess(c, { id: '123' }, 201);
    expect(mockJson).toHaveBeenCalledWith({ success: true, data: { id: '123' } }, 201);
  });
});

describe('jsonError', () => {
  it('calls c.json with error response and default 500', () => {
    const mockJson = vi.fn();
    const c = { json: mockJson } as unknown as Parameters<typeof jsonError>[0];
    jsonError(c, 'INTERNAL', 'Something broke');
    expect(mockJson).toHaveBeenCalledWith(
      { success: false, error: { code: 'INTERNAL', message: 'Something broke' } },
      500
    );
  });

  it('accepts custom status code', () => {
    const mockJson = vi.fn();
    const c = { json: mockJson } as unknown as Parameters<typeof jsonError>[0];
    jsonError(c, 'NOT_FOUND', 'Not found', 404);
    expect(mockJson).toHaveBeenCalledWith(
      { success: false, error: { code: 'NOT_FOUND', message: 'Not found' } },
      404
    );
  });
});
