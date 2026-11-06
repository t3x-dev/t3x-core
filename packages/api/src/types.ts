import type { RequestPrincipal } from '@t3x-dev/application';
import type { ApiKey } from '@t3x-dev/core';
import type { WebSession } from '@t3x-dev/storage';
import type { InferenceIngressChannel } from './lib/inference';
import type { ProjectLifecyclePolicy } from './lib/project-lifecycle-policy';
import type { RateLimitStore } from './middleware/rate-limit';

/**
 * Hono environment type extension.
 *
 * Variables set by middleware and accessible via `c.get(key)`:
 * - `apiKey`: Set by auth middleware after successful API key validation
 */
export type AppEnv = {
  Variables: {
    apiKey?: ApiKey;
    /** Active browser session set by auth middleware. */
    session?: WebSession;
    /** Server-derived identity shared by every authenticated ingress. */
    requestPrincipal?: RequestPrincipal;
    /** Authenticated user ID. Set by auth middleware (JWT or API Key path). Undefined when AUTH_DISABLED=true. */
    userId?: string;
    /** Trusted host classification for inference admission; never copied from request payloads. */
    inferenceIngressChannel?: InferenceIngressChannel;
    /** Shared counter backend selected by createApp. */
    rateLimitStore?: RateLimitStore;
    /** Host-owned policy around project admissions into a namespace. */
    projectLifecyclePolicy?: ProjectLifecyclePolicy;
  };
};
