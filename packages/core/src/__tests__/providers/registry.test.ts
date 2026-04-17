import { describe, expect, it, vi } from 'vitest';
import { GenerationError } from '../../leaf/generate';
import { AllProvidersFailedError, createProviderRegistry } from '../../providers/registry';

describe('ProviderRegistry', () => {
  describe('config overrides', () => {
    it('recomputes active role assignments when a later provider becomes configured', () => {
      const reg = createProviderRegistry();

      reg.register({
        id: 'provider-a',
        name: 'Provider A',
        role: 'generation',
        requiredEnvKeys: ['T3X_PROVIDER_A_KEY'],
        factory: () => ({ id: 'provider-a', generate: vi.fn() }),
      });

      reg.register({
        id: 'provider-b',
        name: 'Provider B',
        role: 'generation',
        requiredEnvKeys: ['T3X_PROVIDER_B_KEY'],
        factory: () => ({ id: 'provider-b', generate: vi.fn() }),
      });

      expect(reg.getProviderIdsForRole('generation')).toEqual(['provider-a']);

      reg.setConfigOverrides({ T3X_PROVIDER_B_KEY: 'local-secret' });

      expect(reg.getProviderIdsForRole('generation')).toEqual(['provider-b']);
      expect(reg.getForRole('generation')?.id).toBe('provider-b');
    });

    it('prefers config overrides over process.env while preserving env fallback', () => {
      const envKey = 'T3X_TEST_PROVIDER_KEY';
      const original = process.env[envKey];
      delete process.env[envKey];

      try {
        const reg = createProviderRegistry();
        const factory = vi.fn((config) => ({ id: 'override-provider', generate: vi.fn(), config }));

        reg.register({
          id: 'override-provider',
          name: 'Override Provider',
          role: 'generation',
          requiredEnvKeys: [envKey],
          factory,
        });

        expect(reg.isConfigured('override-provider')).toBe(false);
        expect(reg.getById('override-provider')).toBeNull();
        expect(factory).not.toHaveBeenCalled();

        process.env[envKey] = 'env-secret';
        expect(reg.isConfigured('override-provider')).toBe(true);

        const envProvider = reg.getById('override-provider');
        expect(envProvider).not.toBeNull();
        expect(factory).toHaveBeenCalledWith({ [envKey]: 'env-secret' });

        reg.setConfigOverrides({ [envKey]: 'local-secret' });

        expect(reg.isConfigured('override-provider')).toBe(true);
        const overrideProvider = reg.getById('override-provider');
        expect(overrideProvider).not.toBeNull();
        expect(factory).toHaveBeenLastCalledWith({ [envKey]: 'local-secret' });
      } finally {
        if (original === undefined) {
          delete process.env[envKey];
        } else {
          process.env[envKey] = original;
        }
      }
    });
  });

  describe('tryWithFallback', () => {
    function createTestRegistry() {
      const reg = createProviderRegistry();

      // Register two mock generation providers
      reg.register({
        id: 'provider-a',
        name: 'Provider A',
        role: 'generation',
        requiredEnvKeys: [],
        factory: () => ({
          id: 'provider-a',
          generate: vi.fn(),
        }),
      });

      reg.register({
        id: 'provider-b',
        name: 'Provider B',
        role: 'generation',
        requiredEnvKeys: [],
        factory: () => ({
          id: 'provider-b',
          generate: vi.fn(),
        }),
      });

      reg.assignRole('generation', ['provider-a', 'provider-b']);
      return reg;
    }

    it('should return result from first provider on success', async () => {
      const reg = createTestRegistry();

      const result = await reg.tryWithFallback('generation', async () => {
        return 'success from A';
      });

      expect(result).toBe('success from A');
    });

    it('should fallback to next provider on retryable error', async () => {
      const reg = createTestRegistry();
      let callCount = 0;

      const result = await reg.tryWithFallback('generation', async () => {
        callCount++;
        if (callCount === 1) {
          throw new GenerationError('Rate limited', 'RATE_LIMIT', 429);
        }
        return 'success from B';
      });

      expect(result).toBe('success from B');
      expect(callCount).toBe(2);
    });

    it('should throw immediately on non-retryable error', async () => {
      const reg = createTestRegistry();
      let callCount = 0;

      await expect(
        reg.tryWithFallback('generation', async () => {
          callCount++;
          throw new GenerationError('Bad key', 'AUTH_ERROR', 401);
        })
      ).rejects.toThrow('Bad key');

      // Should NOT try provider B
      expect(callCount).toBe(1);
    });

    it('should throw AllProvidersFailedError when all fail with retryable errors', async () => {
      const reg = createTestRegistry();

      await expect(
        reg.tryWithFallback('generation', async () => {
          throw new GenerationError('Overloaded', 'OVERLOADED', 503);
        })
      ).rejects.toThrow(AllProvidersFailedError);
    });

    it('should throw AllProvidersFailedError when no providers assigned', async () => {
      const reg = createProviderRegistry();

      await expect(reg.tryWithFallback('generation', async () => 'ok')).rejects.toThrow(
        AllProvidersFailedError
      );
    });

    it('should fallback on NETWORK_ERROR', async () => {
      const reg = createTestRegistry();
      let callCount = 0;

      const result = await reg.tryWithFallback('generation', async () => {
        callCount++;
        if (callCount === 1) {
          throw new GenerationError('Network timeout', 'NETWORK_ERROR');
        }
        return 'recovered';
      });

      expect(result).toBe('recovered');
    });

    it('should fallback on SERVER_ERROR', async () => {
      const reg = createTestRegistry();
      let callCount = 0;

      const result = await reg.tryWithFallback('generation', async () => {
        callCount++;
        if (callCount === 1) {
          throw new GenerationError('Internal error', 'SERVER_ERROR', 500);
        }
        return 'recovered';
      });

      expect(result).toBe('recovered');
    });

    it('should treat generic errors (no code) as retryable', async () => {
      const reg = createTestRegistry();
      let callCount = 0;

      const result = await reg.tryWithFallback('generation', async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Unknown failure');
        }
        return 'recovered';
      });

      expect(result).toBe('recovered');
      expect(callCount).toBe(2);
    });
  });

  describe('getProviderIdsForRole', () => {
    it('should return assigned provider IDs', () => {
      const reg = createProviderRegistry();
      reg.register({
        id: 'test-provider',
        name: 'Test',
        role: 'generation',
        requiredEnvKeys: [],
        factory: () => ({ id: 'test', generate: vi.fn() }),
      });

      const ids = reg.getProviderIdsForRole('generation');
      expect(ids).toEqual(['test-provider']);
    });

    it('should return empty array for unassigned role', () => {
      const reg = createProviderRegistry();
      const ids = reg.getProviderIdsForRole('embedding');
      expect(ids).toEqual([]);
    });
  });
});
