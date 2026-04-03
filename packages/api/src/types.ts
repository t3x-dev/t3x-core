import type { ApiKey } from '@t3x-dev/core';

/**
 * Hono environment type extension.
 *
 * Variables set by middleware and accessible via `c.get(key)`:
 * - `apiKey`: Set by auth middleware after successful API key validation
 */
export type AppEnv = {
  Variables: {
    apiKey?: ApiKey;
    /** Authenticated user ID. Set by auth middleware (JWT or API Key path). Undefined when AUTH_DISABLED=true. */
    userId?: string;
  };
};
