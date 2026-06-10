import { describe, expect, it } from 'vitest';
import { formatUserFacingError } from '@/domain/format/errors';

describe('formatUserFacingError', () => {
  it('hides internal project ids from not-found messages', () => {
    expect(formatUserFacingError(new Error('Project proj_f195a06a not found'))).toBe(
      'This project is no longer available.'
    );
  });

  it('maps generic missing project messages', () => {
    expect(formatUserFacingError(new Error('Project not found'))).toBe(
      'This project is no longer available.'
    );
  });

  it('hides internal conversation ids from not-found messages', () => {
    expect(formatUserFacingError('Conversation temp_mq7nnk27_jhcswr not found')).toBe(
      'This conversation is no longer available.'
    );
  });

  it('maps missing resource error codes to stable copy', () => {
    expect(formatUserFacingError(new Error('COMMIT_NOT_FOUND'))).toBe(
      'This commit is no longer available.'
    );
  });

  it('uses stable network copy', () => {
    expect(formatUserFacingError(new TypeError('Failed to fetch'))).toBe(
      'Network request failed. Check your connection and try again.'
    );
  });

  it('maps generic 404 messages', () => {
    expect(formatUserFacingError('404 Not Found')).toBe(
      'The requested resource is no longer available.'
    );
  });

  it('preserves non-resource business errors', () => {
    expect(formatUserFacingError(new Error('Committed conversations cannot be deleted.'))).toBe(
      'Committed conversations cannot be deleted.'
    );
  });
});
