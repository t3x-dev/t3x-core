/**
 * Health API Route Tests
 *
 * Tests GET /api/v1/health endpoint.
 */

import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/v1/health/route';

describe('Health API Route', () => {
  describe('GET /api/v1/health', () => {
    it('returns health status', async () => {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.version).toBe('1.0.0');
      expect(typeof data.uptime).toBe('number');
      expect(data.uptime).toBeGreaterThanOrEqual(0);
    });
  });
});
