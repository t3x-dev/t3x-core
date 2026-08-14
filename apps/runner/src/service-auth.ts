import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_QUERY = 'runner_signature';

function configuredToken(): string | undefined {
  const token = process.env.RUNNER_SERVICE_TOKEN ?? process.env.RUNNER_SECRET;
  return token && token.length > 0 ? token : undefined;
}

function equalSecret(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return (
    providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes)
  );
}

export function runnerServiceToken(): string | undefined {
  return configuredToken();
}

export function verifyRunnerBearer(
  authorization: string | undefined
): 'ok' | 'missing-config' | 'invalid' {
  const token = configuredToken();
  if (!token) return 'missing-config';
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return equalSecret(match?.[1], token) ? 'ok' : 'invalid';
}

export function signN8nCallback(runId: string, runnerRunId: string): string {
  const token = configuredToken();
  if (!token) throw new Error('RUNNER_SERVICE_TOKEN is not configured');
  return createHmac('sha256', token)
    .update(runId + ':' + runnerRunId)
    .digest('hex');
}

export function buildSignedN8nCallbackUrl(
  callbackUrl: string,
  runId: string,
  runnerRunId: string
): string {
  const url = new URL(callbackUrl);
  url.searchParams.set(SIGNATURE_QUERY, signN8nCallback(runId, runnerRunId));
  return url.toString();
}

export function verifyN8nCallbackSignature(
  provided: string | undefined,
  runId: string | undefined,
  runnerRunId: string | undefined
): 'ok' | 'missing-config' | 'invalid' {
  const token = configuredToken();
  if (!token) return 'missing-config';
  if (!runId || !runnerRunId) return 'invalid';
  return equalSecret(provided, signN8nCallback(runId, runnerRunId)) ? 'ok' : 'invalid';
}

export const runnerSignatureQuery = SIGNATURE_QUERY;
