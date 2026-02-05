/**
 * CLI Utils Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSpinner,
  error,
  formatDate,
  getApiUrl,
  info,
  printTable,
  success,
  truncate,
  warn,
} from '../utils.js';

describe('CLI Utils', () => {
  // =========================================================================
  // formatDate
  // =========================================================================
  describe('formatDate', () => {
    it('formats ISO date string', () => {
      const result = formatDate('2024-01-15T10:30:00Z');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('handles date with timezone', () => {
      const result = formatDate('2024-06-01T14:00:00+09:00');
      expect(typeof result).toBe('string');
    });
  });

  // =========================================================================
  // truncate
  // =========================================================================
  describe('truncate', () => {
    it('returns string unchanged if under max length', () => {
      expect(truncate('hello', 10)).toBe('hello');
    });

    it('returns string unchanged if exactly max length', () => {
      expect(truncate('hello', 5)).toBe('hello');
    });

    it('truncates with ellipsis when over max length', () => {
      expect(truncate('hello world', 8)).toBe('hello...');
    });

    it('handles very short maxLength', () => {
      const result = truncate('abcdefgh', 4);
      expect(result).toBe('a...');
      expect(result.length).toBe(4);
    });

    it('handles empty string', () => {
      expect(truncate('', 10)).toBe('');
    });
  });

  // =========================================================================
  // getApiUrl
  // =========================================================================
  describe('getApiUrl', () => {
    const originalEnv = process.env.T3X_API_URL;

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env.T3X_API_URL = originalEnv;
      } else {
        delete process.env.T3X_API_URL;
      }
    });

    it('returns default when env not set', () => {
      delete process.env.T3X_API_URL;
      expect(getApiUrl()).toBe('http://localhost:8000/api');
    });

    it('returns env value when set', () => {
      process.env.T3X_API_URL = 'http://custom:9000/api';
      expect(getApiUrl()).toBe('http://custom:9000/api');
    });
  });

  // =========================================================================
  // Output functions (success, error, warn, info)
  // =========================================================================
  describe('output functions', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      logSpy.mockRestore();
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('success logs to console.log', () => {
      success('Done!');
      expect(logSpy).toHaveBeenCalledTimes(1);
      const output = logSpy.mock.calls[0][1];
      expect(output).toBe('Done!');
    });

    it('error logs to console.error', () => {
      error('Failed!');
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const output = errorSpy.mock.calls[0][1];
      expect(output).toBe('Failed!');
    });

    it('warn logs to console.warn', () => {
      warn('Careful!');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const output = warnSpy.mock.calls[0][1];
      expect(output).toBe('Careful!');
    });

    it('info logs to console.log', () => {
      info('Note!');
      expect(logSpy).toHaveBeenCalledTimes(1);
      const output = logSpy.mock.calls[0][1];
      expect(output).toBe('Note!');
    });
  });

  // =========================================================================
  // printTable
  // =========================================================================
  describe('printTable', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      logSpy.mockRestore();
    });

    it('prints formatted table', () => {
      printTable({
        columns: ['Name', 'Value'],
        rows: [
          ['key1', 'val1'],
          ['key2', 'val2'],
        ],
      });
      expect(logSpy).toHaveBeenCalledTimes(1);
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toContain('key1');
      expect(output).toContain('val1');
    });

    it('prints table with empty rows', () => {
      printTable({ columns: ['A', 'B'], rows: [] });
      expect(logSpy).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // createSpinner
  // =========================================================================
  describe('createSpinner', () => {
    it('creates spinner with text', () => {
      const spinner = createSpinner('Loading...');
      expect(spinner).toBeDefined();
      expect(typeof spinner.start).toBe('function');
      expect(typeof spinner.stop).toBe('function');
    });
  });
});
