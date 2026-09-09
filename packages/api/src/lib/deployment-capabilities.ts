import {
  type DeploymentCapabilities,
  DeploymentCapabilitiesSchema,
  SELF_HOSTED_DEPLOYMENT_CAPABILITIES,
  UNAVAILABLE_DEPLOYMENT_CAPABILITIES,
} from '@t3x-dev/api-client';
import type { MiddlewareHandler } from 'hono';

export type DeploymentCapabilitiesSource =
  | DeploymentCapabilities
  | (() => unknown | Promise<unknown>);

type DeploymentCapabilitiesContext = {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
};

const SOURCE_CONTEXT_KEY = 'deploymentCapabilitiesSource';
const RESOLVED_CONTEXT_KEY = 'deploymentCapabilities';

function asCapabilitiesContext(context: unknown): DeploymentCapabilitiesContext {
  return context as DeploymentCapabilitiesContext;
}

/** Fail closed when a deployment adapter is absent, stale, or version-incompatible. */
export function parseDeploymentCapabilities(value: unknown): DeploymentCapabilities {
  const parsed = DeploymentCapabilitiesSchema.safeParse(value);
  return parsed.success ? parsed.data : UNAVAILABLE_DEPLOYMENT_CAPABILITIES;
}

async function readSource(source: DeploymentCapabilitiesSource): Promise<DeploymentCapabilities> {
  try {
    const value = typeof source === 'function' ? await source() : source;
    return parseDeploymentCapabilities(value);
  } catch {
    return UNAVAILABLE_DEPLOYMENT_CAPABILITIES;
  }
}

/** Install a lazy source without putting unrelated routes behind the adapter. */
export function createDeploymentCapabilitiesMiddleware(
  source: DeploymentCapabilitiesSource = SELF_HOSTED_DEPLOYMENT_CAPABILITIES
): MiddlewareHandler {
  return async (context, next) => {
    asCapabilitiesContext(context).set(SOURCE_CONTEXT_KEY, source);
    await next();
  };
}

/** Resolve at most once for a request. Missing context is always unavailable. */
export async function getDeploymentCapabilities(context: unknown): Promise<DeploymentCapabilities> {
  const capabilityContext = asCapabilitiesContext(context);
  const resolved = capabilityContext.get(RESOLVED_CONTEXT_KEY);
  if (resolved !== undefined) return parseDeploymentCapabilities(resolved);

  const source = capabilityContext.get(SOURCE_CONTEXT_KEY);
  if (source === undefined) return UNAVAILABLE_DEPLOYMENT_CAPABILITIES;
  const capabilities = await readSource(source as DeploymentCapabilitiesSource);
  capabilityContext.set(RESOLVED_CONTEXT_KEY, capabilities);
  return capabilities;
}
